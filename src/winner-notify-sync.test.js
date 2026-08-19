const test = require("node:test");
const assert = require("node:assert/strict");
const { pickDrawForWrite, pickParticipantIds } = require("./winner-notify-sync");

test("does not wipe a live channel messageId with a stale null", () => {
  const merged = pickDrawForWrite(
    {
      id: "draw_1",
      status: "active",
      messageId: null,
      participantIds: [1],
      postParticipantCount: 0,
    },
    {
      id: "draw_1",
      status: "active",
      messageId: 1029,
      messageType: "text",
      participantIds: [1, 2, 3],
      postParticipantCount: 3,
    },
  );

  assert.equal(merged.messageId, 1029);
  assert.equal(merged.messageType, "text");
  assert.deepEqual(merged.participantIds, [1, 2, 3]);
  assert.equal(merged.postParticipantCount, 3);
});

test("keeps the count already posted instead of pinning it to the oldest", () => {
  const merged = pickDrawForWrite(
    { id: "draw_1", status: "active", messageId: 10, participantIds: [1, 2, 3, 4], postParticipantCount: 4 },
    { id: "draw_1", status: "active", messageId: 10, participantIds: [1, 2, 3, 4, 5], postParticipantCount: 0 },
  );

  assert.equal(merged.postParticipantCount, 4);
});

test("never claims to have posted more than the actual participants", () => {
  const merged = pickDrawForWrite(
    { id: "draw_1", status: "active", messageId: 10, participantIds: [1, 2], postParticipantCount: 9 },
    { id: "draw_1", status: "active", messageId: 10, participantIds: [1, 2], postParticipantCount: 2 },
  );

  assert.equal(merged.postParticipantCount, 2);
});

test("keeps a finished draw over an active stale snapshot", () => {
  const merged = pickDrawForWrite(
    { id: "draw_1", status: "active", messageId: 10, participantIds: [1, 2] },
    {
      id: "draw_1",
      status: "finished",
      messageId: 10,
      participantIds: [1, 2, 3],
      winnerIds: [2],
    },
  );

  assert.equal(merged.status, "finished");
  assert.deepEqual(merged.winnerIds, [2]);
  assert.equal(merged.participantIds.length, 3);
});

test("unions participant ids instead of shrinking them", () => {
  assert.deepEqual(pickParticipantIds([1, 2], [2, 3, 4]), [2, 3, 4, 1]);
});
