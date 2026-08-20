// "Is this person subscribed to the channel" is the most-asked question the bot
// puts to Telegram - during one join it gets asked three or four times, with an
// identical answer every time. This remembers the answer for a short while.
//
// The one rule that matters: only a positive answer may be remembered. Caching
// a "not subscribed" would break joining outright - the person subscribes,
// presses "I subscribed", and we would answer from the cache that they still
// have not, leaving them stuck with no way forward.

const DEFAULT_TTL_MS = 3 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;

function createSubscriptionCache(options = {}) {
  const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS;
  const maxEntries = Number(options.maxEntries) > 0 ? Number(options.maxEntries) : DEFAULT_MAX_ENTRIES;
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  const entries = new Map();
  let hits = 0;
  let misses = 0;

  const keyOf = (channelId, userId) => `${channelId}:${userId}`;

  return {
    read(channelId, userId) {
      const key = keyOf(channelId, userId);
      const entry = entries.get(key);
      if (!entry) {
        misses += 1;
        return null;
      }
      if (now() - entry.at > ttlMs) {
        entries.delete(key);
        misses += 1;
        return null;
      }
      hits += 1;
      return entry.result;
    },

    write(channelId, userId, result) {
      if (!result || result.ok !== true || result.subscribed !== true) {
        return false;
      }
      const key = keyOf(channelId, userId);
      // Re-inserting moves the key to the end, so iteration order stays recency
      // and the eviction below drops the genuinely oldest entry.
      entries.delete(key);
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) {
          entries.delete(oldest);
        }
      }
      entries.set(key, { at: now(), result });
      return true;
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

module.exports = { createSubscriptionCache, DEFAULT_TTL_MS };
