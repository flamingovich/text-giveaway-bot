const test = require("node:test");
const assert = require("node:assert");
const { isCannotMessageUserError } = require("./telegram-reach");

const err = (message) => new Error(message);

test("the states in which the bot genuinely cannot write are recognised", () => {
  for (const message of [
    "403: Forbidden: bot can't initiate conversation with a user",
    "400: Bad Request: chat not found",
    "403: Forbidden: bot was blocked by the user",
    "403: Forbidden: user is deactivated",
  ]) {
    assert.equal(isCannotMessageUserError(err(message)), true, message);
  }
});

// Barring someone from a draw because the network hiccuped would be worse than
// the problem this check exists to solve.
test("a passing failure is never read as unreachable", () => {
  for (const message of [
    "fetch failed",
    "connect ETIMEDOUT 149.154.166.110:443",
    "429: Too Many Requests: retry after 6",
    "socket hang up",
    "The operation was aborted due to timeout",
    "500: Internal Server Error",
  ]) {
    assert.equal(isCannotMessageUserError(err(message)), false, message);
  }
});

test("nothing at all is not a verdict", () => {
  assert.equal(isCannotMessageUserError(null), false);
  assert.equal(isCannotMessageUserError(undefined), false);
  assert.equal(isCannotMessageUserError(err("")), false);
});
