const REFERRAL_BOOST_PERCENT = 50;
const REFERRAL_MAX_INVITES = 10;
// The separator used to be "__ref__", and something between the share sheet and
// the mini app ate the underscores: links arrived as "…_9431ref8167143042",
// which matches no draw at all. Real people were turned away from live draws by
// it. A pair of double underscores is also exactly how Telegram writes
// underline, so it was never a safe thing to put in a shared link.
const REFERRAL_START_PARAM_SEP = "-ref-";

// Links already in circulation keep working; a hyphen cannot appear in a draw
// id, so none of these can split one by accident.
const REFERRAL_SEPARATORS = [REFERRAL_START_PARAM_SEP, "__ref__", "_ref_"];
const MANGLED_START_PARAM = /^(draw_\d+_\d+)ref(\d+)$/;

function parseJoinStartParam(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return { drawId: "", referrerId: null };
  }

  for (const separator of REFERRAL_SEPARATORS) {
    const idx = value.indexOf(separator);
    if (idx > 0) {
      const referrerRaw = value.slice(idx + separator.length).trim();
      return {
        drawId: value.slice(0, idx).trim(),
        referrerId: /^\d+$/.test(referrerRaw) ? Number(referrerRaw) : null,
      };
    }
  }

  const mangled = value.match(MANGLED_START_PARAM);
  if (mangled) {
    return { drawId: mangled[1], referrerId: Number(mangled[2]) };
  }

  return { drawId: value, referrerId: null };
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
