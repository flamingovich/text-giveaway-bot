// When Telegram answers 429 it says how long to wait (parameters.retry_after).
// Post edits used to give up on the spot: the startup sync logged "пропуск" and
// left the post as it was, and a finished draw's post kept its old text until
// the scheduler happened to try again. For a background edit the right answer
// is to wait exactly as long as asked and go again.
//
// This wraps a whole attempt, not a single API call: the post edits already
// run under an 8-second timeout of their own, and a wait inside that timeout
// would trip it while the retry carried on unseen in the background. Each
// attempt gets a fresh timeout here. A wait longer than maxWaitSeconds is not
// waited out at all - the 429 is thrown as before.

function getRetryAfterSeconds(error) {
  if (!error) {
    return null;
  }
  const fromParameters = Number(error.parameters?.retry_after ?? error.response?.parameters?.retry_after);
  if (Number.isFinite(fromParameters) && fromParameters >= 0) {
    return fromParameters;
  }
  // Some wrappers rethrow with only the text: "429: Too Many Requests: retry after 6".
  const match = String(error.message || "").match(/Too Many Requests: retry after (\d+)/i);
  return match ? Number(match[1]) : null;
}

async function withFloodRetry(task, options = {}) {
  const {
    maxRetries = 2,
    maxWaitSeconds = 20,
    label = "запрос",
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = (message) => console.warn(message),
  } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const waitSeconds = getRetryAfterSeconds(error);
      if (waitSeconds == null || attempt >= maxRetries || waitSeconds > maxWaitSeconds) {
        throw error;
      }
      log(`[telegram] ${label}: 429, жду ${waitSeconds} с и повторяю (попытка ${attempt + 2})`);
      // A little over the asked time: arriving on the exact second tends to
      // land just before Telegram's window reopens.
      await sleep(waitSeconds * 1000 + 250);
    }
  }
}

module.exports = {
  getRetryAfterSeconds,
  withFloodRetry,
};
