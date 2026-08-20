// Everything known about one person in one place. The users table answers "who
// is this" but not "what actually happened to them", so a dispute or a
// multi-account check meant reading the database by hand.

const { collectAllDraws, asArray } = require("./admin-draw-source");
const { resolveProjectId, resolveUserProjects } = require("./project-identity");

const WINNER_OUTCOMES = {
  confirmed: { label: "Подтвердил", tone: "ok" },
  awaiting_address: { label: "Ждём адрес", tone: "warn" },
  pending: { label: "Не отметился", tone: "warn" },
  expired: { label: "Время вышло", tone: "muted" },
  forfeited: { label: "Приз сгорел", tone: "danger" },
  failed: { label: "Не доставлено", tone: "danger" },
};

function describeWinnerOutcome(notify) {
  if (!notify) {
    // The finish stores a record for every winner, so its absence means the
    // notification never reached them.
    return { label: "Без уведомления", tone: "danger", key: "missing" };
  }
  if (notify.paidAt) {
    return { label: "Выплачено", tone: "ok", key: "paid" };
  }
  const known = WINNER_OUTCOMES[notify.status];
  return known
    ? { ...known, key: notify.status }
    : { label: notify.status || "—", tone: "muted", key: notify.status || "unknown" };
}

function drawTimestamp(draw) {
  return draw.finishedAt || draw.endAt || draw.publishAt || draw.createdAt || "";
}

function collectWallets(userNode, drawsForUser) {
  const wallets = new Map();
  for (const [projectId, projectData] of Object.entries(userNode?.projects || {})) {
    for (const key of ["trc20Address", "antifraudTrc20Address"]) {
      const address = String(projectData?.[key] || "").trim();
      if (address && !wallets.has(address)) {
        wallets.set(address, { address, source: "профиль", projectId });
      }
    }
  }
  for (const entry of drawsForUser) {
    const address = String(entry.outcome?.wallet || "").trim();
    if (address && !wallets.has(address)) {
      wallets.set(address, { address, source: "выплата", projectId: entry.projectId });
    }
  }
  return [...wallets.values()];
}

function buildUserCard(deps, userId, options = {}) {
  const userKey = String(userId);
  const profiles = deps.readUserProjectProfiles() || { users: {} };
  const userNode = profiles.users?.[userKey] || null;
  const projectById = new Map(
    asArray(deps.readProjects()?.projects).map((project) => [project.id, project]),
  );

  const projectName = (projectId) => {
    if (!projectId) {
      return "Без проекта";
    }
    return projectById.get(resolveProjectId(projectId))?.name || "Прежний проект";
  };

  const draws = [];
  const totals = {
    participations: 0,
    wins: 0,
    winningsRub: 0,
    winningsUsd: 0,
    paidRub: 0,
    paidUsd: 0,
    awaitingPayout: 0,
  };

  for (const draw of collectAllDraws(deps)) {
    const isParticipant = asArray(draw.participantIds).some((id) => String(id) === userKey);
    const isWinner = asArray(draw.winnerIds).some((id) => String(id) === userKey);
    if (!isParticipant && !isWinner) {
      continue;
    }

    const notify = draw.winnerNotifications?.[userKey] || null;
    const outcome = isWinner ? describeWinnerOutcome(notify) : null;

    if (isParticipant) {
      totals.participations += 1;
    }
    if (isWinner) {
      totals.wins += 1;
      const amount = Number(draw.prizeAmountRub || draw.prizeAmountUsd || 0);
      if (draw.prizeType === "money_rub") {
        totals.winningsRub += amount;
        if (notify?.paidAt) {
          totals.paidRub += amount;
        }
      } else if (draw.prizeType === "money_usd") {
        totals.winningsUsd += amount;
        if (notify?.paidAt) {
          totals.paidUsd += amount;
        }
      }
      // Someone who cleared the check but has not been paid yet is the case an
      // operator actually needs to spot.
      const claimable =
        notify &&
        !notify.paidAt &&
        (notify.status === "confirmed" || notify.status === "awaiting_address");
      if (claimable) {
        totals.awaitingPayout += 1;
      }
    }

    draws.push({
      id: draw.id,
      prize: draw.prize || "—",
      prizeType: draw.prizeType || "",
      projectId: resolveProjectId(draw.projectId),
      projectName: projectName(draw.projectId),
      status: draw.status,
      at: drawTimestamp(draw),
      joinedAt: draw.participantMeta?.[userKey]?.updatedAt || "",
      role: isWinner ? "winner" : "participant",
      outcome: isWinner
        ? {
            ...outcome,
            sentAt: notify?.sentAt || "",
            verifiedAt: notify?.verifiedAt || "",
            paidAt: notify?.paidAt || "",
            payoutPrize: notify?.payoutPrize || "",
            wallet: notify?.trc20Address || "",
            reason: notify?.forfeitureReason || notify?.deliveryFailureReason || "",
          }
        : null,
      channelId: draw.channelId || "",
      messageId: draw.messageId || null,
    });
  }

  draws.sort((left, right) => String(right.at).localeCompare(String(left.at)));

  const projects = Object.entries(resolveUserProjects(userNode?.projects)).map(([projectId, projectData]) => ({
    projectId,
    projectName: projectName(projectId),
    refStatus: projectData.referralVerified
      ? "ref"
      : projectData.selfReportedNonReferral
        ? "non-ref"
        : "unknown",
    nickname: projectData.referralNickname || "",
    accountId: projectData.projectAccountId || "",
    wallet: projectData.trc20Address || "",
    updatedAt: projectData.updatedAt || "",
  }));

  const meta = userNode?.meta || {};
  return {
    userId: userKey,
    known: Boolean(userNode),
    meta,
    label: meta.username
      ? `@${meta.username}`
      : [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() || `ID ${userKey}`,
    fullName: [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim(),
    totals,
    projects,
    draws,
    wallets: collectWallets(userNode, draws),
    fraud: asArray(options.fraudDetails),
    supportChats: asArray(options.supportChats),
  };
}

module.exports = { buildUserCard, describeWinnerOutcome };
