const { readData, writeData } = require("./storage");

function hasSavedWinnerDepositAddress(notify) {
  if (!notify) {
    return false;
  }
  if (String(notify.trc20Address || "").trim()) {
    return true;
  }
  return Boolean(notify.addressReceivedAt);
}

function winnerNotifyRank(notify) {
  if (!notify) {
    return 0;
  }
  if (notify.paidAt) {
    return 100;
  }
  if (notify.status === "confirmed" || hasSavedWinnerDepositAddress(notify)) {
    return 80;
  }
  if (notify.status === "forfeited" || notify.status === "expired") {
    return 50;
  }
  if (notify.status === "awaiting_address") {
    return 40;
  }
  if (notify.verifiedAt) {
    return 30;
  }
  return 10;
}

function notifyTimestamp(notify) {
  if (!notify) {
    return "";
  }
  return (
    notify.addressReceivedAt ||
    notify.forfeitedAt ||
    notify.verifiedAt ||
    notify.addressExpiresAt ||
    notify.expiredAt ||
    ""
  );
}

function pickWinnerNotify(stale, live) {
  if (!live) {
    return stale;
  }
  if (!stale) {
    return live;
  }
  const liveRank = winnerNotifyRank(live);
  const staleRank = winnerNotifyRank(stale);
  if (liveRank > staleRank) {
    return live;
  }
  if (staleRank > liveRank) {
    return stale;
  }
  return notifyTimestamp(live) >= notifyTimestamp(stale) ? live : stale;
}

function mergeWinnerNotificationMaps(staleNotifies = {}, liveNotifies = {}) {
  const userIds = new Set([...Object.keys(staleNotifies), ...Object.keys(liveNotifies)]);
  const merged = {};
  for (const userId of userIds) {
    merged[userId] = pickWinnerNotify(staleNotifies[userId], liveNotifies[userId]);
  }
  return merged;
}

function isFinishedDraw(draw) {
  return String(draw?.status || "") === "finished";
}

function pickDrawForWrite(stale, live) {
  if (!live) {
    return stale;
  }
  if (!stale) {
    return live;
  }
  const staleFinished = isFinishedDraw(stale);
  const liveFinished = isFinishedDraw(live);
  if (staleFinished && !liveFinished) {
    return stale;
  }
  if (liveFinished && !staleFinished) {
    return live;
  }

  const merged = { ...stale };
  merged.winnerNotifications = mergeWinnerNotificationMaps(
    stale.winnerNotifications,
    live.winnerNotifications,
  );
  if (!staleFinished && (live.participantIds || []).length > (stale.participantIds || []).length) {
    merged.participantIds = live.participantIds;
  }
  return merged;
}

function mergeLiveWinnerNotifications(staleData, liveData = readData()) {
  const staleDraws = staleData.draws || [];
  const liveDraws = liveData.draws || [];
  const liveById = new Map(liveDraws.map((draw) => [String(draw.id), draw]));
  const seen = new Set();
  const mergedDraws = [];

  for (const stale of staleDraws) {
    const id = String(stale.id);
    seen.add(id);
    mergedDraws.push(pickDrawForWrite(stale, liveById.get(id)));
  }
  for (const live of liveDraws) {
    const id = String(live.id);
    if (seen.has(id)) {
      continue;
    }
    mergedDraws.push(live);
  }

  staleData.draws = mergedDraws;
  return staleData;
}

function writeDataPreservingLiveWinners(data) {
  mergeLiveWinnerNotifications(data);
  writeData(data);
}

function getLiveWinnerNotify(drawId, userId) {
  const live = readData();
  const draw = (live.draws || []).find((item) => String(item.id) === String(drawId));
  return draw?.winnerNotifications?.[String(userId)] || null;
}

module.exports = {
  hasSavedWinnerDepositAddress,
  winnerNotifyRank,
  pickWinnerNotify,
  pickDrawForWrite,
  mergeLiveWinnerNotifications,
  writeDataPreservingLiveWinners,
  getLiveWinnerNotify,
};
