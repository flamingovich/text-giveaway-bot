const REFERRAL_BOOST_PERCENT = 50;
const REFERRAL_MAX_INVITES = 10;
const REFERRAL_START_PARAM_SEP = "__ref__";

function parseJoinStartParam(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return { drawId: "", referrerId: null };
  }
  const idx = value.indexOf(REFERRAL_START_PARAM_SEP);
  if (idx < 0) {
    return { drawId: value, referrerId: null };
  }
  const drawId = value.slice(0, idx).trim();
  const referrerRaw = value.slice(idx + REFERRAL_START_PARAM_SEP.length).trim();
  const referrerId = /^\d+$/.test(referrerRaw) ? Number(referrerRaw) : null;
  return { drawId, referrerId };
}

function buildJoinReferralStartParam(drawId, referrerId) {
  return `${drawId}${REFERRAL_START_PARAM_SEP}${referrerId}`;
}

function buildJoinReferralDirectLink(drawId, referrerId, botUsername, shortName) {
  const username = String(botUsername || "").replace(/^@/, "").trim();
  const appShort = String(shortName || "join").replace(/^\/+/, "").trim();
  if (!username || !appShort || !drawId || !referrerId) {
    return "";
  }
  const startapp = buildJoinReferralStartParam(drawId, referrerId);
  return `https://t.me/${username}/${appShort}?startapp=${encodeURIComponent(startapp)}`;
}

function getReferralInviteCount(draw, inviterId) {
  const list = draw.drawReferrals?.[String(inviterId)] || [];
  return list.length;
}

function computeJoinWinChance(draw, userId) {
  const participantIds = draw.participantIds || [];
  const winnersCount = Math.max(1, Number(draw.winnersCount) || 1);
  const participantCount = participantIds.length;
  const baseChance =
    participantCount > 0 ? Math.min(100, (winnersCount / participantCount) * 100) : 0;
  const inviteCount = Math.min(REFERRAL_MAX_INVITES, getReferralInviteCount(draw, userId));
  const referralBoostPercent = inviteCount * REFERRAL_BOOST_PERCENT;
  // Реальный шанс в розыгрыше — только baseChance. referralBoostPercent — чисто визуальный прогресс.
  const winChancePercent = Number(baseChance.toFixed(2));

  return {
    participantCount,
    winnersCount,
    baseWinChancePercent: Number(baseChance.toFixed(2)),
    referralBoostPercent,
    referralInviteCount: inviteCount,
    referralMaxInvites: REFERRAL_MAX_INVITES,
    referralBoostPerInvite: REFERRAL_BOOST_PERCENT,
    winChancePercent: Number(winChancePercent.toFixed(2)),
  };
}

function tryRecordDrawReferral(draw, inviterId, inviteeId) {
  if (!draw || inviterId == null || inviteeId == null) {
    return false;
  }
  const inviterKey = String(inviterId);
  const inviteeKey = String(inviteeId);
  if (inviterKey === inviteeKey) {
    return false;
  }

  const participantIds = (draw.participantIds || []).map((id) => String(id));
  if (!participantIds.includes(inviterKey) || !participantIds.includes(inviteeKey)) {
    return false;
  }

  if (!draw.participantReferrals) {
    draw.participantReferrals = {};
  }
  if (draw.participantReferrals[inviteeKey]) {
    return false;
  }

  if (!draw.drawReferrals) {
    draw.drawReferrals = {};
  }
  const current = draw.drawReferrals[inviterKey] || [];
  if (current.length >= REFERRAL_MAX_INVITES) {
    return false;
  }
  if (current.some((id) => String(id) === inviteeKey)) {
    return false;
  }

  draw.drawReferrals[inviterKey] = [...current, Number(inviteeId) || inviteeId];
  draw.participantReferrals[inviteeKey] = inviterKey;
  return true;
}

module.exports = {
  REFERRAL_BOOST_PERCENT,
  REFERRAL_MAX_INVITES,
  REFERRAL_START_PARAM_SEP,
  parseJoinStartParam,
  buildJoinReferralStartParam,
  buildJoinReferralDirectLink,
  getReferralInviteCount,
  computeJoinWinChance,
  tryRecordDrawReferral,
};
