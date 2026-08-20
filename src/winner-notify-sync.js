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

// The moment of the most recent decision about this winner, of whatever kind.
// The old version read a priority list with addressReceivedAt first, which made
// the address the winner's permanent high-water mark: a forfeit decided days
// later compared as older than the address it already had, lost the merge, and
// was made again on the next pass. One prize was forfeited 117 times that way,
// spending a getChatMember call and a write every time, and never actually
// changed in the database.
function notifyTimestamp(notify) {
  if (!notify) {
    return "";
  }
  return (
    [
      notify.paidAt,
      notify.forfeitedAt,
      notify.expiredAt,
      notify.addressReceivedAt,
      notify.verifiedAt,
      notify.addressExpiresAt,
      notify.sentAt,
    ]
      .filter(Boolean)
      .map(String)
      .sort()
      .pop() || ""
  );
}

// "When did we last look at this" is bookkeeping, not a decision, so whichever
// side looked more recently is right no matter which object won the merge.
// Without this the payout queue stamped the time on every pass and the merge
// threw the stamp away whenever nothing else had changed - which is the common
// case, since a winner who is still subscribed produces no new decision. Every
// pending winner then looked overdue on every scheduler tick, and a recheck
// meant to run once an hour became most of the bot's Telegram traffic.
const CHECK_STAMP_FIELDS = ["payoutQueueSubscriptionCheckedAt"];

function carryNewerCheckStamps(chosen, other) {
  if (!chosen || !other) {
    return chosen;
  }
  for (const field of CHECK_STAMP_FIELDS) {
    const mine = String(chosen[field] || "");
    const theirs = String(other[field] || "");
    if (theirs > mine) {
      chosen[field] = other[field];
    }
  }
  return chosen;
}

function pickWinnerNotify(stale, live) {
  if (!live) {
    return stale;
  }
  if (!stale) {
    return live;
  }

  // Payment is the one thing nothing undoes.
  if (Boolean(live.paidAt) !== Boolean(stale.paidAt)) {
    return live.paidAt ? carryNewerCheckStamps(live, stale) : carryNewerCheckStamps(stale, live);
  }

  // Otherwise the newer decision stands, whichever side made it.
  const liveAt = notifyTimestamp(live);
  const staleAt = notifyTimestamp(stale);
  if (liveAt !== staleAt) {
    return liveAt > staleAt ? carryNewerCheckStamps(live, stale) : carryNewerCheckStamps(stale, live);
  }

  // Same instant, or neither is dated: fall back to how far along each is.
  return winnerNotifyRank(live) >= winnerNotifyRank(stale)
    ? carryNewerCheckStamps(live, stale)
    : carryNewerCheckStamps(stale, live);
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

const DRAW_STATUS_RANK = { draft: 0, scheduled: 1, active: 2, finished: 3 };

function drawStatusRank(draw) {
  const rank = DRAW_STATUS_RANK[String(draw?.status || "")];
  return rank === undefined ? -1 : rank;
}

function firstMessageId(...draws) {
  for (const draw of draws) {
    if (draw?.messageId) {
      return draw.messageId;
    }
  }
  return null;
}

function pickParticipantIds(staleIds = [], liveIds = []) {
  const seen = new Set();
  const out = [];
  const primary = (liveIds || []).length > (staleIds || []).length ? liveIds : staleIds;
  const secondary = primary === staleIds ? liveIds : staleIds;
  for (const id of [...(primary || []), ...(secondary || [])]) {
    const key = String(id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(id);
  }
  return out;
}

function newerTimestamp(left, right) {
  const leftAt = Date.parse(left || "");
  const rightAt = Date.parse(right || "");
  if (!Number.isFinite(rightAt)) {
    return false;
  }
  if (!Number.isFinite(leftAt)) {
    return true;
  }
  return rightAt > leftAt;
}

function mergeDrawProgress(primary, secondary) {
  const merged = { ...primary };
  merged.winnerNotifications = mergeWinnerNotificationMaps(
    primary.winnerNotifications,
    secondary.winnerNotifications,
  );
  merged.participantIds = pickParticipantIds(primary.participantIds, secondary.participantIds);
  merged.participantMeta = {
    ...(secondary.participantMeta || {}),
    ...(primary.participantMeta || {}),
  };
  merged.messageId = firstMessageId(primary, secondary);
  if (!primary.messageId && secondary.messageId) {
    merged.messageType = secondary.messageType || merged.messageType;
    merged.awaitingChannelPost = false;
  }

  if (newerTimestamp(primary.postTimeLeftUpdatedAt, secondary.postTimeLeftUpdatedAt)) {
    merged.postTimeLeftLabel = secondary.postTimeLeftLabel;
    merged.postTimeLeftUpdatedAt = secondary.postTimeLeftUpdatedAt;
  }

  // A snapshot read before a publish still says "scheduled". Writing that back
  // would hand the draw to the scheduler again and post it to the channel twice,
  // so the lifecycle only ever moves forward here. A deliberate rollback (a
  // publish Telegram rejected outright) goes through persistDrawPublishState,
  // which writes against fresh data and never passes through this merge.
  if (drawStatusRank(secondary) > drawStatusRank(primary)) {
    merged.status = secondary.status;
    if (secondary.finishedAt) {
      merged.finishedAt = secondary.finishedAt;
    }
    if (Array.isArray(secondary.winnerIds) && !(merged.winnerIds || []).length) {
      merged.winnerIds = secondary.winnerIds;
    }
  }

  const actual = (merged.participantIds || []).length;
  const posted = [primary.postParticipantCount, secondary.postParticipantCount]
    .map(Number)
    .filter(Number.isFinite);
  if (posted.length > 0) {
    // This tracks what the post already shows. Keeping the lower of the two
    // pinned it at the oldest value, so the button never caught up and every
    // sync retried the same edit. The higher value is the one already posted.
    merged.postParticipantCount = Math.min(Math.max(...posted), actual);
  }

  return merged;
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
  if (liveFinished && !staleFinished) {
    return mergeDrawProgress(live, stale);
  }
  if (staleFinished && !liveFinished) {
    return mergeDrawProgress(stale, live);
  }
  return mergeDrawProgress(stale, live);
}

// Replace the contents of an object without replacing the object itself, so a
// caller still holding a reference to it keeps seeing the merged result.
function replaceContentsInPlace(target, source) {
  if (target === source) {
    return target;
  }
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete target[key];
    }
  }
  Object.assign(target, source);
  return target;
}

// Merging used to hand back fresh draw objects in a fresh array. Callers such as
// the scheduler pass keep iterating the array they read and keep mutating the
// draw they picked out of it, so after the first save those references pointed
// at objects no longer connected to the document. Every later save then wrote
// the pre-finish copy back: the channel post and the winner DMs went out while
// the draw stayed "active" with no winners stored, and the next pass drew a
// different set of winners. Merge in place so references stay live.
function mergeLiveWinnerNotifications(staleData, liveData = readData()) {
  const staleDraws = staleData.draws || [];
  const liveDraws = liveData.draws || [];
  const liveById = new Map(liveDraws.map((draw) => [String(draw.id), draw]));
  const seen = new Set();

  for (const stale of staleDraws) {
    const id = String(stale.id);
    seen.add(id);
    const live = liveById.get(id);
    if (!live) {
      continue;
    }
    replaceContentsInPlace(stale, pickDrawForWrite(stale, live));
  }
  for (const live of liveDraws) {
    const id = String(live.id);
    if (seen.has(id)) {
      continue;
    }
    staleDraws.push(live);
  }

  staleData.draws = staleDraws;
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
  pickParticipantIds,
  mergeLiveWinnerNotifications,
  writeDataPreservingLiveWinners,
  getLiveWinnerNotify,
};
