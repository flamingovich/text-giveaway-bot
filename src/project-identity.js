// Projects used to be created by hand per organiser; they are fixed brands now
// (Pokerdom, BEEF, FUGU, IRIS, one set per organiser). The brand migration
// rewrote the projectId on draws but left user profiles pointing at the old
// ids, so a thousand bindings resolved to nothing and the panel reported
// "Проект удалён" for projects that were only moved.
//
// The old ids are not lost: the same organiser's Pokerdom project is known for
// each of them. Resolving through here merges the two halves of one person's
// history instead of showing them as separate, half-empty rows.

const { LEGACY_POKERDOM_PROJECT_OWNERS } = require("./project-profile-bridge");

function buildLegacyProjectMap() {
  const map = new Map();
  for (const [legacyId, ownerId] of Object.entries(LEGACY_POKERDOM_PROJECT_OWNERS || {})) {
    map.set(legacyId, `brand_pokerdom_${ownerId}`);
  }
  return map;
}

const LEGACY_PROJECT_IDS = buildLegacyProjectMap();

function resolveProjectId(projectId) {
  if (!projectId) {
    return "";
  }
  return LEGACY_PROJECT_IDS.get(String(projectId)) || String(projectId);
}

function isLegacyProjectId(projectId) {
  return LEGACY_PROJECT_IDS.has(String(projectId));
}

function preferTruthy(left, right) {
  return left || right;
}

// Someone can hold both the old binding and the new brand one. Neither is
// authoritative on its own: the old entry often carries the wallet and the
// verified referral, the new one the recent activity. Keep the better half of
// each field rather than letting whichever came last win.
function mergeProjectProfileEntries(entries) {
  const present = entries.filter(Boolean);
  if (present.length === 0) {
    return {};
  }
  if (present.length === 1) {
    return { ...present[0] };
  }

  const ordered = [...present].sort((left, right) =>
    String(left.updatedAt || "").localeCompare(String(right.updatedAt || "")),
  );

  const merged = {};
  for (const entry of ordered) {
    Object.assign(merged, entry);
  }

  // A confirmed referral anywhere means the person is a referral; a wallet or a
  // nickname recorded once should not disappear because a later, emptier entry
  // overwrote it.
  merged.referralVerified = present.some((entry) => entry.referralVerified);
  merged.selfReportedNonReferral = merged.referralVerified
    ? false
    : present.some((entry) => entry.selfReportedNonReferral);

  for (const field of [
    "trc20Address",
    "antifraudTrc20Address",
    "referralNickname",
    "projectAccountId",
    "referralOwnerId",
    "depositNetwork",
  ]) {
    merged[field] = present.reduce(
      (value, entry) => preferTruthy(value, entry[field]),
      undefined,
    );
    if (merged[field] === undefined) {
      delete merged[field];
    }
  }

  merged.updatedAt = ordered[ordered.length - 1].updatedAt || merged.updatedAt;
  return merged;
}

// Collapses one user's project bindings onto their resolved ids.
function resolveUserProjects(userProjects = {}) {
  const grouped = new Map();
  for (const [projectId, entry] of Object.entries(userProjects || {})) {
    const resolved = resolveProjectId(projectId);
    if (!grouped.has(resolved)) {
      grouped.set(resolved, []);
    }
    grouped.get(resolved).push(entry);
  }

  const result = {};
  for (const [projectId, entries] of grouped.entries()) {
    result[projectId] = mergeProjectProfileEntries(entries);
  }
  return result;
}

module.exports = {
  resolveProjectId,
  isLegacyProjectId,
  mergeProjectProfileEntries,
  resolveUserProjects,
  LEGACY_PROJECT_IDS,
};
