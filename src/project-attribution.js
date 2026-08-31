// Who brought a person to a project first.
//
// The panel already inferred something like this on the fly, but it only
// answered for people whose referral was verified, it read the live draws and
// never the archive - where three quarters of the history lives - and it sorted
// by draw creation time, so two draws created minutes apart could put the
// answer in the wrong order. Being computed on every render, it also changed
// under the reader as draws moved to the archive.
//
// This settles it once, from the whole history, and the result is meant to be
// written down and left alone: an attribution that moves is not an attribution.

// The per-participant stamp is the real moment someone joined. Draw creation is
// a coarse fallback for the 25 old draws that never recorded one - it keeps the
// order between draws right even when it cannot order people inside one.
function participationTimestamp(draw, userId) {
  const meta = (draw.participantMeta || {})[String(userId)] || {};
  const exact = Date.parse(meta.joinedAt || meta.updatedAt || "");
  if (Number.isFinite(exact)) {
    return { at: exact, source: "participant" };
  }
  const coarse = Date.parse(draw.createdAt || draw.publishAt || draw.startAt || "");
  if (Number.isFinite(coarse)) {
    return { at: coarse, source: "draw" };
  }
  return null;
}

function keyOf(userId, projectId) {
  return `${userId}|${projectId}`;
}

// resolveProject(draw) -> { projectId, ownerId } | null
function computeFirstTouch(draws = [], resolveProject) {
  const firstTouch = new Map();

  for (const draw of draws) {
    const resolved = resolveProject ? resolveProject(draw) : null;
    if (!resolved || !resolved.projectId || !resolved.ownerId) {
      continue;
    }
    const projectId = String(resolved.projectId);
    const ownerId = String(resolved.ownerId);

    for (const participant of draw.participantIds || []) {
      const userId = String(participant);
      const stamp = participationTimestamp(draw, userId);
      if (!stamp) {
        continue;
      }
      const key = keyOf(userId, projectId);
      const current = firstTouch.get(key);
      if (
        !current ||
        stamp.at < current.at ||
        // Same instant happens when both fell back to a draw's creation time.
        // Preferring the exact stamp keeps the better-evidenced answer.
        (stamp.at === current.at && current.source === "draw" && stamp.source === "participant")
      ) {
        firstTouch.set(key, {
          userId,
          projectId,
          ownerId,
          at: stamp.at,
          source: stamp.source,
          drawId: String(draw.id),
        });
      }
    }
  }

  return firstTouch;
}

function toProfilePatch(entry) {
  return {
    firstTouchOwnerId: Number(entry.ownerId),
    firstTouchAt: new Date(entry.at).toISOString(),
    firstTouchDrawId: entry.drawId,
    firstTouchSource: entry.source,
  };
}

// A person can only be brought to a project once, so an attribution already on
// file is never overwritten - not by a backfill, not by a later join.
function needsAttribution(projectData) {
  return !projectData || projectData.firstTouchOwnerId == null;
}

module.exports = {
  participationTimestamp,
  computeFirstTouch,
  toProfilePatch,
  needsAttribution,
  keyOf,
};
