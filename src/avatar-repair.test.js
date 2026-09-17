const test = require("node:test");
const assert = require("node:assert/strict");

const { isFileIdRejected, createAvatarLinkResolver } = require("./avatar-repair");

// Shaped like Telegraf's TelegramError: the response, plus getters over it.
class FakeTelegramError extends Error {
  constructor(errorCode, description) {
    super(`${errorCode}: ${description}`);
    this.response = { ok: false, error_code: errorCode, description };
  }
  get code() {
    return this.response.error_code;
  }
  get description() {
    return this.response.description;
  }
}

const REJECTED = () => new FakeTelegramError(400, "Bad Request: wrong file_id or the file is temporarily unavailable");

// A small world: stored file ids, which ids Telegram still accepts, and what a
// fresh look at each person's profile would find.
function makeWorld({ stored = {}, alive = [], current = {}, clock = { t: 0 } } = {}) {
  const world = {
    stored: { ...stored },
    alive: new Set(alive),
    current: { ...current },
    calls: { resolveLink: [], refresh: [] },
    repairs: [],
    clock,
    failNext: null,
    refreshError: null,
    refreshGate: null,
  };
  world.resolver = createAvatarLinkResolver({
    readFileId: (userId) => world.stored[userId] || "",
    resolveLink: async (fileId) => {
      world.calls.resolveLink.push(fileId);
      if (world.failNext) {
        const error = world.failNext;
        world.failNext = null;
        throw error;
      }
      if (!world.alive.has(fileId)) {
        throw REJECTED();
      }
      return `https://api.telegram.org/file/bot<token>/${fileId}.jpg`;
    },
    refresh: async (userId) => {
      world.calls.refresh.push(userId);
      if (world.refreshGate) {
        await world.refreshGate;
      }
      if (world.refreshError) {
        throw world.refreshError;
      }
      if (!(userId in world.current)) {
        return; // the lookup failed: nothing is written
      }
      if (world.current[userId]) {
        world.stored[userId] = world.current[userId];
      } else {
        delete world.stored[userId];
      }
    },
    onRepair: (event) => world.repairs.push(event),
    now: () => world.clock.t,
    retryAfterMs: 1000,
  });
  return world;
}

test("isFileIdRejected: Telegram's verdict on the id", () => {
  assert.equal(isFileIdRejected(REJECTED()), true);
  assert.equal(isFileIdRejected(new FakeTelegramError(400, "Bad Request: invalid file_id")), true);
  assert.equal(isFileIdRejected(new FakeTelegramError(400, "Bad Request: file not found")), true);
  // A plain object with the same response, as a proxy or an older client may give.
  assert.equal(isFileIdRejected({ response: { error_code: 400, description: "Bad Request: wrong file_id" } }), true);
});

test("isFileIdRejected: failures that say nothing about the photo", () => {
  assert.equal(isFileIdRejected(new FakeTelegramError(429, "Too Many Requests: retry after 5")), false);
  assert.equal(isFileIdRejected(new FakeTelegramError(500, "Internal Server Error")), false);
  assert.equal(isFileIdRejected(new FakeTelegramError(400, "Bad Request: file is too big")), false);
  // Only a 400 is about the id, whatever the words.
  assert.equal(isFileIdRejected(new FakeTelegramError(502, "Bad Gateway: file is temporarily unavailable")), false);
  assert.equal(isFileIdRejected(new FakeTelegramError(429, "Too Many Requests: getFile file_id")), false);
  assert.equal(isFileIdRejected(new FakeTelegramError(401, "Unauthorized")), false);
  assert.equal(isFileIdRejected(Object.assign(new Error("request timed out"), { code: "ETIMEDOUT" })), false);
  assert.equal(isFileIdRejected(new TypeError("Cannot read properties of null (reading 'telegram')")), false);
  assert.equal(isFileIdRejected(new Error("avatar_timeout")), false);
  assert.equal(isFileIdRejected(null), false);
  assert.equal(isFileIdRejected(undefined), false);
});

test("a working photo is handed out without any lookup", async () => {
  const world = makeWorld({ stored: { 1: "old" }, alive: ["old"] });
  assert.match(await world.resolver.resolve(1), /old\.jpg$/);
  assert.deepEqual(world.calls.refresh, []);
  assert.deepEqual(world.repairs, []);
});

test("nobody's photo on file: no picture and no call to Telegram", async () => {
  const world = makeWorld();
  assert.equal(await world.resolver.resolve(1), null);
  assert.deepEqual(world.calls, { resolveLink: [], refresh: [] });
});

test("a replaced photo is looked up again and served in the same request", async () => {
  const world = makeWorld({ stored: { 7: "old" }, alive: ["new"], current: { 7: "new" } });
  assert.match(await world.resolver.resolve(7), /new\.jpg$/);
  assert.deepEqual(world.calls.resolveLink, ["old", "new"]);
  assert.deepEqual(world.calls.refresh, ["7"]);
  assert.equal(world.stored[7], "new");
  assert.deepEqual(world.repairs, [{ userId: "7", staleFileId: "old", fileId: "new" }]);
  // The next render goes straight to the new photo.
  assert.match(await world.resolver.resolve(7), /new\.jpg$/);
  assert.deepEqual(world.calls.refresh, ["7"]);
});

test("a deleted photo becomes no photo, and stays so without more calls", async () => {
  const world = makeWorld({ stored: { 5: "old" }, current: { 5: null } });
  assert.equal(await world.resolver.resolve(5), null);
  assert.equal(world.stored[5], undefined);
  assert.deepEqual(world.repairs, [{ userId: "5", staleFileId: "old", fileId: "" }]);
  const before = world.calls.resolveLink.length;
  assert.equal(await world.resolver.resolve(5), null);
  assert.equal(world.calls.resolveLink.length, before, "nothing on file, nothing to ask");
});

test("a lookup that finds the same id leaves the picture unavailable", async () => {
  // Telegram said "temporarily unavailable" and the profile still lists that very file.
  const world = makeWorld({ stored: { 3: "same" }, current: { 3: "same" } });
  await assert.rejects(world.resolver.resolve(3), /wrong file_id/);
  assert.deepEqual(world.calls.refresh, ["3"]);
  assert.deepEqual(world.calls.resolveLink, ["same"], "the same id is not asked for twice in one request");
});

test("a failed lookup leaves the picture unavailable and the id as it was", async () => {
  const world = makeWorld({ stored: { 4: "old" } }); // current has no answer for 4
  await assert.rejects(world.resolver.resolve(4), /wrong file_id/);
  assert.equal(world.stored[4], "old");

  const throwing = makeWorld({ stored: { 4: "old" } });
  throwing.refreshError = new Error("avatar_timeout");
  await assert.rejects(throwing.resolver.resolve(4), /wrong file_id/);
  assert.deepEqual(throwing.repairs, [{ userId: "4", staleFileId: "old", fileId: "old" }]);
});

test("a person is looked up again at most once per retry window", async () => {
  const clock = { t: 0 };
  const world = makeWorld({ stored: { 4: "old" }, clock });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(world.resolver.resolve(4));
    clock.t += 100;
  }
  assert.deepEqual(world.calls.refresh, ["4"]);
  clock.t = 1000;
  await assert.rejects(world.resolver.resolve(4));
  assert.deepEqual(world.calls.refresh, ["4", "4"], "tried again once the window passed");
});

test("the retry window is per person", async () => {
  const world = makeWorld({ stored: { 1: "a", 2: "b" }, alive: ["b2"], current: { 2: "b2" } });
  await assert.rejects(world.resolver.resolve(1));
  assert.match(await world.resolver.resolve(2), /b2\.jpg$/);
  assert.deepEqual(world.calls.refresh, ["1", "2"]);
});

test("a temporary failure is not a reason to look the photo up again", async () => {
  const world = makeWorld({ stored: { 9: "old" }, alive: ["old"], current: { 9: "other" } });
  for (const error of [
    new FakeTelegramError(429, "Too Many Requests: retry after 3"),
    new FakeTelegramError(502, "Bad Gateway"),
    Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
  ]) {
    world.failNext = error;
    await assert.rejects(world.resolver.resolve(9), (thrown) => thrown === error);
  }
  assert.deepEqual(world.calls.refresh, []);
  assert.equal(world.stored[9], "old");
  // And the photo comes back once Telegram does.
  assert.match(await world.resolver.resolve(9), /old\.jpg$/);
});

test("the same person asked for at once shares one lookup", async () => {
  const world = makeWorld({ stored: { 7: "old" }, alive: ["new"], current: { 7: "new" } });
  let open;
  world.refreshGate = new Promise((resolve) => {
    open = resolve;
  });
  const requests = [world.resolver.resolve(7), world.resolver.resolve(7), world.resolver.resolve("7")];
  await new Promise((resolve) => setImmediate(resolve));
  open();
  const urls = await Promise.all(requests);
  for (const url of urls) {
    assert.match(url, /new\.jpg$/);
  }
  assert.deepEqual(world.calls.refresh, ["7"]);
  assert.equal(world.repairs.length, 1);
});

test("a request alongside a lookup that finds nothing new also fails", async () => {
  const world = makeWorld({ stored: { 3: "same" }, current: { 3: "same" } });
  let open;
  world.refreshGate = new Promise((resolve) => {
    open = resolve;
  });
  const requests = [world.resolver.resolve(3), world.resolver.resolve(3)];
  await new Promise((resolve) => setImmediate(resolve));
  open();
  const results = await Promise.allSettled(requests);
  assert.deepEqual(results.map((result) => result.status), ["rejected", "rejected"]);
  assert.deepEqual(world.calls.refresh, ["3"]);
});

test("a new photo that also fails is reported as unavailable", async () => {
  const world = makeWorld({ stored: { 6: "old" }, current: { 6: "new-but-dead" } });
  await assert.rejects(world.resolver.resolve(6), /wrong file_id/);
  assert.deepEqual(world.calls.resolveLink, ["old", "new-but-dead"]);
  assert.equal(world.stored[6], "new-but-dead");
});

test("a failing report does not change the answer", async () => {
  const resolver = createAvatarLinkResolver({
    readFileId: () => "",
    resolveLink: async () => "unused",
    refresh: async () => {},
    onRepair: () => {
      throw new Error("log is broken");
    },
  });
  assert.equal(await resolver.resolve(1), null);

  const stored = { 1: "old" };
  const reporting = createAvatarLinkResolver({
    readFileId: (id) => stored[id] || "",
    resolveLink: async (fileId) => {
      if (fileId === "old") {
        throw REJECTED();
      }
      return `url:${fileId}`;
    },
    refresh: async (id) => {
      stored[id] = "new";
    },
    onRepair: () => {
      throw new Error("log is broken");
    },
  });
  assert.equal(await reporting.resolve(1), "url:new");
});

test("the memory of past lookups stays bounded", async () => {
  const clock = { t: 0 };
  const stored = {};
  let refreshes = 0;
  const resolver = createAvatarLinkResolver({
    readFileId: (id) => stored[id] || "",
    resolveLink: async () => {
      throw REJECTED();
    },
    refresh: async () => {
      refreshes += 1;
    },
    now: () => clock.t,
    retryAfterMs: 1000,
    maxEntries: 3,
  });
  for (const id of [1, 2, 3, 4]) {
    stored[id] = `dead-${id}`;
    await assert.rejects(resolver.resolve(id));
  }
  assert.equal(refreshes, 4);
  // 1 was the oldest and was forgotten, so it may be looked up again; 4 may not.
  await assert.rejects(resolver.resolve(1));
  await assert.rejects(resolver.resolve(4));
  assert.equal(refreshes, 5);
});
