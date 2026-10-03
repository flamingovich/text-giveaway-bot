const test = require("node:test");
const assert = require("node:assert");
const {
  PROFILE_SHOT_MAX_AGE_MS,
  isProfileShotRequired,
  needsProfileShot,
  settledStatusOf,
  isJoinCtxNonReferral,
  refOnlyTurnsAway,
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

// The base starts anew: an old "не реф" with no screenshot may still settle
// as a referral; a settled one, or another organiser's person, may not.
test("a referrals-only draw turns away the settled 'не реф' and others' people", () => {
  const refOnly = { ...DRAW, refOnly: true };
  assert.equal(refOnlyTurnsAway(refOnly, { directProfile: { verifiedStatus: "nonref" } }), true);
  assert.equal(refOnlyTurnsAway(refOnly, { isCrossOrganizerNonReferral: true, directProfile: {} }), true);
  assert.equal(refOnlyTurnsAway(refOnly, { directProfile: { selfReportedNonReferral: true } }), false);
  assert.equal(refOnlyTurnsAway(refOnly, { directProfile: { verifiedStatus: "ref" } }), false);
  assert.equal(refOnlyTurnsAway(DRAW, { directProfile: { verifiedStatus: "nonref" } }), false);
  assert.equal(isJoinCtxNonReferral({ directProfile: { projectAccountPredatesReferrals: true } }), false);
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
