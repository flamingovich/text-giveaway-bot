// The dashboard answers three questions in order: how many people the bot has,
// how many of them actually take part, and how much is being run. Everything
// below that is the same numbers over time.

const { DateTime } = require("luxon");
const { collectAllDraws, asArray } = require("./admin-draw-source");

const PERIODS = [
  { id: "7", label: "7 дней", days: 7 },
  { id: "30", label: "30 дней", days: 30 },
  { id: "90", label: "90 дней", days: 90 },
  { id: "all", label: "Всё время", days: null },
];

function resolvePeriod(id) {
  return PERIODS.find((period) => period.id === String(id)) || PERIODS[1];
}

function dayOf(iso, timezone) {
  if (!iso) {
    return "";
  }
  const dt = DateTime.fromISO(String(iso), { zone: timezone });
  return dt.isValid ? dt.toFormat("yyyy-MM-dd") : "";
}

function earliest(...values) {
  return values.filter(Boolean).sort()[0] || "";
}

// A profile has no signup date, only the traces of the person using the bot.
// The earliest of those is the closest thing to "we first saw them".
function firstSeenDay(userNode, timezone) {
  let best = "";

  // Half the people the bot knows never completed a project profile, so their
  // only timestamp is on the meta record. It moves when they write again, but
  // for someone who came once it is both the first and the last time we saw
  // them - and taking the earliest of everything means a project date always
  // wins over it when there is one.
  const metaDay = dayOf(userNode?.meta?.updatedAt, timezone);
  if (metaDay) {
    best = metaDay;
  }

  for (const entry of Object.values(userNode?.projects || {})) {
    for (const field of [
      "referralCheckedAt",
      "nonReferralMarkedAt",
      "antifraudWalletSavedAt",
      "updatedAt",
    ]) {
      const day = dayOf(entry?.[field], timezone);
      if (day) {
        best = best ? earliest(best, day) : day;
      }
    }
  }
  return best;
}

function participantJoinDay(draw, participantId, timezone) {
  const meta = draw.participantMeta?.[String(participantId)];
  return dayOf(meta?.updatedAt || draw.publishAt || draw.createdAt, timezone);
}

function buildDayAxis(days, timezone, earliestDay) {
  const today = DateTime.now().setZone(timezone).startOf("day");
  let from;
  if (days) {
    from = today.minus({ days: days - 1 });
  } else {
    const parsed = earliestDay ? DateTime.fromISO(earliestDay, { zone: timezone }) : null;
    from = parsed?.isValid ? parsed : today.minus({ days: 29 });
  }

  const labels = [];
  // A year of daily points is unreadable and slow to draw; cap the axis.
  const maxPoints = 180;
  let cursor = from;
  while (cursor <= today && labels.length < maxPoints) {
    labels.push(cursor.toFormat("yyyy-MM-dd"));
    cursor = cursor.plus({ days: 1 });
  }
  if (cursor <= today) {
    labels.push(today.toFormat("yyyy-MM-dd"));
  }
  return labels;
}

function countInto(map, key) {
  if (!key) {
    return;
  }
  map.set(key, (map.get(key) || 0) + 1);
}

function cumulative(daysByKey, labels, beforeCount) {
  let running = beforeCount;
  return labels.map((day) => {
    running += daysByKey.get(day) || 0;
    return running;
  });
}

function buildDashboardStats(deps, { ownerFilter = "", period = "30" } = {}) {
  const timezone = deps.timezone;
  const profiles = deps.readUserProjectProfiles() || { users: {} };
  const projects = asArray(deps.readProjects()?.projects);
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const allDraws = collectAllDraws(deps);
  const draws = ownerFilter
    ? allDraws.filter((draw) => String(draw.ownerId || "") === ownerFilter)
    : allDraws;

  // --- the three headline numbers -----------------------------------------
  const participantIds = new Set();
  const winnerIds = new Set();
  let winsTotal = 0;
  for (const draw of draws) {
    for (const id of asArray(draw.participantIds)) {
      participantIds.add(String(id));
    }
    for (const id of asArray(draw.winnerIds)) {
      winnerIds.add(String(id));
      winsTotal += 1;
    }
  }

  const usersTotal = Object.keys(profiles.users || {}).length;

  // --- daily series --------------------------------------------------------
  const newUsersByDay = new Map();
  let earliestUserDay = "";
  // A handful of profiles carry no timestamp at all. Dropping them would leave
  // the growth line ending below the headline count and quietly contradicting
  // it, so they are treated as having been there before the window began.
  let undatedUsers = 0;
  for (const userNode of Object.values(profiles.users || {})) {
    const day = firstSeenDay(userNode, timezone);
    if (!day) {
      undatedUsers += 1;
      continue;
    }
    countInto(newUsersByDay, day);
    earliestUserDay = earliestUserDay ? earliest(earliestUserDay, day) : day;
  }

  const firstJoinByUser = new Map();
  const joinsByDay = new Map();
  const drawsByDay = new Map();
  let earliestDrawDay = "";

  for (const draw of draws) {
    const createdDay = dayOf(draw.createdAt, timezone);
    countInto(drawsByDay, createdDay);
    if (createdDay) {
      earliestDrawDay = earliestDrawDay ? earliest(earliestDrawDay, createdDay) : createdDay;
    }

    for (const participantId of asArray(draw.participantIds)) {
      const day = participantJoinDay(draw, participantId, timezone);
      countInto(joinsByDay, day);
      const key = String(participantId);
      const known = firstJoinByUser.get(key);
      if (day && (!known || day < known)) {
        firstJoinByUser.set(key, day);
      }
    }
  }

  const newParticipantsByDay = new Map();
  for (const day of firstJoinByUser.values()) {
    countInto(newParticipantsByDay, day);
  }

  const resolved = resolvePeriod(period);
  const labels = buildDayAxis(
    resolved.days,
    timezone,
    earliest(earliestUserDay, earliestDrawDay),
  );
  const firstLabel = labels[0] || "";

  const countBefore = (byDay) => {
    let total = 0;
    for (const [day, count] of byDay.entries()) {
      if (day && day < firstLabel) {
        total += count;
      }
    }
    return total;
  };

  // --- breakdowns ----------------------------------------------------------
  const statusCounts = { draft: 0, scheduled: 0, active: 0, finished: 0 };
  const byBrand = new Map();
  const byPrizeType = new Map();
  for (const draw of draws) {
    statusCounts[draw.status] = (statusCounts[draw.status] || 0) + 1;
    const brand = projectById.get(draw.projectId)?.name || "Без проекта";
    countInto(byBrand, brand);
    const prizeLabel =
      draw.prizeType === "money_rub" ? "Рубли" : draw.prizeType === "money_usd" ? "Доллары" : "Другое";
    countInto(byPrizeType, prizeLabel);
  }

  let refs = 0;
  let nonRefs = 0;
  let withWallet = 0;
  for (const userNode of Object.values(profiles.users || {})) {
    const entries = Object.values(userNode?.projects || {});
    if (entries.some((entry) => entry.referralVerified)) {
      refs += 1;
    } else if (entries.some((entry) => entry.selfReportedNonReferral)) {
      nonRefs += 1;
    }
    if (entries.some((entry) => entry.trc20Address)) {
      withWallet += 1;
    }
  }

  return {
    period: resolved,
    periods: PERIODS,
    totals: {
      users: usersTotal,
      participants: participantIds.size,
      draws: draws.length,
      winners: winnerIds.size,
      wins: winsTotal,
      withWallet,
      active: statusCounts.active || 0,
      finished: statusCounts.finished || 0,
    },
    series: {
      labels,
      newUsers: labels.map((day) => newUsersByDay.get(day) || 0),
      totalUsers: cumulative(newUsersByDay, labels, countBefore(newUsersByDay) + undatedUsers),
      newParticipants: labels.map((day) => newParticipantsByDay.get(day) || 0),
      totalParticipants: cumulative(newParticipantsByDay, labels, countBefore(newParticipantsByDay)),
      joins: labels.map((day) => joinsByDay.get(day) || 0),
      draws: labels.map((day) => drawsByDay.get(day) || 0),
    },
    breakdowns: {
      status: statusCounts,
      brands: [...byBrand.entries()].sort((a, b) => b[1] - a[1]),
      prizeTypes: [...byPrizeType.entries()].sort((a, b) => b[1] - a[1]),
      referrals: { refs, nonRefs, unknown: Math.max(0, usersTotal - refs - nonRefs) },
    },
  };
}

module.exports = {
  buildDashboardStats,
  resolvePeriod,
  firstSeenDay,
  buildDayAxis,
  PERIODS,
};
