const test = require("node:test");
const assert = require("node:assert/strict");

const { USER_META_TOUCH_MS, userMetaNeedsWrite } = require("./user-meta-touch");

const NOW = Date.parse("2026-09-14T00:00:00Z");
const fresh = new Date(NOW - 60 * 1000).toISOString();
const stale = new Date(NOW - USER_META_TOUCH_MS - 1).toISOString();

const stored = {
  id: 42,
  username: "alex",
  first_name: "Алексей",
  last_name: "",
  firstSeenAt: "2026-08-01T10:00:00Z",
  updatedAt: fresh,
};

test("a repeat request from someone already stored a minute ago writes nothing", () => {
  // This is the /live poll: the same person, the same names, every 2.5 seconds.
  assert.equal(userMetaNeedsWrite(stored, { id: 42, username: "alex", first_name: "Алексей" }, NOW), false);
});

test("someone new is written", () => {
  assert.equal(userMetaNeedsWrite(undefined, { id: 42, username: "alex" }, NOW), true);
  assert.equal(userMetaNeedsWrite({}, { id: 42 }, NOW), true);
});

test("a name Telegram now reports differently is written at once", () => {
  assert.equal(userMetaNeedsWrite(stored, { id: 42, username: "alex_new", first_name: "Алексей" }, NOW), true);
  assert.equal(userMetaNeedsWrite(stored, { id: 42, username: "alex", first_name: "Лёша" }, NOW), true);
  assert.equal(userMetaNeedsWrite(stored, { id: 42, username: "alex", first_name: "Алексей", last_name: "К" }, NOW), true);
});

test("a name Telegram simply did not send is not news: the merge never clears one", () => {
  assert.equal(userMetaNeedsWrite(stored, { id: 42 }, NOW), false);
  assert.equal(userMetaNeedsWrite(stored, { id: 42, username: "", first_name: "" }, NOW), false);
});

test("a last-seen stamp older than the interval is refreshed", () => {
  assert.equal(userMetaNeedsWrite({ ...stored, updatedAt: stale }, { id: 42, username: "alex" }, NOW), true);
  assert.equal(userMetaNeedsWrite({ ...stored, updatedAt: undefined }, { id: 42, username: "alex" }, NOW), true);
  assert.equal(userMetaNeedsWrite({ ...stored, updatedAt: "garbage" }, { id: 42, username: "alex" }, NOW), true);
});

test("records from before firstSeenAt or the id existed are completed", () => {
  assert.equal(userMetaNeedsWrite({ ...stored, firstSeenAt: undefined }, { id: 42, username: "alex" }, NOW), true);
  assert.equal(userMetaNeedsWrite({ ...stored, id: undefined }, { id: 42, username: "alex" }, NOW), true);
  // Stored as a number, compared as a string: the same person.
  assert.equal(userMetaNeedsWrite({ ...stored, id: "42" }, { id: 42, username: "alex" }, NOW), false);
});

test("no user, nothing to write", () => {
  assert.equal(userMetaNeedsWrite(stored, null, NOW), false);
  assert.equal(userMetaNeedsWrite(stored, {}, NOW), false);
});
