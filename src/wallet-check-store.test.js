const test = require("node:test");
const assert = require("node:assert");
const Database = require("better-sqlite3");
const { createWalletCheckStore, RECHECK_AFTER_PAY_MS } = require("./wallet-check-store");
const { createWalletChecker } = require("./wallet-checker");

const HOUR = 3600e3;

function makeStore(start = 1000 * HOUR) {
  let clock = start;
  const store = createWalletCheckStore(new Database(":memory:"), { now: () => clock });
  return { store, tick: (ms) => (clock += ms), now: () => clock };
}

test("a verdict is kept per address", () => {
  const { store } = makeStore();
  store.saveCheck("TA", "trc20", { kind: "exchange", platform: "Bybit", reject: true, reason: "r" });
  const got = store.getChecks(["TA", "TB"]);
  assert.equal(got.get("TA").kind, "exchange");
  assert.equal(got.get("TA").reject, true);
  assert.equal(got.has("TB"), false);
});

// The label must not go blank because a service did not answer once.
test("a failed check keeps the verdict it had", () => {
  const { store } = makeStore();
  store.saveCheck("TA", "trc20", { kind: "cashier", platform: "Pokerdom?", reject: false, reason: "r" });
  store.saveCheck("TA", "trc20", null, "429");
  const got = store.getChecks(["TA"]).get("TA");
  assert.equal(got.kind, "cashier");
  assert.equal(got.platform, "Pokerdom?");
  assert.equal(got.error, "429");
});

test("a fresh payout is checked on schedule, an old one at once", () => {
  const { store, tick, now } = makeStore();
  store.upsertPayout({ drawId: "d1", userId: 1, address: "TA", paidAt: now() });
  store.upsertPayout({ drawId: "d0", userId: 2, address: "TB", paidAt: now() - 30 * 24 * HOUR });
  assert.deepEqual(store.duePayouts().map((r) => r.drawId), ["d0"]);
  tick(RECHECK_AFTER_PAY_MS[0]);
  assert.deepEqual(store.duePayouts().map((r) => r.drawId).sort(), ["d0", "d1"]);
});

test("a prize taken past the project marks the person", () => {
  const { store, now } = makeStore();
  store.upsertPayout({ drawId: "d0", userId: 7, address: "TA", paidAt: now() - 30 * 24 * HOUR });
  const [row] = store.duePayouts();
  store.savePayoutOutcome(row, "exchange", "Bybit");
  assert.equal(store.flaggedUsers([7, 8]).get("7").platform, "Bybit");
  assert.equal(store.duePayouts().length, 0);
});

test("money still sitting is looked at again until the last check", () => {
  const { store, tick, now } = makeStore();
  const paidAt = now();
  store.upsertPayout({ drawId: "d1", userId: 1, address: "TA", paidAt });
  tick(RECHECK_AFTER_PAY_MS[0]);
  store.savePayoutOutcome(store.duePayouts()[0], "waiting", null);
  assert.equal(store.duePayouts().length, 0);
  tick(RECHECK_AFTER_PAY_MS[3]);
  const row = store.duePayouts()[0];
  store.savePayoutOutcome(row, "waiting", null);
  assert.equal(store.duePayouts().length, 0);
  assert.equal(store.flaggedUsers([1]).size, 0);
});

test("the background check labels the queue and follows payouts, a few at a time", async () => {
  const { store, now } = makeStore();
  const asked = [];
  const inspector = {
    async inspect(address) {
      asked.push(address);
      if (address === "TFAIL") throw new Error("429");
      return { network: "trc20", transfers: [], complete: true, selfTag: null, verdict: { kind: "new", platform: null, reject: false, reason: "" } };
    },
  };
  const checker = createWalletChecker({
    store,
    inspector,
    now,
    perTick: 3,
    listQueue: () => [{ address: "TQ1" }, { address: "TQ1" }, { address: "TFAIL" }, { address: "TQ2" }],
    listPayouts: () => [{ drawId: "d0", userId: 5, address: "TP", paidAt: now() - 30 * 24 * HOUR }],
    logger: { warn() {}, error() {} },
  });
  // The queue first: its labels are what the owner looks at before paying.
  await checker.tick();
  assert.deepEqual(asked, ["TQ1", "TFAIL", "TQ2"]);
  assert.equal(store.getChecks(["TFAIL"]).get("TFAIL").error, "429");
  asked.length = 0;
  await checker.tick();
  // Labelled ones wait for staleness, the failed one half an hour: the payout's turn.
  assert.deepEqual(asked, ["TP"]);
});

// The live panel redraws when the revision moves: a check that finds the same
// thing must not redraw every open payout queue.
test("the revision moves only when what the owner sees changes", () => {
  const { store, tick } = makeStore();
  store.saveCheck("TA", "trc20", { kind: "new", platform: null, reject: false, reason: "r" });
  const first = store.revision();
  tick(HOUR);
  store.saveCheck("TA", "trc20", { kind: "new", platform: null, reject: false, reason: "r" });
  assert.equal(store.revision(), first);
  tick(HOUR);
  store.saveCheck("TA", "trc20", null, "429");
  assert.equal(store.revision(), first);
  tick(HOUR);
  store.saveCheck("TA", "trc20", { kind: "cashier", platform: "Pokerdom?", reject: false, reason: "r" });
  assert.ok(store.revision() > first);
});

// A link through a shared wallet decides a prize: it is looked at first, one a
// tick, whatever the queue's rechecks would take.
test("a shared wallet is looked at every tick, however busy the queue", async () => {
  const { store, now } = makeStore();
  const looked = [];
  const inspector = {
    async inspect(address) {
      return { network: "trc20", transfers: [], complete: true, verdict: { kind: "new", platform: null, reject: false, reason: "" } };
    },
    async inspectParty(address) {
      looked.push(address);
      return { tag: null, distinctCount: 2 };
    },
  };
  store.saveCheck("TA1", "trc20", { kind: "new" }, null, [{ address: "TFRIEND", in: 1, out: 0 }]);
  store.saveCheck("TA2", "trc20", { kind: "new" }, null, [{ address: "TFRIEND", in: 1, out: 0 }]);
  const checker = createWalletChecker({
    store,
    inspector,
    now,
    perTick: 2,
    listQueue: () => [{ address: "TQ1" }, { address: "TQ2" }, { address: "TQ3" }],
    listPayouts: () => [],
    logger: { warn() {}, error() {} },
  });
  await checker.tick();
  assert.deepEqual(looked, ["TFRIEND"]);
  assert.equal(store.partyKinds().get("TFRIEND").kind, "small");
});
