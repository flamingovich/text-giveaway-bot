// Profiles written before the brand rule (findBrandHomes in
// project-profile-bridge.js): a person counted as a referral by an organiser
// other than the one they first took part with on that brand. 57 such profiles
// of 44 people on production. The first organiser keeps them; with the others
// they become not a referral.
//
// As with the Pokerdom backfill, someone whose money prize at that organiser
// still waits for its payout is left for now - the payout is worked out from
// today's profile, and the win message promised the full amount. This runs on
// every start and gets to them once the prize is settled.

const {
  findBrandHomes,
  normalizeProjectBrandName,
  resolveBrandProjectId,
  buildCrossOrganizerNonReferralPatch,
} = require("./project-profile-bridge");
const { hasUnsettledMoneyWin } = require("./win-settlement");

function defaultIsMoneyPrize(draw) {
  return draw?.prizeType === "money_rub" || draw?.prizeType === "money_usd";
}

// Read only: which profiles to mark now, and which wait for a payout first.
function planBrandHomeBackfill({ profiles, projects = [], draws = [], isExpired = null, isMoneyPrize = defaultIsMoneyPrize }) {
  const homes = findBrandHomes(draws, projects);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const marks = [];
  const deferred = [];

  for (const [userId, node] of Object.entries(profiles?.users || {})) {
    for (const [projectId, projectData] of Object.entries(node?.projects || {})) {
      if (!projectData?.referralVerified) {
        continue;
      }
      const projectKey = resolveBrandProjectId(projectId);
      const project = projectById.get(projectKey);
      const brand = normalizeProjectBrandName(project?.name);
      const home = brand ? homes.get(`${userId}|${brand}`) : null;
      if (!home || project.ownerId == null || Number(home.ownerId) === Number(project.ownerId)) {
        continue;
      }
      if (hasUnsettledMoneyWin(userId, projectKey, draws, { isExpired, isMoneyPrize })) {
        deferred.push({ userId, projectId });
        continue;
      }
      marks.push({ userId, projectId, brandHomeOwnerId: home.ownerId });
    }
  }
  return { marks, deferred };
}

function applyBrandHomeBackfill(profiles, marks, at = new Date()) {
  let applied = 0;
  for (const mark of marks) {
    const projectData = profiles?.users?.[mark.userId]?.projects?.[mark.projectId];
    if (!projectData) {
      continue;
    }
    Object.assign(projectData, buildCrossOrganizerNonReferralPatch({ brandHomeOwnerId: mark.brandHomeOwnerId }, at));
    applied += 1;
  }
  return applied;
}

module.exports = { planBrandHomeBackfill, applyBrandHomeBackfill };
