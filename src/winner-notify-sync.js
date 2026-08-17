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

function mergeLiveWinnerNotifications(staleData, liveData = readData()) {
  const liveById = new Map((liveData.draws || []).map((draw) => [String(draw.id), draw]));
  for (const draw of staleData.draws || []) {
    const liveDraw = liveById.get(String(draw.id));
    if (!liveDraw) {
      continue;
    }
    const liveNotifies = liveDraw.winnerNotifications || {};
    const staleNotifies = draw.winnerNotifications || {};
    const userIds = new Set([...Object.keys(liveNotifies), ...Object.keys(staleNotifies)]);
    if (!userIds.size) {
      continue;
    }
    draw.winnerNotifications = { ...staleNotifies };
    for (const userId of userIds) {
      draw.winnerNotifications[userId] = pickWinnerNotify(staleNotifies[userId], liveNotifies[userId]);
    }
  }
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
  mergeLiveWinnerNotifications,
  writeDataPreservingLiveWinners,
  getLiveWinnerNotify,
};
