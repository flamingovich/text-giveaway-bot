// Avatars are served by redirecting the browser to a Telegram file URL, and
// resolving that URL costs an API call. Nothing remembered it, so every render
// of a list of people asked Telegram again for links it had just handed out -
// getFile grew to 59% of every call the bot made.
//
// Telegram file links stay valid for at least an hour. The TTL here sits well
// under that, so a remembered link is never handed out after it has expired.

const DEFAULT_TTL_MS = 45 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;

function createFileLinkCache(options = {}) {
  const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS;
  const maxEntries = Number(options.maxEntries) > 0 ? Number(options.maxEntries) : DEFAULT_MAX_ENTRIES;
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  const entries = new Map();
  let hits = 0;
  let misses = 0;
  // Two renders of the same page ask for the same avatar at the same moment;
  // without this they would both go to Telegram before either could store it.
  const inFlight = new Map();

  function read(fileId) {
    const entry = entries.get(fileId);
    if (!entry) {
      return null;
    }
    if (now() - entry.at > ttlMs) {
      entries.delete(fileId);
      return null;
    }
    return entry.url;
  }

  function write(fileId, url) {
    if (!url) {
      return;
    }
    entries.delete(fileId);
    if (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) {
        entries.delete(oldest);
      }
    }
    entries.set(fileId, { at: now(), url });
  }

  return {
    async resolve(fileId, fetchLink) {
      if (!fileId) {
        throw new Error("file_id_missing");
      }
      const cached = read(fileId);
      if (cached) {
        hits += 1;
        return cached;
      }
      const pending = inFlight.get(fileId);
      if (pending) {
        hits += 1;
        return pending;
      }
      misses += 1;
      const promise = (async () => {
        const url = String(await fetchLink(fileId));
        write(fileId, url);
        return url;
      })();
      inFlight.set(fileId, promise);
      try {
        return await promise;
      } finally {
        inFlight.delete(fileId);
      }
    },

    stats() {
      const asked = hits + misses;
      return {
        entries: entries.size,
        hits,
        misses,
        savedShare: asked > 0 ? Math.round((hits / asked) * 100) : 0,
      };
    },
  };
}

// One process, one cache: the avatar endpoints live in three different modules
// and there is nothing to gain from each keeping its own copy of the same links.
const sharedFileLinkCache = createFileLinkCache();

function resolveFileLink(telegram, fileId) {
  return sharedFileLinkCache.resolve(fileId, (id) => telegram.getFileLink(id));
}

function getFileLinkCacheStats() {
  return sharedFileLinkCache.stats();
}

module.exports = { createFileLinkCache, resolveFileLink, getFileLinkCacheStats, DEFAULT_TTL_MS };
