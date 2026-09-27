// Pokerdom accounts made before the owner started taking referrals (1 June
// 2026, Moscow) cannot be anyone's referral. Ids entered from now on are marked
// as they come in (join-miniapp.js); this marks the ones saved before the rule.
//
// Someone with a Pokerdom money prize still waiting to be settled is left alone
// for now. The payout is worked out from the profile when it is paid (the panel
// computes it live), and the win message promised the full amount: marking
// them today would halve a prize already won. This runs on every start and
// marks them once that prize is paid, refused or lapsed.

const { isPokerdomProject } = require("./deposit-guide");
const { resolveProjectId } = require("./project-identity");
const { isWinSettled, hasUnsettledMoneyWin } = require("./win-settlement");
const {
  getPokerdomAccountCreatedAt,
  isPokerdomAccountBeforeReferrals,
  buildPredatesReferralsPatch,
} = require("./project-account-id");

function defaultIsMoneyPrize(draw) {
  return draw?.prizeType === "money_rub" || draw?.prizeType === "money_usd";
}

// Read only: what to mark now, and who waits for a payout first.
function planPokerdomReferralBackfill({
  profiles,
  projects = [],
  draws = [],
  isExpired = null,
  isMoneyPrize = defaultIsMoneyPrize,
}) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const marks = [];
  const deferred = [];

  for (const [userId, node] of Object.entries(profiles?.users || {})) {
    for (const [projectId, projectData] of Object.entries(node?.projects || {})) {
      const projectKey = resolveProjectId(projectId);
      if (!isPokerdomProject(projectById.get(projectKey))) {
        continue;
      }
      if (projectData?.selfReportedNonReferral) {
        continue;
      }
      const accountId = projectData?.projectAccountId;
      if (!accountId || !isPokerdomAccountBeforeReferrals(accountId)) {
        continue;
      }
      if (hasUnsettledMoneyWin(userId, projectKey, draws, { isExpired, isMoneyPrize })) {
        deferred.push({ userId, projectId });
        continue;
      }
      marks.push({ userId, projectId, createdAt: getPokerdomAccountCreatedAt(accountId) });
    }
  }

  return { marks, deferred };
}

function applyPokerdomReferralBackfill(profiles, marks, at = new Date()) {
  let applied = 0;
  for (const mark of marks) {
    const projectData = profiles?.users?.[mark.userId]?.projects?.[mark.projectId];
    if (!projectData) {
      continue;
    }
    Object.assign(projectData, buildPredatesReferralsPatch(at), {
      projectAccountCreatedAt: mark.createdAt ? mark.createdAt.toISOString() : null,
    });
    applied += 1;
  }
  return applied;
}

module.exports = {
  isWinSettled,
  hasUnsettledMoneyWin,
  planPokerdomReferralBackfill,
  applyPokerdomReferralBackfill,
};
