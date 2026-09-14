// Which people's photos are worth asking Telegram about.
//
// /live runs this on every poll - every 2.5 seconds per open done screen. The
// old check had two faults that together kept the server busy for nothing:
// - it picked "no photo on file" before looking at when we last asked, so
//   people who simply have no photo were picked on every poll, forever, and
//   took every slot of the limit - nobody behind them was ever checked;
// - for each of them avatarIsFresh parsed the whole 3.3 MB profiles document
//   just to read one date, and then found it fresh and did nothing.
// Six such parses per poll were 350-500 ms of a stalled server, with no call to
// Telegram and nothing written.
//
// The answer to "when did we last ask" stays in the document (meta.avatarUpdatedAt):
// kept only in memory it would be lost on every restart, and a restart would
// send every photo-less participant to Telegram again.

function isAvatarCheckFresh(meta, now, ttlMs) {
  const checkedAt = Date.parse(meta?.avatarUpdatedAt || "");
  return Number.isFinite(checkedAt) && now - checkedAt < ttlMs;
}

// onlyMissing keeps its old meaning: people who already have a photo on file are
// left to the callers that refresh one person on purpose.
function pickAvatarCheckTargets(userIds, profiles, { limit, onlyMissing = true, now, ttlMs }) {
  const users = profiles?.users || {};
  const picked = [];
  for (const userKey of new Set((userIds || []).map((id) => String(id)))) {
    if (picked.length >= limit) {
      break;
    }
    if (!/^\d+$/.test(userKey)) {
      continue;
    }
    const meta = users[userKey]?.meta;
    if (onlyMissing && meta?.avatarFileId) {
      continue;
    }
    if (isAvatarCheckFresh(meta, now, ttlMs)) {
      continue;
    }
    picked.push(userKey);
  }
  return picked;
}

// Identifies a queued job, so the same list asked for again before the queued
// job has started is not queued a second time.
function avatarJobKey(userIds, { limit, onlyMissing = true }) {
  return `${onlyMissing ? 1 : 0}|${limit}|${(userIds || []).map(String).join(",")}`;
}

module.exports = {
  isAvatarCheckFresh,
  pickAvatarCheckTargets,
  avatarJobKey,
};
