const test = require("node:test");
const assert = require("node:assert/strict");
const { collectAllDraws, mergeDrawLists, pickRicherCopy } = require("./admin-draw-source");

test("includes archived draws, which are most of the history", () => {
  const draws = collectAllDraws({
    readData: () => ({ draws: [{ id: "live" }] }),
    readArchivedDraws: () => ({ draws: [{ id: "old_1" }, { id: "old_2" }] }),
  });

  assert.deepEqual(draws.map((draw) => draw.id).sort(), ["live", "old_1", "old_2"]);
});

test("survives a missing archive reader", () => {
  const draws = collectAllDraws({ readData: () => ({ draws: [{ id: "live" }] }) });
  assert.deepEqual(draws.map((draw) => draw.id), ["live"]);
});

test("counts a draw present in both documents once", () => {
  const draws = mergeDrawLists(
    [{ id: "d1", status: "active", participantIds: [1] }],
    [{ id: "d1", status: "finished", participantIds: [1, 2], winnerIds: [2] }],
  );

  assert.equal(draws.length, 1);
  assert.equal(draws[0].status, "finished", "the finished copy is the real one");
});

test("keeps the copy carrying more winner notifications", () => {
  const withRecords = {
    id: "d1",
    status: "finished",
    winnerNotifications: { 1: { status: "confirmed" }, 2: { status: "pending" } },
  };
  const withoutRecords = { id: "d1", status: "finished", winnerNotifications: {} };

  assert.equal(pickRicherCopy(withoutRecords, withRecords), withRecords);
  assert.equal(pickRicherCopy(withRecords, withoutRecords), withRecords);
});

test("ignores entries without an id instead of throwing", () => {
  const draws = mergeDrawLists([{ id: "ok" }, null, {}, undefined]);
  assert.deepEqual(draws.map((draw) => draw.id), ["ok"]);
});
