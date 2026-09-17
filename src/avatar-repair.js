// A stored avatar file_id can die: the person deletes or replaces the photo and
// Telegram answers getFile with 400 "wrong file_id or the file is temporarily
// unavailable". The list job never looks at people who already have a photo on
// file (avatar-freshness.js, onlyMissing), and a person who stops joining is
// never refreshed by a join either - so a dead id stayed for good. Every render
// of the panel asked Telegram about it again and showed an empty circle: 259
// failed requests for one person in one day's log.
//
// The request for the picture repairs it instead: when Telegram rejects the id,
// the person's photo is looked up again and the new id - or "no photo" - is
// stored, and the same request answers with the result.

const DEFAULT_RETRY_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;

// Only Telegram's verdict on the id itself. A timeout, a network error, a 429 or
// a 5xx says nothing about the photo, and looking it up again would not help.
function isFileIdRejected(error) {
  const code = Number(error?.response?.error_code ?? error?.code);
  const description = String(error?.response?.description ?? error?.description ?? "");
  return code === 400 && /file_id|file is temporarily unavailable|file not found/i.test(description);
}

function createAvatarLinkResolver(options) {
  const { readFileId, resolveLink, refresh, onRepair } = options;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const retryAfterMs =
    Number(options.retryAfterMs) > 0 ? Number(options.retryAfterMs) : DEFAULT_RETRY_AFTER_MS;
  const maxEntries = Number(options.maxEntries) > 0 ? Number(options.maxEntries) : DEFAULT_MAX_ENTRIES;

  // When each person was last looked up again. A lookup that changed nothing -
  // Telegram still unsure, or the lookup itself failed - is not repeated on
  // every render; the id gets another chance after retryAfterMs.
  const lastRepairAt = new Map();
  // One page shows the same person in several places; their pictures are asked
  // for at the same moment and should share one lookup.
  const inFlight = new Map();

  function noteRepair(key) {
    lastRepairAt.delete(key);
    if (lastRepairAt.size >= maxEntries) {
      const oldest = lastRepairAt.keys().next().value;
      if (oldest !== undefined) {
        lastRepairAt.delete(oldest);
      }
    }
    lastRepairAt.set(key, now());
  }

  // true when a lookup ran for this person (here or in a request alongside).
  async function repair(key, error, staleFileId) {
    if (!isFileIdRejected(error)) {
      return false;
    }
    const pending = inFlight.get(key);
    if (pending) {
      await pending;
      return true;
    }
    const last = lastRepairAt.get(key);
    if (last !== undefined && now() - last < retryAfterMs) {
      return false;
    }
    noteRepair(key);
    const run = (async () => {
      try {
        await refresh(key);
      } catch {
        // The picture is still unavailable; the caller answers so.
      }
      if (onRepair) {
        try {
          onRepair({ userId: key, staleFileId, fileId: readFileId(key) || "" });
        } catch {
          // Reporting must not break the answer.
        }
      }
    })();
    inFlight.set(key, run);
    try {
      await run;
    } finally {
      inFlight.delete(key);
    }
    return true;
  }

  return {
    // The file URL for the person's photo, null when they have none on file.
    // Throws when a photo is on file but cannot be had right now.
    async resolve(userId) {
      const key = String(userId);
      const fileId = readFileId(key);
      if (!fileId) {
        return null;
      }
      try {
        return await resolveLink(fileId);
      } catch (error) {
        if (!(await repair(key, error, fileId))) {
          throw error;
        }
        const freshId = readFileId(key);
        if (!freshId) {
          return null;
        }
        if (freshId === fileId) {
          throw error;
        }
        return resolveLink(freshId);
      }
    },
  };
}

module.exports = { isFileIdRejected, createAvatarLinkResolver, DEFAULT_RETRY_AFTER_MS };
