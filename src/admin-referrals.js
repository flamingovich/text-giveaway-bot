// Who brings people in, and whether it does them any good.
//
// One thing this page has to be honest about: inviting does not actually raise
// anyone's chance of winning. The mini app promises "+50% к шансу" per invite,
// but the boost is cosmetic - pickWinners shuffles participantIds uniformly and
// never looks at drawReferrals. Reporting invites next to an unchanged win rate
// is the only way the panel does not repeat that claim.

const { identityOf } = require("./admin-format");

function asCount(list) {
  return Array.isArray(list) ? list.length : 0;
}

function bucketOf(invites) {
  if (invites >= 10) return "10 и больше";
  if (invites >= 5) return "от 5 до 9";
  if (invites >= 2) return "от 2 до 4";
  return "ровно 1";
}

const BUCKET_ORDER = ["ровно 1", "от 2 до 4", "от 5 до 9", "10 и больше"];

function buildReferralStats(draws = [], profiles = {}) {
  const users = profiles?.users || {};
  const identity = (userId) => identityOf(userId, users[String(userId)]?.meta || {});

  const invitesByUser = new Map();
  const drawsByUser = new Map();
  const invitesByOwner = new Map();
  const drawsByOwner = new Map();
  const invitedPeople = new Set();
  const invitesByMonth = new Map();

  let invites = 0;
  let participations = 0;
  let drawsWithReferrals = 0;

  // Winning while having invited, and how that compares to everyone else.
  let winnersTotal = 0;
  let winnersWhoInvited = 0;
  let inviterEntries = 0;
  let inviterWins = 0;
  let finishedParticipations = 0;
  let finishedWinners = 0;
  const winnerRows = [];

  for (const draw of draws) {
    const participants = (draw.participantIds || []).map(String);
    participations += participants.length;

    const referrals = draw.drawReferrals || {};
    const inviters = new Set();
    let drawInvites = 0;

    for (const [inviterId, invited] of Object.entries(referrals)) {
      const count = asCount(invited);
      if (count === 0) continue;
      inviters.add(String(inviterId));
      drawInvites += count;
      invites += count;
      invitesByUser.set(String(inviterId), (invitesByUser.get(String(inviterId)) || 0) + count);
      drawsByUser.set(String(inviterId), (drawsByUser.get(String(inviterId)) || 0) + 1);
      for (const person of invited) {
        invitedPeople.add(String(person));
      }
    }

    if (drawInvites > 0) {
      drawsWithReferrals += 1;
      const owner = String(draw.ownerId || draw.createdBy || "");
      if (owner) {
        invitesByOwner.set(owner, (invitesByOwner.get(owner) || 0) + drawInvites);
        drawsByOwner.set(owner, (drawsByOwner.get(owner) || 0) + 1);
      }
      const month = String(draw.createdAt || draw.startAt || "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(month)) {
        invitesByMonth.set(month, (invitesByMonth.get(month) || 0) + drawInvites);
      }
    }

    if (draw.status !== "finished") continue;

    const winners = (draw.winnerIds || []).map(String);
    winnersTotal += winners.length;
    finishedParticipations += participants.length;
    finishedWinners += winners.length;

    for (const participant of participants) {
      if (!inviters.has(participant)) continue;
      inviterEntries += 1;
      if (winners.includes(participant)) {
        inviterWins += 1;
      }
    }

    for (const winner of winners) {
      if (!inviters.has(winner)) continue;
      winnersWhoInvited += 1;
      winnerRows.push({
        identity: identity(winner),
        prize: draw.prize || "—",
        invites: asCount(referrals[winner]),
        participants: participants.length,
        places: winners.length,
      });
    }
  }

  const buckets = new Map(BUCKET_ORDER.map((label) => [label, 0]));
  for (const count of invitesByUser.values()) {
    const label = bucketOf(count);
    buckets.set(label, (buckets.get(label) || 0) + 1);
  }

  const rate = (part, whole) => (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0);

  return {
    totals: {
      invites,
      invitedPeople: invitedPeople.size,
      inviters: invitesByUser.size,
      drawsWithReferrals,
      drawsTotal: draws.length,
      participations,
      sharePercent: rate(invites, participations),
    },
    topInviters: [...invitesByUser.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([userId, count]) => ({
        identity: identity(userId),
        invites: count,
        draws: drawsByUser.get(userId) || 0,
      })),
    byOrganizer: [...invitesByOwner.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([userId, count]) => {
        const drawCount = drawsByOwner.get(userId) || 0;
        return {
          identity: identity(userId),
          invites: count,
          draws: drawCount,
          perDraw: drawCount > 0 ? Number((count / drawCount).toFixed(1)) : 0,
        };
      }),
    distribution: BUCKET_ORDER.map((label) => ({ label, count: buckets.get(label) || 0 })),
    months: [...invitesByMonth.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([month, count]) => ({ month, invites: count })),
    winners: {
      total: winnersTotal,
      whoInvited: winnersWhoInvited,
      inviterEntries,
      inviterWins,
      inviterWinRate: rate(inviterWins, inviterEntries),
      averageWinRate: rate(finishedWinners, finishedParticipations),
      rows: winnerRows.sort((left, right) => right.invites - left.invites).slice(0, 20),
    },
  };
}

module.exports = { buildReferralStats };
