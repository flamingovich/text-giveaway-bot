const test = require("node:test");
const assert = require("node:assert");
const { createFileLinkCache } = require("./file-link-cache");

function counter(url = "https://api.telegram.org/file/x") {
  let calls = 0;
  return {
    fetch: async () => {
      calls += 1;
      return `${url}?n=${calls}`;
    },
    get calls() {
      return calls;
    },
  };
}

test("the same avatar is resolved once, not once per render", async () => {
  const cache = createFileLinkCache();
  const telegram = counter();
  const first = await cache.resolve("file-1", telegram.fetch);
  const second = await cache.resolve("file-1", telegram.fetch);
  assert.equal(second, first);
  assert.equal(telegram.calls, 1);
});

test("different avatars are kept apart", async () => {
  const cache = createFileLinkCache();
  const telegram = counter();
  const a = await cache.resolve("file-1", telegram.fetch);
  const b = await cache.resolve("file-2", telegram.fetch);
  assert.notEqual(a, b);
  assert.equal(telegram.calls, 2);
});

// Telegram links stop working after about an hour, so a remembered one must
// never outlive that.
test("a link is fetched again once it has aged out", async () => {
  let clock = 0;
  const cache = createFileLinkCache({ ttlMs: 1000, now: () => clock });
  const telegram = counter();
  await cache.resolve("file-1", telegram.fetch);
  clock += 900;
  await cache.resolve("file-1", telegram.fetch);
  assert.equal(telegram.calls, 1, "still fresh");
  clock += 200;
  await cache.resolve("file-1", telegram.fetch);
  assert.equal(telegram.calls, 2, "expired, asked again");
});

test("a page rendering one avatar twice at once still asks Telegram once", async () => {
  const cache = createFileLinkCache();
  let calls = 0;
  const slow = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "https://api.telegram.org/file/same";
  };
  const [a, b] = await Promise.all([cache.resolve("file-1", slow), cache.resolve("file-1", slow)]);
  assert.equal(a, b);
  assert.equal(calls, 1);
});

test("a failed lookup is not remembered as a link", async () => {
  const cache = createFileLinkCache();
  await assert.rejects(
    cache.resolve("file-1", async () => {
      throw new Error("Bad Request: file not found");
    }),
  );
  const telegram = counter();
  await cache.resolve("file-1", telegram.fetch);
  assert.equal(telegram.calls, 1, "the next request must really go to Telegram");
});

test("the cache cannot grow without bound", async () => {
  const cache = createFileLinkCache({ maxEntries: 3 });
  const telegram = counter();
  for (let i = 0; i < 10; i += 1) {
    await cache.resolve(`file-${i}`, telegram.fetch);
  }
  assert.ok(cache.stats().entries <= 3);
});

test("a missing file id is refused rather than cached", async () => {
  const cache = createFileLinkCache();
  await assert.rejects(cache.resolve("", async () => "x"));
});
