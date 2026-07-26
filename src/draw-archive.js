const { DateTime } = require("luxon");

const ARCHIVE_AFTER_DAYS = 14;

function getDrawFinishedAtIso(draw) {
  if (!draw || draw.status !== "finished") {
    return null;
  }
  return draw.finishedAt || draw.endAt || draw.createdAt || null;
}

function isDrawReadyForArchive(draw, cutoff, timezone) {
  const finishedAtIso = getDrawFinishedAtIso(draw);
  if (!finishedAtIso) {
    return false;
  }
  const finishedAt = DateTime.fromISO(finishedAtIso, { zone: timezone });
  if (!finishedAt.isValid) {
    return false;
  }
  return finishedAt <= cutoff;
}

function archiveStaleDraws(deps) {
  const { readData, writeData, readArchivedDraws, writeArchivedDraws, timezone } = deps;
  const cutoff = DateTime.now().setZone(timezone).minus({ days: ARCHIVE_AFTER_DAYS });
  const data = readData();
  const archive = readArchivedDraws();
  const archiveDraws = archive.draws || [];
  const archiveIds = new Set(archiveDraws.map((draw) => draw.id));
  const keep = [];
  let moved = 0;

  for (const draw of data.draws || []) {
    if (isDrawReadyForArchive(draw, cutoff, timezone)) {
      if (!archiveIds.has(draw.id)) {
        archiveDraws.push(draw);
        archiveIds.add(draw.id);
      }
      moved += 1;
      continue;
    }
    keep.push(draw);
  }

  if (moved === 0) {
    return { moved: 0, activeCount: keep.length, archivedCount: archiveDraws.length };
  }

  data.draws = keep;
  archive.draws = archiveDraws;
  writeData(data);
  writeArchivedDraws(archive);
  return { moved, activeCount: keep.length, archivedCount: archiveDraws.length };
}

module.exports = {
  ARCHIVE_AFTER_DAYS,
  getDrawFinishedAtIso,
  archiveStaleDraws,
};
