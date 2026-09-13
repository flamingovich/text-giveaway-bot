const test = require("node:test");
const assert = require("node:assert/strict");

const { createDocumentSnapshotCache } = require("./document-snapshot");

// The cache also leans on SQLite's data_version moving when another connection
// commits and staying put for this connection's own commits. That is checked
// against the real driver on the server rather than here: opening two
// better-sqlite3 connections inside the test runner crashes Node 24 on teardown
// (a native assertion in the driver's destructor), which would take the whole
// suite down on the Windows machine.

function makeCache() {
  const state = { version: 1, reads: 0, docs: { profiles: { n: 1 } } };
  const cache = createDocumentSnapshotCache({
    readVersion: () => state.version,
    readFresh: (key) => {
      state.reads += 1;
      return JSON.parse(JSON.stringify(state.docs[key] ?? {}));
    },
  });
  return { state, cache };
}

test("the same snapshot is handed out while nothing can have changed", () => {
  const { state, cache } = makeCache();
  const first = cache.read("profiles");
  const second = cache.read("profiles");
  assert.equal(first, second);
  assert.equal(state.reads, 1);
});

test("a write from this process drops the snapshot of that document only", () => {
  const { state, cache } = makeCache();
  state.docs.draws = { d: 1 };
  const profiles = cache.read("profiles");
  const draws = cache.read("draws");
  state.docs.profiles = { n: 2 };
  cache.noteWrite("profiles");
  assert.deepEqual(cache.read("profiles"), { n: 2 });
  assert.notEqual(cache.read("profiles"), profiles);
  assert.equal(cache.read("draws"), draws);
});

test("a commit from another connection drops every snapshot", () => {
  const { state, cache } = makeCache();
  cache.read("profiles");
  state.docs.profiles = { n: 3 };
  state.version = 2;
  assert.deepEqual(cache.read("profiles"), { n: 3 });
  assert.equal(state.reads, 2);
});

test("the version is taken before the payload, so a commit in between is not hidden", () => {
  const order = [];
  let version = 1;
  const cache = createDocumentSnapshotCache({
    readVersion: () => {
      order.push("version");
      return version;
    },
    readFresh: () => {
      order.push("payload");
      // Another process commits while the payload is being read.
      version = 2;
      return { fresh: true };
    },
  });
  cache.read("draws");
  cache.read("draws");
  assert.deepEqual(order, ["version", "payload", "version", "payload"]);
});

test("a write noted before anything was read does not break the first read", () => {
  const { state, cache } = makeCache();
  cache.noteWrite("profiles");
  assert.deepEqual(cache.read("profiles"), { n: 1 });
  assert.equal(cache.read("profiles"), cache.read("profiles"));
  assert.equal(state.reads, 1);
});
