// Counts requests per key in fixed windows and says when a key has had enough.
//
// Nothing limited how often anything could be called: the web admin's password
// could be guessed without pause, and the join API took as many requests as a
// script cared to send. This is kept in memory on purpose - the limits exist to
// stop floods and guessing, and a restart forgetting them costs nothing.

function createRateLimiter({ windowMs, max, now = Date.now, maxKeys = 20000 }) {
  const windows = new Map();

  function sweep(at) {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= at) {
        windows.delete(key);
      }
    }
  }

  // Records one request for the key and says whether it is allowed.
  function take(key) {
    const at = now();
    let entry = windows.get(key);
    if (!entry || entry.resetAt <= at) {
      if (windows.size >= maxKeys) {
        sweep(at);
      }
      entry = { count: 0, resetAt: at + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return { ok: false, retryAfterMs: entry.resetAt - at };
    }
    return { ok: true, retryAfterMs: 0 };
  }

  // Looks without counting - for limits that only count failures.
  function isBlocked(key) {
    const entry = windows.get(key);
    return Boolean(entry && entry.resetAt > now() && entry.count >= max);
  }

  function reset(key) {
    windows.delete(key);
  }

  return { take, isBlocked, reset };
}

module.exports = { createRateLimiter };
