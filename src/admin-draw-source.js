// The admin panel used to read only the active draws document. Finished draws
// move to draws-archive after two weeks, so on production that hid 75% of the
// draws, 61% of the participations and 92% of the payouts: every per-user
// number in the panel was understated several times over, and the anti-fraud
// links between accounts that only ever met in an archived draw were invisible.
// Everything the panel reports goes through here so that cannot happen again.

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function notificationCount(draw) {
  return Object.keys(draw?.winnerNotifications || {}).length;
}

// A draw can sit in both documents at once: archiving moves it while some other
// pass still holds a snapshot that lists it as active, and writing that snapshot
// back puts it into the active document again. Keep the copy that carries the
// most progress rather than whichever happened to be read second.
function pickRicherCopy(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const leftFinished = left.status === "finished";
  const rightFinished = right.status === "finished";
  if (leftFinished !== rightFinished) {
    return leftFinished ? left : right;
  }

  const byNotifications = notificationCount(right) - notificationCount(left);
  if (byNotifications !== 0) {
    return byNotifications > 0 ? right : left;
  }

  const byParticipants =
    asArray(right.participantIds).length - asArray(left.participantIds).length;
  if (byParticipants !== 0) {
    return byParticipants > 0 ? right : left;
  }

  return left;
}

function mergeDrawLists(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const draw of asArray(list)) {
      if (!draw || draw.id === undefined || draw.id === null) {
        continue;
      }
      const key = String(draw.id);
      byId.set(key, pickRicherCopy(byId.get(key), draw));
    }
  }
  return [...byId.values()];
}

// deps.readArchivedDraws is optional so a caller that genuinely wants only live
// draws can leave it out, but the panel always passes it.
function collectAllDraws(deps) {
  const active = asArray(deps?.readData?.()?.draws);
  const archived = asArray(deps?.readArchivedDraws?.()?.draws);
  return mergeDrawLists(active, archived);
}

module.exports = {
  asArray,
  pickRicherCopy,
  mergeDrawLists,
  collectAllDraws,
};
