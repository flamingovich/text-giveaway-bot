// The join's rules around the profile screenshot.
//
// Everyone's referral status used to rest on their word: "Я не реферал" was a
// button, and a typed ID cost nothing to make up. Now a status is settled by a
// screenshot of the person's profile, and the owner's rules for it are:
//
//   - The base starts anew. The first screenshot settles the status
//     (verifiedStatus) however the old base had it; until then the old status
//     stands, so payouts and the panel keep working for everyone.
//   - A settled status never changes: a referral stays one, a "не реф" never
//     becomes one, whatever IDs and screenshots come later.
//   - The screenshot is asked for again once a week, to keep the ID current;
//     the status question is not asked again.
//
// A draw can also be for referrals only. It turns away whoever is settled as
// "не реф" for its organiser, or is another organiser's person on the brand;
// an old unsettled "не реф" may still settle it with a screenshot.
//
// JOIN_PROFILE_SHOT=false in .env turns the step off without a deploy: the join
// is back to the typed ID.

function isProfileShotRequired(env = process.env) {
  return String(env.JOIN_PROFILE_SHOT || "").trim().toLowerCase() !== "false";
}

const PROFILE_SHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// A screenshot taken within the last week.
function hasFreshProfileShot(profile, now = Date.now()) {
  const at = Date.parse(profile?.profileShotVerifiedAt || "");
  return Number.isFinite(at) && now - at < PROFILE_SHOT_MAX_AGE_MS;
}

// On this organiser's profile or the one the person first joined the brand
// with (project-profile-bridge.js).
function joinCtxHasProfileShot(joinCtx, now = Date.now()) {
  return [joinCtx?.directProfile, joinCtx?.effectiveProfile, joinCtx?.siblingSource?.projectData].some((profile) =>
    hasFreshProfileShot(profile, now),
  );
}

function needsProfileShot(draw, joinCtx, env = process.env, now = Date.now()) {
  return isProfileShotRequired(env) && Boolean(draw?.projectId) && !joinCtxHasProfileShot(joinCtx, now);
}

// The status a screenshot settled for this organiser: "ref", "nonref" or "".
// Only this organiser's profile: on the brand, another organiser's settled
// status says nothing about whose person this is here.
function settledStatusOf(joinCtx) {
  const status = joinCtx?.directProfile?.verifiedStatus || "";
  return status === "ref" || status === "nonref" ? status : "";
}

function isJoinCtxNonReferral(joinCtx) {
  return Boolean(joinCtx?.isCrossOrganizerNonReferral) || settledStatusOf(joinCtx) === "nonref";
}

function refOnlyTurnsAway(draw, joinCtx) {
  return draw?.refOnly === true && isJoinCtxNonReferral(joinCtx);
}

// Pictures read but not yet confirmed, a few hundred kilobytes each: kept in
// memory for half an hour at most, and never more than a few hundred at once,
// so the ones nobody confirmed cannot pile up.
function createPendingShots({ ttlMs = 30 * 60 * 1000, max = 300, now = () => Date.now() } = {}) {
  const pending = new Map();
  function prune() {
    const at = now();
    for (const [key, entry] of pending) {
      if (at - entry.at > ttlMs) pending.delete(key);
    }
    while (pending.size > max) {
      pending.delete(pending.keys().next().value);
    }
  }
  return {
    put(key, value) {
      pending.delete(key);
      pending.set(key, { ...value, at: now() });
      prune();
    },
    take(key) {
      prune();
      const entry = pending.get(key) || null;
      pending.delete(key);
      return entry;
    },
    peek(key) {
      prune();
      return pending.get(key) || null;
    },
    size: () => pending.size,
  };
}

module.exports = {
  PROFILE_SHOT_MAX_AGE_MS,
  isProfileShotRequired,
  hasFreshProfileShot,
  settledStatusOf,
  joinCtxHasProfileShot,
  needsProfileShot,
  isJoinCtxNonReferral,
  refOnlyTurnsAway,
  createPendingShots,
};
