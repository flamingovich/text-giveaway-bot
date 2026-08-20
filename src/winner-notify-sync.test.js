const test = require("node:test");
const assert = require("node:assert/strict");
const {
  pickDrawForWrite,
  pickParticipantIds,
  pickWinnerNotify,
  mergeLiveWinnerNotifications,
} = require("./winner-notify-sync");

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

test("does not roll an active draw back to scheduled", () => {
  const merged = pickDrawForWrite(
    { id: "draw_1", status: "scheduled", messageId: null, participantIds: [] },
    { id: "draw_1", status: "active", messageId: 42, participantIds: [1] },
  );

  assert.equal(merged.status, "active");
  assert.equal(merged.messageId, 42);
});

test("keeps a winner notification saved after the snapshot was read", () => {
  const merged = pickDrawForWrite(
    {
      id: "draw_1",
      status: "finished",
      messageId: 10,
      winnerIds: [7, 8],
      winnerNotifications: { 7: { status: "pending", sentAt: "2026-08-19T10:00:00.000Z" } },
    },
    {
      id: "draw_1",
      status: "finished",
      messageId: 10,
      winnerIds: [7, 8],
      winnerNotifications: {
        7: { status: "confirmed", verifiedAt: "2026-08-19T10:02:00.000Z" },
        8: { status: "pending", sentAt: "2026-08-19T10:01:00.000Z" },
      },
    },
  );

  assert.equal(merged.winnerNotifications[7].status, "confirmed");
  assert.equal(merged.winnerNotifications[8].status, "pending");
});

test("keeps a join that landed while a slow Telegram call was in flight", () => {
  const merged = pickDrawForWrite(
    { id: "draw_1", status: "active", messageId: 10, participantIds: [1, 2] },
    { id: "draw_1", status: "active", messageId: 10, participantIds: [1, 2, 3] },
  );

  assert.deepEqual(merged.participantIds, [1, 2, 3]);
});

test("keeps the draw objects and array a caller is still holding", () => {
  const a = { id: "A", status: "scheduled", participantIds: [], winnerNotifications: {} };
  const b = { id: "B", status: "active", participantIds: [1, 2], winnerNotifications: {} };
  const data = { draws: [a, b] };
  const drawsArray = data.draws;
  const live = { draws: [{ ...a }, { ...b }] };

  a.status = "active";
  a.messageId = 100;
  mergeLiveWinnerNotifications(data, live);

  assert.equal(data.draws, drawsArray, "the array a for..of is walking must survive");
  assert.ok(data.draws.includes(b), "the draw object the caller mutates must survive");
});

test("a finish written after an earlier save in the same pass is not lost", () => {
  const a = { id: "A", status: "scheduled", participantIds: [], winnerNotifications: {} };
  const b = { id: "B", status: "active", participantIds: [1, 2], winnerNotifications: {} };
  const data = { draws: [a, b] };
  const live = { draws: [{ ...a }, { ...b }] };

  // first draw of the pass publishes and saves
  a.status = "active";
  a.messageId = 100;
  mergeLiveWinnerNotifications(data, live);

  // second draw of the pass finishes and saves through the same document
  b.status = "finished";
  b.winnerIds = [1];
  b.winnerNotifications = { 1: { status: "pending", sentAt: "2026-08-19T10:00:00.000Z" } };
  mergeLiveWinnerNotifications(data, live);

  const savedB = data.draws.find((draw) => draw.id === "B");
  assert.equal(savedB.status, "finished");
  assert.deepEqual(savedB.winnerIds, [1]);
  assert.equal(savedB.winnerNotifications[1].status, "pending");
});

test("a draw created after the snapshot is not deleted by a stale save", () => {
  const a = { id: "A", status: "active", participantIds: [1], winnerNotifications: {} };
  const data = { draws: [a] };
  const live = { draws: [{ ...a }, { id: "NEW", status: "scheduled", participantIds: [] }] };

  mergeLiveWinnerNotifications(data, live);

  assert.deepEqual(
    data.draws.map((draw) => draw.id).sort(),
    ["A", "NEW"],
  );
});

test("a forfeit decided now is not undone by the confirmation it replaces", () => {
  // The record already carries an address, which used to pin its comparison
  // timestamp to the moment the address arrived and made later decisions lose.
  const confirmed = {
    status: "confirmed",
    verifiedAt: "2026-08-15T23:29:51.297Z",
    addressReceivedAt: "2026-08-15T23:30:58.098Z",
    trc20Address: "TJho7Na756B51yEnm7XVR2qLqAeoPUkSvD",
  };
  const forfeited = {
    ...confirmed,
    status: "forfeited",
    forfeitureReason: "unsubscribed",
    forfeitedAt: "2026-08-20T05:00:00.000Z",
  };

  assert.equal(pickWinnerNotify(forfeited, confirmed).status, "forfeited");
  assert.equal(pickWinnerNotify(confirmed, forfeited).status, "forfeited");
});

test("a confirmation that came after a forfeit also stands", () => {
  const forfeited = { status: "forfeited", forfeitedAt: "2026-08-01T00:00:00.000Z" };
  const confirmed = { status: "confirmed", verifiedAt: "2026-08-02T00:00:00.000Z" };

  assert.equal(pickWinnerNotify(forfeited, confirmed).status, "confirmed");
  assert.equal(pickWinnerNotify(confirmed, forfeited).status, "confirmed");
});

test("payment survives any later decision", () => {
  const paid = { status: "confirmed", paidAt: "2026-08-01T00:00:00.000Z" };
  const forfeited = { status: "forfeited", forfeitedAt: "2026-08-20T00:00:00.000Z" };

  assert.equal(pickWinnerNotify(forfeited, paid).paidAt, paid.paidAt);
  assert.equal(pickWinnerNotify(paid, forfeited).paidAt, paid.paidAt);
});
