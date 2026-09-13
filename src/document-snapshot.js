// Parsed documents shared between readers that only look.
//
// Every readDocument parses the whole JSON again, and the hot reads are big:
// the done screen polls /live every 2.5 seconds per open screen, and each call
// parsed the 3.3 MB user-project-profiles document, then parsed it once more in
// ensureUserAvatars. On an evening peak that alone kept the single core at 90%
// and every other request waited seconds behind it.
//
// A snapshot is reused until the document can have changed: a write from this
// process (noteWrite) or a commit from any other connection, which SQLite's
// data_version reports. The version is read before the payload, so a commit
// landing in between is caught by the next read rather than hidden by this one.
//
// A snapshot is shared. The code holding one must not change it - that is what
// readDocument, which returns a private copy, is still for.
function createDocumentSnapshotCache({ readVersion, readFresh }) {
  const entries = new Map();
  const localWrites = new Map();

  return {
    read(key) {
      const version = readVersion();
      const local = localWrites.get(key) || 0;
      const hit = entries.get(key);
      if (hit && hit.version === version && hit.local === local) {
        return hit.value;
      }
      const value = readFresh(key);
      entries.set(key, { version, local, value });
      return value;
    },

    noteWrite(key) {
      localWrites.set(key, (localWrites.get(key) || 0) + 1);
      entries.delete(key);
    },
  };
}

module.exports = { createDocumentSnapshotCache };
