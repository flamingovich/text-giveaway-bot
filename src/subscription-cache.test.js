const test = require("node:test");
const assert = require("node:assert");
const { createSubscriptionCache } = require("./subscription-cache");

const YES = { ok: true, subscribed: true, status: "member" };
const NO = { ok: true, subscribed: false, status: "left" };
const BROKEN = { ok: false, subscribed: false, status: "unknown", error: "timeout" };

test("a repeat question inside one join is answered without Telegram", () => {
  const cache = createSubscriptionCache();
  cache.write("@chan", 1, YES);
  assert.deepEqual(cache.read("@chan", 1), YES);
  assert.equal(cache.stats().hits, 1);
});

// The whole reason this cache is allowed to exist: a remembered "no" would
// leave someone who just subscribed unable to get past the channel step.
test("a negative answer is never remembered", () => {
  const cache = createSubscriptionCache();
  assert.equal(cache.write("@chan", 1, NO), false);
  assert.equal(cache.read("@chan", 1), null);
});

test("a failed check is never remembered", () => {
  const cache = createSubscriptionCache();
  assert.equal(cache.write("@chan", 1, BROKEN), false);
  assert.equal(cache.read("@chan", 1), null);
});

test("someone who subscribes right after a refusal is not held back", () => {
  const cache = createSubscriptionCache();
  cache.write("@chan", 7, NO);
  assert.equal(cache.read("@chan", 7), null, "the refusal must not linger");
  cache.write("@chan", 7, YES);
  assert.deepEqual(cache.read("@chan", 7), YES);
});

test("an answer stops being used once it is stale", () => {
  let clock = 1000;
  const cache = createSubscriptionCache({ ttlMs: 500, now: () => clock });
  cache.write("@chan", 1, YES);
  clock += 400;
  assert.deepEqual(cache.read("@chan", 1), YES);
  clock += 200;
  assert.equal(cache.read("@chan", 1), null);
});

test("answers are kept per channel and per person", () => {
  const cache = createSubscriptionCache();
  cache.write("@a", 1, YES);
  assert.equal(cache.read("@b", 1), null);
  assert.equal(cache.read("@a", 2), null);
});

test("the cache cannot grow without bound", () => {
  const cache = createSubscriptionCache({ maxEntries: 3 });
  for (let id = 1; id <= 10; id += 1) {
    cache.write("@chan", id, YES);
  }
  assert.ok(cache.stats().entries <= 3);
  assert.deepEqual(cache.read("@chan", 10), YES, "the newest answer survives");
});

test("refreshing an answer keeps it from being evicted as the oldest", () => {
  let clock = 0;
  const cache = createSubscriptionCache({ maxEntries: 2, now: () => (clock += 1) });
  cache.write("@chan", 1, YES);
  cache.write("@chan", 2, YES);
  cache.write("@chan", 1, YES);
  cache.write("@chan", 3, YES);
  assert.deepEqual(cache.read("@chan", 1), YES, "the refreshed one stays");
});

test("savings are reported honestly", () => {
  const cache = createSubscriptionCache();
  cache.read("@chan", 1);
  cache.write("@chan", 1, YES);
  cache.read("@chan", 1);
  cache.read("@chan", 1);
  const stats = cache.stats();
  assert.equal(stats.hits, 2);
  assert.equal(stats.misses, 1);
  assert.equal(stats.savedShare, 67);
});
