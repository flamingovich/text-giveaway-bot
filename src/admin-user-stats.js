function emptyActivityEntry() {
  return {
    participations: 0,
    wins: 0,
    winningsRub: 0,
    winningsUsd: 0,
    paidRub: 0,
    paidUsd: 0,
    fraudLabels: new Set(),
    fraudDetails: [],
  };
}

function activityKey(userId, projectId) {
  return `${String(userId)}:${String(projectId)}`;
}

function findLinkedParticipantIds(draw, userId, predicate) {
  const linked = [];
  for (const participantId of draw.participantIds || []) {
    if (String(participantId) === String(userId)) {
      continue;
    }
    if (predicate(participantId)) {
      linked.push(String(participantId));
    }
  }
  return linked;
}

function formatLinkedUsers(linkedUserIds, formatUserLabel) {
  if (!linkedUserIds.length) {
    return "";
  }
  return linkedUserIds
    .map((id) => `${formatUserLabel(id)} (${id})`)
    .join(", ");
}

function collectDrawFraudLinks(draw, userId, userProfiles, signals, deps) {
  const {
    getDrawParticipantMeta,
    getUserProfileBundle,
    normalizeWalletAddress,
  } = deps;
  const links = [];
  const participantMeta = getDrawParticipantMeta(draw, userId);
  const { projectData } = getUserProfileBundle(userProfiles, userId, draw.projectId);
  const wallet = normalizeWalletAddress(projectData?.trc20Address);
  const drawTitle = String(draw.title || draw.id || "—").trim();

  if (participantMeta?.ipHash && (signals.byIp.get(participantMeta.ipHash) || 0) > 1) {
    const linkedUserIds = findLinkedParticipantIds(draw, userId, (participantId) => {
      const meta = getDrawParticipantMeta(draw, participantId);
      return meta?.ipHash === participantMeta.ipHash;
    });
    links.push({
      label: "Бот по IP",
      kind: "ip",
      drawId: draw.id,
      drawTitle,
      linkedUserIds,
      reason: linkedUserIds.length
        ? `Один IP с участниками: ${linkedUserIds.join(", ")}`
        : "Совпадение IP с другими участниками",
    });
  }

  if (participantMeta?.deviceHash && (signals.byDevice.get(participantMeta.deviceHash) || 0) > 1) {
    const linkedUserIds = findLinkedParticipantIds(draw, userId, (participantId) => {
      const meta = getDrawParticipantMeta(draw, participantId);
      return meta?.deviceHash === participantMeta.deviceHash;
    });
    links.push({
      label: "Бот по девайсу",
      kind: "device",
      drawId: draw.id,
      drawTitle,
      linkedUserIds,
      reason: linkedUserIds.length
        ? `Одно устройство (fingerprint) с участниками: ${linkedUserIds.join(", ")}`
        : "Совпадение fingerprint с другими участниками",
    });
  }

  if (wallet && (signals.byWallet.get(wallet) || 0) > 1) {
    const linkedUserIds = findLinkedParticipantIds(draw, userId, (participantId) => {
      const { projectData: otherProjectData } = getUserProfileBundle(
        userProfiles,
        participantId,
        draw.projectId,
      );
      return normalizeWalletAddress(otherProjectData?.trc20Address) === wallet;
    });
    links.push({
      label: "Мультиаккаунт",
      kind: "wallet",
      drawId: draw.id,
      drawTitle,
      linkedUserIds,
      wallet,
      reason: linkedUserIds.length
        ? `Общий TRC20-кошелёк с участниками: ${linkedUserIds.join(", ")}`
        : "Общий TRC20-кошелёк с другими участниками",
    });
  }

  return links;
}

function pushFraudDetail(entry, detail, seen) {
  const key = `${detail.kind}:${detail.drawId}:${detail.label}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  entry.fraudLabels.add(detail.label);
  entry.fraudDetails.push(detail);
}

function formatMoneyTotals(rub, usd, formatRubAmount, formatUsdAmount) {
  const parts = [];
  if (rub > 0) {
    parts.push(formatRubAmount(rub));
  }
  if (usd > 0) {
    parts.push(formatUsdAmount(usd));
  }
  return parts.length ? parts.join(" · ") : "—";
}

function buildUserProjectActivityIndex(deps, userProfiles, formatUserLabel) {
  const {
    readData,
    getUserProfileBundle,
    getDrawParticipantMeta,
    collectDrawParticipantSignals,
    getWinnerAntiFraud,
    getWinnerPayoutAmount,
    isMoneyPrizeType,
  } = deps;

  const index = new Map();
  const data = readData();

  function ensure(userId, projectId) {
    const key = activityKey(userId, projectId);
    if (!index.has(key)) {
      index.set(key, emptyActivityEntry());
    }
    return index.get(key);
  }

  for (const draw of data.draws || []) {
    const projectId = draw.projectId;
    if (!projectId) {
      continue;
    }

    const signals = collectDrawParticipantSignals(draw, userProfiles);
    const drawSeen = new Map();

    for (const participantId of draw.participantIds || []) {
      const userKey = String(participantId);
      const entry = ensure(userKey, projectId);
      entry.participations += 1;

      if (!drawSeen.has(userKey)) {
        drawSeen.set(userKey, new Set());
      }
      const seen = drawSeen.get(userKey);
      for (const link of collectDrawFraudLinks(draw, userKey, userProfiles, signals, deps)) {
        pushFraudDetail(entry, link, seen);
      }
    }

    for (const winnerId of draw.winnerIds || []) {
      const userKey = String(winnerId);
      const entry = ensure(userKey, projectId);
      entry.wins += 1;

      const { projectData } = getUserProfileBundle(userProfiles, winnerId, projectId);
      const notifyInfo = draw.winnerNotifications?.[userKey];
      const antiFraud = getWinnerAntiFraud(draw, winnerId, userProfiles, signals, notifyInfo);

      if (!drawSeen.has(userKey)) {
        drawSeen.set(userKey, new Set());
      }
      const seen = drawSeen.get(userKey);

      for (const link of collectDrawFraudLinks(draw, userKey, userProfiles, signals, deps)) {
        pushFraudDetail(entry, link, seen);
      }

      for (const label of antiFraud.labels) {
        if (label === "Не подписан") {
          pushFraudDetail(
            entry,
            {
              label,
              kind: "subscription",
              drawId: draw.id,
              drawTitle: String(draw.title || draw.id || "—").trim(),
              linkedUserIds: [],
              reason: "Не подписан на канал при проверке победителя",
            },
            seen,
          );
        }
      }

      if (isMoneyPrizeType(draw.prizeType)) {
        const nominal = getWinnerPayoutAmount(draw, projectData, { hasFraudFlag: false });
        const payoutAmount = getWinnerPayoutAmount(draw, projectData, {
          hasFraudFlag: antiFraud.hasFraudFlag,
        });

        if (draw.prizeType === "money_rub") {
          entry.winningsRub += nominal;
          if (notifyInfo?.paidAt) {
            entry.paidRub += payoutAmount;
          }
        } else {
          entry.winningsUsd += nominal;
          if (notifyInfo?.paidAt) {
            entry.paidUsd += payoutAmount;
          }
        }
      }
    }
  }

  const formatted = new Map();
  for (const [key, entry] of index.entries()) {
    const fraudDetails = entry.fraudDetails.map((detail) => ({
      ...detail,
      linkedUsersText: formatLinkedUsers(detail.linkedUserIds, formatUserLabel),
      displayText: buildFraudDetailText(detail, formatUserLabel),
    }));

    formatted.set(key, {
      participations: entry.participations,
      wins: entry.wins,
      winningsText: formatMoneyTotals(
        entry.winningsRub,
        entry.winningsUsd,
        deps.formatRubAmount,
        deps.formatUsdAmount,
      ),
      payoutsText: formatMoneyTotals(
        entry.paidRub,
        entry.paidUsd,
        deps.formatRubAmount,
        deps.formatUsdAmount,
      ),
      fraudLabels: [...entry.fraudLabels],
      fraudDetails,
      hasFraud: fraudDetails.length > 0,
    });
  }

  return formatted;
}

function buildFraudDetailText(detail, formatUserLabel) {
  const drawPart = detail.drawTitle ? `«${detail.drawTitle}»` : detail.drawId;
  const linkedText = formatLinkedUsers(detail.linkedUserIds, formatUserLabel);

  if (detail.kind === "ip") {
    return linkedText
      ? `Бот по IP в ${drawPart}: ${linkedText}`
      : `Бот по IP в ${drawPart}`;
  }
  if (detail.kind === "device") {
    return linkedText
      ? `Бот по девайсу в ${drawPart}: ${linkedText}`
      : `Бот по девайсу в ${drawPart}`;
  }
  if (detail.kind === "wallet") {
    const walletPart = detail.wallet ? ` (${detail.wallet})` : "";
    return linkedText
      ? `Мультиаккаунт${walletPart} в ${drawPart}: ${linkedText}`
      : `Мультиаккаунт${walletPart} в ${drawPart}`;
  }
  if (detail.kind === "subscription") {
    return `Не подписан на канал в ${drawPart}`;
  }
  return detail.reason || detail.label;
}

function getUserProjectActivity(activityIndex, userId, projectId) {
  const fallback = {
    participations: 0,
    wins: 0,
    winningsText: "—",
    payoutsText: "—",
    fraudLabels: [],
    fraudDetails: [],
    hasFraud: false,
  };
  return activityIndex.get(activityKey(userId, projectId)) || fallback;
}


module.exports = {
  buildUserProjectActivityIndex,
  getUserProjectActivity,
};
