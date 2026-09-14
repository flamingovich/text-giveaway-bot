const test = require("node:test");
const assert = require("node:assert/strict");

const { isAvatarCheckFresh, pickAvatarCheckTargets, avatarJobKey } = require("./avatar-freshness");

const TTL = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-14T00:00:00Z");
const freshStamp = new Date(NOW - 60 * 60 * 1000).toISOString();
const staleStamp = new Date(NOW - TTL - 1).toISOString();

function profilesOf(users) {
  return { users };
}

test("a check made within the interval is fresh; missing, garbage or old stamps are not", () => {
  assert.equal(isAvatarCheckFresh({ avatarUpdatedAt: freshStamp }, NOW, TTL), true);
  assert.equal(isAvatarCheckFresh({ avatarUpdatedAt: staleStamp }, NOW, TTL), false);
  assert.equal(isAvatarCheckFresh({ avatarUpdatedAt: "garbage" }, NOW, TTL), false);
  assert.equal(isAvatarCheckFresh({}, NOW, TTL), false);
  assert.equal(isAvatarCheckFresh(undefined, NOW, TTL), false);
});

test("people without a photo who were checked recently are not picked again", () => {
  // The /live loop: these six used to be picked on every poll, forever.
  const profiles = profilesOf({
    1: { meta: { avatarUpdatedAt: freshStamp } },
    2: { meta: { avatarUpdatedAt: freshStamp } },
  });
  assert.deepEqual(pickAvatarCheckTargets([1, 2], profiles, { limit: 6, now: NOW, ttlMs: TTL }), []);
});

test("recently checked photo-less people no longer use up the limit", () => {
  const users = {};
  for (let id = 1; id <= 6; id += 1) users[id] = { meta: { avatarUpdatedAt: freshStamp } };
  users[7] = { meta: {} };
  users[8] = { meta: { avatarUpdatedAt: staleStamp } };
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(pickAvatarCheckTargets(ids, profilesOf(users), { limit: 6, now: NOW, ttlMs: TTL }), ["7", "8"]);
});

test("people with a photo on file are left alone when only missing ones are asked for", () => {
  const profiles = profilesOf({
    1: { meta: { avatarFileId: "f1", avatarUpdatedAt: staleStamp } },
    2: { meta: { avatarFileId: "f2" } },
    3: { meta: {} },
  });
  assert.deepEqual(pickAvatarCheckTargets([1, 2, 3], profiles, { limit: 5, now: NOW, ttlMs: TTL }), ["3"]);
  assert.deepEqual(
    pickAvatarCheckTargets([1, 2, 3], profiles, { limit: 5, onlyMissing: false, now: NOW, ttlMs: TTL }),
    ["1", "2", "3"],
  );
});

test("the limit, duplicates, unknown people and non-numeric ids", () => {
  const profiles = profilesOf({});
  assert.deepEqual(
    pickAvatarCheckTargets([5, "5", "abc", 6, 7, 8], profiles, { limit: 3, now: NOW, ttlMs: TTL }),
    ["5", "6", "7"],
  );
  assert.deepEqual(pickAvatarCheckTargets([], profiles, { limit: 3, now: NOW, ttlMs: TTL }), []);
  assert.deepEqual(pickAvatarCheckTargets(undefined, undefined, { limit: 3, now: NOW, ttlMs: TTL }), []);
});

test("the same list gets the same job key; a different list, limit or mode does not", () => {
  const key = avatarJobKey([1, 2, 3], { limit: 6 });
  assert.equal(avatarJobKey(["1", "2", "3"], { limit: 6 }), key);
  assert.notEqual(avatarJobKey([1, 2, 3, 4], { limit: 6 }), key);
  assert.notEqual(avatarJobKey([1, 2, 3], { limit: 20 }), key);
  assert.notEqual(avatarJobKey([1, 2, 3], { limit: 6, onlyMissing: false }), key);
});
