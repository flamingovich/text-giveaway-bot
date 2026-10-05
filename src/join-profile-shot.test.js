const test = require("node:test");
const assert = require("node:assert");
const {
  PROFILE_SHOT_MAX_AGE_MS,
  isProfileShotRequired,
  needsProfileShot,
  settledStatusOf,
  refuseRegistrationAction,
  createPendingShots,
} = require("./join-profile-shot");

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const DRAW = { id: "d1", projectId: "brand_beef_1" };
const ON = {};
const fresh = { profileShotVerifiedAt: new Date(NOW - 60 * 60 * 1000).toISOString() };
const stale = { profileShotVerifiedAt: new Date(NOW - PROFILE_SHOT_MAX_AGE_MS - 1000).toISOString() };

test("the step is on unless .env turns it off", () => {
  assert.equal(isProfileShotRequired({}), true);
  assert.equal(isProfileShotRequired({ JOIN_PROFILE_SHOT: "false" }), false);
});

// The incident on the test bot: an old full profile let the owner into a
// draw that asks for a screenshot.
test("an old full profile without a screenshot goes through the step", () => {
  const ctx = { directProfile: { referralVerified: true, projectAccountId: "#W3N5E", trc20Address: "T…" } };
  assert.equal(needsProfileShot(DRAW, ctx, ON, NOW), true);
  assert.equal(needsProfileShot(DRAW, ctx, { JOIN_PROFILE_SHOT: "false" }, NOW), false);
});

test("a screenshot from this week is enough, on any of the brand's profiles", () => {
  assert.equal(needsProfileShot(DRAW, { directProfile: fresh }, ON, NOW), false);
  assert.equal(needsProfileShot(DRAW, { siblingSource: { projectData: fresh } }, ON, NOW), false);
});

test("a screenshot older than a week is asked for again", () => {
  assert.equal(needsProfileShot(DRAW, { directProfile: stale }, ON, NOW), true);
});

test("a draw without a project asks for nothing", () => {
  assert.equal(needsProfileShot({ id: "d2", projectId: null }, {}, ON, NOW), false);
});

test("the settled status is this organiser's own", () => {
  assert.equal(settledStatusOf({ directProfile: { verifiedStatus: "ref" } }), "ref");
  assert.equal(settledStatusOf({ directProfile: {}, effectiveProfile: { verifiedStatus: "nonref" } }), "");
  assert.equal(settledStatusOf({}), "");
});

// The owner's rule: a draw that asks for the screenshot is for people with an
// account - "Я не зарегистрирован" is gone from it, and refused if a stale page sends it.
test("'Я не зарегистрирован' is refused where the screenshot is asked", () => {
  assert.equal(refuseRegistrationAction(DRAW, "unregistered", ON).status, 409);
  assert.equal(refuseRegistrationAction({ ...DRAW, refOnly: true }, "unregistered", ON).status, 400);
  assert.equal(refuseRegistrationAction({ ...DRAW, refOnly: true }, "unregistered", { JOIN_PROFILE_SHOT: "false" }).status, 400);
  assert.equal(refuseRegistrationAction(DRAW, "unregistered", { JOIN_PROFILE_SHOT: "false" }), null);
});

// A page opened before the step came in must not be a way around it.
test("the other answers of the old step wait for a screenshot", () => {
  assert.equal(refuseRegistrationAction(DRAW, "non_ref", ON).status, 409);
  assert.equal(refuseRegistrationAction(DRAW, "opened", ON).status, 409);
  assert.equal(refuseRegistrationAction(DRAW, "non_ref", { JOIN_PROFILE_SHOT: "false" }), null);
  assert.equal(refuseRegistrationAction({ id: "d2", projectId: null }, "opened", ON), null);
});

test("a picture waits for confirmation half an hour at most", () => {
  let now = 0;
  const pending = createPendingShots({ ttlMs: 1000, now: () => now });
  pending.put("u:d", { accountId: "#W3N5E" });
  assert.equal(pending.peek("u:d").accountId, "#W3N5E");
  now = 1001;
  assert.equal(pending.take("u:d"), null);
});

test("a confirmed picture is taken once", () => {
  const pending = createPendingShots();
  pending.put("u:d", { accountId: "#W3N5E" });
  assert.equal(pending.take("u:d").accountId, "#W3N5E");
  assert.equal(pending.take("u:d"), null);
});

test("abandoned pictures cannot pile up", () => {
  const pending = createPendingShots({ max: 2 });
  pending.put("a", {});
  pending.put("b", {});
  pending.put("c", {});
  assert.equal(pending.size(), 2);
  assert.equal(pending.peek("a"), null);
});
