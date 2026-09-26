// Whether a won prize can still be paid - for the backfills that change a
// person's referral status. The payout is worked out from today's profile (the
// panel computes it live), and the win message promised the amount of the day
// they won: a status changed under a prize still waiting would change the prize.

const { resolveProjectId } = require("./project-identity");

// Nothing more can be paid for this win. No record at all counts as owed, the
// way the payout queue counts it.
function isWinSettled(notify, draw, isExpired) {
  if (!notify) {
    return false;
  }
  return Boolean(
    notify.paidAt ||
      notify.paymentDeniedAt ||
      notify.antiFraudFlag ||
      notify.status === "forfeited" ||
      notify.status === "expired" ||
      (typeof isExpired === "function" && isExpired(notify, draw)),
  );
}

// A money prize in this project still waiting to be paid to this person.
function hasUnsettledMoneyWin(userId, projectKey, draws, { isExpired = null, isMoneyPrize } = {}) {
  const userKey = String(userId);
  return (draws || []).some(
    (draw) =>
      draw?.status === "finished" &&
      resolveProjectId(draw.projectId) === projectKey &&
      isMoneyPrize(draw) &&
      (draw.winnerIds || []).some((id) => String(id) === userKey) &&
      !isWinSettled(draw.winnerNotifications?.[userKey] || null, draw, isExpired),
  );
}

module.exports = { isWinSettled, hasUnsettledMoneyWin };
