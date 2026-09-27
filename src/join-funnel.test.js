const test = require("node:test");
const assert = require("node:assert");
const Database = require("better-sqlite3");
const {
  stagesFromJoinAnswer,
  stagesToMask,
  summarizeJoinFunnel,
  createJoinFunnelMiddleware,
  createJoinFunnelStore,
} = require("./join-funnel");

const DAY_MS = 24 * 60 * 60 * 1000;

test("opening the mini app counts, along with the step it shows", () => {
  assert.deepEqual(stagesFromJoinAnswer("session", { step: "captcha" }), ["opened", "captcha"]);
  assert.deepEqual(stagesFromJoinAnswer("captcha", { step: "channel" }), ["channel"]);
  assert.deepEqual(stagesFromJoinAnswer("project-id", { step: "trc20" }), ["trc20"]);
});

// The client holds that step behind «откройте бота» until the bot can write.
test("a step held back until the bot can write counts only as the notify stage", () => {
  assert.deepEqual(stagesFromJoinAnswer("session", { step: "captcha", needsWriteAccess: true }), [
    "opened",
    "notify",
  ]);
});

test("once the bot can write, the person is at their session's step", () => {
  assert.deepEqual(stagesFromJoinAnswer("notify-status", { canMessage: true }, { sessionStep: "captcha" }), ["captcha"]);
  assert.deepEqual(stagesFromJoinAnswer("notify-status", { canMessage: true }, { sessionStep: "await_trc20" }), ["trc20"]);
  assert.deepEqual(stagesFromJoinAnswer("notify-status", { canMessage: false }, { sessionStep: "captcha" }), []);
});

test("joining counts; being in the draw already does not", () => {
  assert.deepEqual(stagesFromJoinAnswer("trc20", { step: "done", alreadyJoined: false }), ["joined"]);
  assert.deepEqual(stagesFromJoinAnswer("session", { step: "done", alreadyJoined: false }), ["opened", "joined"]);
  assert.deepEqual(stagesFromJoinAnswer("session", { step: "done", alreadyJoined: true }), []);
  assert.deepEqual(stagesFromJoinAnswer("session", null), []);
});

test("each person who did not get in is counted once, at the furthest step they reached", () => {
  const rows = [
    { stages: stagesToMask(["opened", "captcha"]) },
    { stages: stagesToMask(["opened", "captcha", "channel"]) },
    { stages: stagesToMask(["opened", "notify"]) },
    { stages: stagesToMask(["opened", "notify", "captcha", "channel", "registration"]) },
    { stages: stagesToMask(["opened", "captcha", "registration", "trc20", "joined"]) },
    { stages: stagesToMask(["opened", "joined"]) },
  ];
  const summary = summarizeJoinFunnel(rows);
  assert.equal(summary.people, 6);
  assert.equal(summary.joined, 2);
  assert.equal(summary.instant, 1, "вошёл сразу, без шагов");
  assert.deepEqual(summary.stuck, { notify: 1, captcha: 1, channel: 1, registration: 1, trc20: 0 });
  assert.equal(summary.reached.captcha, 4);
  assert.equal(summary.reached.channel, 2);
});

function memoryStore(clock) {
  return createJoinFunnelStore(new Database(":memory:"), { now: () => clock.at });
}

test("a person's stages in a draw add up in one row", () => {
  const clock = { at: Date.parse("2026-09-01T10:00:00Z") };
  const store = memoryStore(clock);
  store.record("draw1", 7, ["opened", "captcha"]);
  clock.at += 60_000;
  store.record("draw1", 7, ["channel"]);
  store.record("draw1", 7, ["captcha"]);
  store.record("draw2", 7, ["opened", "joined"]);

  const rows = store.list();
  assert.equal(rows.length, 2);
  const first = rows.find((row) => row.drawId === "draw1");
  assert.equal(first.stages, stagesToMask(["opened", "captcha", "channel"]));
  assert.equal(first.firstAt, Date.parse("2026-09-01T10:00:00Z"), "время первого шага не сдвигается");
  assert.equal(store.trackedSince(), Date.parse("2026-09-01T10:00:00Z"));
});

test("nothing is written for an answer that adds no stage", () => {
  const store = memoryStore({ at: Date.now() });
  store.record("draw1", 7, []);
  store.record("", 7, ["opened"]);
  assert.equal(store.list().length, 0);
});

test("the period filter goes by when the person first opened the draw", () => {
  const clock = { at: Date.parse("2026-09-01T10:00:00Z") };
  const store = memoryStore(clock);
  store.record("old", 1, ["opened"]);
  clock.at += 10 * DAY_MS;
  store.record("new", 2, ["opened"]);
  assert.deepEqual(store.list({ since: clock.at - DAY_MS }).map((row) => row.drawId), ["new"]);
});

test("rows untouched for longer than the retention are dropped", () => {
  const clock = { at: Date.parse("2026-01-01T10:00:00Z") };
  const store = memoryStore(clock);
  store.record("old", 1, ["opened"]);
  clock.at += 91 * DAY_MS;
  store.record("new", 2, ["opened"]);
  assert.deepEqual(store.list().map((row) => row.drawId), ["new"]);
});

test("without a database nothing is kept and nothing breaks", () => {
  const store = createJoinFunnelStore(null);
  store.record("draw1", 7, ["opened"]);
  assert.deepEqual(store.list(), []);
  assert.equal(store.trackedSince(), null);
});

function fakeExchange(action, { method = "POST", userId = 7 } = {}) {
  const sent = [];
  const req = { method, params: { drawId: "draw1", action }, telegramUser: userId ? { id: userId } : null };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      sent.push(body);
      return this;
    },
  };
  return { req, res, sent };
}

function recordingStore() {
  const calls = [];
  return { calls, record: (drawId, userId, stages) => calls.push({ drawId, userId, stages }) };
}

test("each answer of the join API is noted and still sent as it was", () => {
  const store = recordingStore();
  const middleware = createJoinFunnelMiddleware({ store });
  const { req, res, sent } = fakeExchange("session");
  middleware(req, res, () => {});
  res.json({ step: "captcha" });
  assert.deepEqual(sent, [{ step: "captcha" }]);
  assert.deepEqual(store.calls, [{ drawId: "draw1", userId: 7, stages: ["opened", "captcha"] }]);
});

// /session wraps res.json once more to add needsWriteAccess; the funnel has to
// see the answer as it finally goes out.
test("an answer changed by the route on its way out is noted as sent", () => {
  const store = recordingStore();
  const { req, res } = fakeExchange("session");
  createJoinFunnelMiddleware({ store })(req, res, () => {});
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson({ ...body, needsWriteAccess: true });
  res.json({ step: "captcha" });
  assert.deepEqual(store.calls[0].stages, ["opened", "notify"]);
});

test("errors, other methods and non-step calls are not noted", () => {
  const store = recordingStore();
  const middleware = createJoinFunnelMiddleware({ store });

  const failed = fakeExchange("captcha");
  middleware(failed.req, failed.res, () => {});
  failed.res.status(400).json({ error: "Сессия устарела.", step: "captcha" });

  const polled = fakeExchange("live");
  middleware(polled.req, polled.res, () => {});
  polled.res.json({ participantCount: 3 });

  const anonymous = fakeExchange("session", { userId: null });
  middleware(anonymous.req, anonymous.res, () => {});
  anonymous.res.json({ step: "captcha" });

  assert.equal(store.calls.length, 0);
});

test("a failing store never breaks the answer", () => {
  const store = { record: () => { throw new Error("disk full"); } };
  const warnings = [];
  const { req, res, sent } = fakeExchange("trc20");
  createJoinFunnelMiddleware({ store, log: { warn: (message) => warnings.push(message) } })(req, res, () => {});
  res.json({ step: "done", alreadyJoined: false });
  assert.equal(sent.length, 1);
  assert.equal(warnings.length, 1);
});

test("the notify check moves the person to their session's step", () => {
  const store = recordingStore();
  const { req, res } = fakeExchange("notify-status");
  createJoinFunnelMiddleware({ store, getSessionStep: () => "channel" })(req, res, () => {});
  res.json({ canMessage: true });
  assert.deepEqual(store.calls[0].stages, ["channel"]);
});
