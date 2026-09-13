const test = require("node:test");
const assert = require("node:assert");
const {
  isParticipationUnregistered,
  isPrizeHalved,
  applyPrizeHalving,
} = require("./unregistered-participation");

const drawWith = (meta) => ({ id: "draw_1", participantMeta: meta });

test("an unregistered join halves the prize", () => {
  const draw = drawWith({ 1001: { unregistered: true } });
  assert.strictEqual(applyPrizeHalving(5000, draw, 1001, {}), 2500);
});

test("the choice belongs to one draw, not to the person", () => {
  // The whole point of not remembering it: registering before the next draw
  // has to bring the full prize back.
  const earlier = drawWith({ 1001: { unregistered: true } });
  const next = drawWith({ 1001: { ipHash: "abc" } });
  assert.strictEqual(isParticipationUnregistered(earlier, 1001), true);
  assert.strictEqual(isParticipationUnregistered(next, 1001), false);
  assert.strictEqual(applyPrizeHalving(5000, next, 1001, {}), 5000);
});

test("a non-referral profile still halves, as it always did", () => {
  assert.strictEqual(applyPrizeHalving(5000, drawWith({}), 1001, { selfReportedNonReferral: true }), 2500);
});

test("both at once is still half, not a quarter", () => {
  const draw = drawWith({ 1001: { unregistered: true } });
  assert.strictEqual(applyPrizeHalving(5000, draw, 1001, { selfReportedNonReferral: true }), 2500);
});

test("one person's choice does not touch another winner of the same draw", () => {
  const draw = drawWith({ 1001: { unregistered: true } });
  assert.strictEqual(applyPrizeHalving(5000, draw, 1002, {}), 5000);
});

test("ids compare the same whether they arrive as numbers or strings", () => {
  const draw = drawWith({ 1001: { unregistered: true } });
  assert.strictEqual(isParticipationUnregistered(draw, "1001"), true);
  assert.strictEqual(isParticipationUnregistered(draw, 1001), true);
});

test("a caller that does not say who the winner is gets the old behaviour", () => {
  // Every payout call site passes winnerId; one that does not must fall back
  // to the profile alone rather than guess.
  const draw = drawWith({ 1001: { unregistered: true } });
  assert.strictEqual(isPrizeHalved(draw, undefined, {}), false);
  assert.strictEqual(isPrizeHalved(draw, undefined, { selfReportedNonReferral: true }), true);
});

test("odd amounts round down, matching the non-referral cut", () => {
  const draw = drawWith({ 1001: { unregistered: true } });
  assert.strictEqual(applyPrizeHalving(25, draw, 1001, {}), 12);
});

test("a draw with no participant meta at all is not a crash", () => {
  assert.strictEqual(isParticipationUnregistered({}, 1001), false);
  assert.strictEqual(isParticipationUnregistered(null, 1001), false);
});
