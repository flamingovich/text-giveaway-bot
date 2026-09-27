const test = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter } = require("./rate-limiter");

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test("a key is allowed up to the limit, then refused until the window passes", () => {
  const c = clock();
  const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: c.now });
  assert.equal(limiter.take("a").ok, true);
  assert.equal(limiter.take("a").ok, true);
  assert.equal(limiter.take("a").ok, true);
  const refused = limiter.take("a");
  assert.equal(refused.ok, false);
  assert.equal(refused.retryAfterMs, 1000);
  c.advance(1000);
  assert.equal(limiter.take("a").ok, true);
});

test("keys are counted apart", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });
  assert.equal(limiter.take("a").ok, true);
  assert.equal(limiter.take("b").ok, true);
  assert.equal(limiter.take("a").ok, false);
});

test("isBlocked looks without counting, and reset forgets the key", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => 0 });
  limiter.take("a");
  assert.equal(limiter.isBlocked("a"), false);
  limiter.take("a");
  assert.equal(limiter.isBlocked("a"), true);
  limiter.reset("a");
  assert.equal(limiter.isBlocked("a"), false);
});

test("old windows are swept when the table fills up", () => {
  const c = clock();
  const limiter = createRateLimiter({ windowMs: 10, max: 1, now: c.now, maxKeys: 2 });
  limiter.take("a");
  limiter.take("b");
  c.advance(10);
  limiter.take("c");
  assert.equal(limiter.take("a").ok, true, "a's old window was swept, so it starts fresh");
});
