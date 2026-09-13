// "Я не зарегистрирован": a participant who joins without being registered on
// the project gets half the prize, the same cut as "Я не реферал".
//
// The difference is where it is kept. "Я не реферал" is a fact about the person
// and the project, stored on their project profile and never asked again. Not
// being registered is expected to change - they can register before the next
// draw - so the owner wants the question asked every time. The flag therefore
// lives on the one participation, in draw.participantMeta, and nothing about it
// is written to the profile.

function isParticipationUnregistered(draw, userId) {
  if (userId === null || userId === undefined) {
    return false;
  }
  return Boolean(draw?.participantMeta?.[String(userId)]?.unregistered);
}

function isPrizeHalved(draw, userId, projectData) {
  return Boolean(projectData?.selfReportedNonReferral) || isParticipationUnregistered(draw, userId);
}

// Halved once for either reason, never twice. Someone who is not registered
// cannot be anyone's referral either, so the two describe one situation and a
// quarter of the prize would be a penalty nobody asked for.
function applyPrizeHalving(amount, draw, userId, projectData) {
  return isPrizeHalved(draw, userId, projectData) ? Math.floor(amount / 2) : amount;
}

module.exports = {
  isParticipationUnregistered,
  isPrizeHalved,
  applyPrizeHalving,
};
