// Which models the support bot may answer with, and in what order.
//
// One model meant one bad minute at the provider became "Что-то подвисло" for
// the person waiting - 334 times, to 58 of 149 conversations. The log says why:
// a 429 from Google and calls hanging past ninety seconds.
//
// The order was chosen by putting the real system prompt to each candidate and
// reading the answers, not from a leaderboard:
//
//   gemini-2.5-flash       what people already hear; short, asks before assuming
//   gemini-2.5-flash-lite  same voice, twice as fast, costs a third
//   claude-haiku-4.5       best of the lot on an angry user, but slower and
//                          dearer - and, crucially, a different provider, so a
//                          Google rate limit cannot take it out too
//
// Two were rejected outright for inventing facts: deepseek-chat answered "по
// базе вижу твою победу" and qwen3 "проверь в базе у меня". Neither has any
// database. A confident fabrication in an argument about money is worse than
// an apology.

const DEFAULT_MODEL_CHAIN = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "anthropic/claude-haiku-4.5",
];

// A hang is the expensive failure: the person sits there and then gets an
// apology anyway. Cap each try low enough that the whole chain still answers
// faster than one old attempt did.
const ATTEMPT_TIMEOUT_MS = Number(process.env.SUPPORT_MODEL_TIMEOUT_MS || 20000);

// OPENROUTER_MODEL in .env names one model, and reading it as the whole chain
// would silently leave the bot with no fallback at all - the exact problem this
// exists to fix. A single name is treated as the preferred model, with the rest
// of the default chain kept behind it.
function parseModelChain(raw, fallback = DEFAULT_MODEL_CHAIN) {
  const asked = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (asked.length === 0) {
    return [...fallback];
  }
  const chain = [...asked];
  if (asked.length === 1) {
    for (const model of fallback) {
      if (!chain.includes(model)) {
        chain.push(model);
      }
    }
  }
  return chain;
}

// Worth trying the next model for: the provider is busy, broken, or silent.
// A bad request or a dead key is not - the next model would fail the same way.
function isWorthAnotherModel(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (/недействителен|invalid api key|user not found/.test(message)) {
    return false;
  }
  return (
    // A model that has been retired or is temporarily unrouteable looks like a
    // configuration error but is not one: the chain exists so the next model
    // answers instead of the bot going quiet.
    /not a valid model|model not found|no endpoints found|no allowed providers/.test(message) ||
    /429|too many requests|rate.?limit/.test(message) ||
    /timeout|timed out|aborted/.test(message) ||
    /50\d|bad gateway|service unavailable|overloaded|provider returned error/.test(message) ||
    /fetch failed|network|econnreset|socket hang up/.test(message)
  );
}

module.exports = {
  DEFAULT_MODEL_CHAIN,
  ATTEMPT_TIMEOUT_MS,
  parseModelChain,
  isWorthAnotherModel,
};
