const test = require("node:test");
const assert = require("node:assert");
const {
  isParticipantAnonymous,
  setParticipantAnonymous,
  maskDisplayName,
  buildPublicIdentity,
} = require("./participant-anonymity");

test("a name keeps only its first and last letter", () => {
  assert.strictEqual(maskDisplayName("Никита"), "Н***а");
  assert.strictEqual(maskDisplayName("Ким"), "К***м");
});

test("the stars do not count the hidden letters", () => {
  // Otherwise the width of the mask leaks the length of the name.
  assert.strictEqual(maskDisplayName("Александра"), "А***а");
  assert.strictEqual(maskDisplayName("Ян"), "Я***");
});

test("a username stays a username but stops being a link", () => {
  assert.strictEqual(maskDisplayName("@alex_winner"), "@a***r");
});

test("the id fallback is not masked one digit at a time", () => {
  assert.strictEqual(maskDisplayName("ID 704511"), "Аноним");
  assert.strictEqual(maskDisplayName(""), "Аноним");
  assert.strictEqual(maskDisplayName(null), "Аноним");
});

test("an anonymous row loses the username and the photo, not just the name", () => {
  const identity = buildPublicIdentity(
    {
      id: "1001",
      displayName: "Никита",
      username: "@nikita_p",
      initial: "Н",
      avatarUrl: "/winners/avatar/1001",
      prize: "10$",
    },
    true,
  );
  assert.strictEqual(identity.displayName, "Н***а");
  assert.strictEqual(identity.username, "");
  assert.strictEqual(identity.avatarUrl, "");
  assert.strictEqual(identity.initial, "Н");
  // Everything the page still needs must survive the mask.
  assert.strictEqual(identity.prize, "10$");
  assert.strictEqual(identity.anonymous, true);
});

test("a named participant is passed through untouched", () => {
  const user = { id: "1002", displayName: "Мария", username: "@maria_p", avatarUrl: "/a/1002" };
  const identity = buildPublicIdentity(user, false);
  assert.strictEqual(identity.displayName, "Мария");
  assert.strictEqual(identity.username, "@maria_p");
  assert.strictEqual(identity.avatarUrl, "/a/1002");
  assert.strictEqual(identity.anonymous, false);
});

test("the flag belongs to the draw, so the same person can be named in another", () => {
  const drawA = { participantMeta: {} };
  const drawB = { participantMeta: {} };
  setParticipantAnonymous(drawA, 1001, true);
  assert.strictEqual(isParticipantAnonymous(drawA, 1001), true);
  assert.strictEqual(isParticipantAnonymous(drawB, 1001), false);
});

test("the flag can be turned back off", () => {
  const draw = { participantMeta: {} };
  setParticipantAnonymous(draw, 1001, true);
  assert.strictEqual(setParticipantAnonymous(draw, 1001, false), true);
  assert.strictEqual(isParticipantAnonymous(draw, 1001), false);
});

test("setting the flag to what it already is is not a change worth a write", () => {
  const draw = { participantMeta: {} };
  assert.strictEqual(setParticipantAnonymous(draw, 1001, true), true);
  assert.strictEqual(setParticipantAnonymous(draw, 1001, true), false);
});

test("the flag does not wipe the rest of the participant's meta", () => {
  const draw = { participantMeta: { 1001: { ipHash: "abc", joinedAt: "2026-01-01T00:00:00Z" } } };
  setParticipantAnonymous(draw, 1001, true);
  assert.strictEqual(draw.participantMeta["1001"].ipHash, "abc");
  assert.strictEqual(draw.participantMeta["1001"].joinedAt, "2026-01-01T00:00:00Z");
});

test("a draw that never saw the flag reads as named", () => {
  assert.strictEqual(isParticipantAnonymous({}, 1001), false);
  assert.strictEqual(isParticipantAnonymous(null, 1001), false);
});
