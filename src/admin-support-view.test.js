const test = require("node:test");
const assert = require("node:assert/strict");
const { describeChat, buildSupportView } = require("./admin-support-view");

function chat(overrides = {}) {
  return {
    chatId: "1",
    label: "@someone",
    sessionClosed: false,
    lastMessageAt: "2026-08-20T00:00:00.000Z",
    transcript: [{ role: "user", content: "привет" }, { role: "assistant", content: "здравствуйте" }],
    ...overrides,
  };
}

function flagKeys(described) {
  return described.flags.map((flag) => flag.key);
}

test("a user having the last word means the bot never came back", () => {
  const described = describeChat(chat({ transcript: [{ role: "user", content: "а где приз?" }] }));
  assert.ok(flagKeys(described).includes("awaitingReply"));
  assert.equal(described.needsAttention, true);
});

test("a conversation that ends on an AI error is flagged", () => {
  const described = describeChat(
    chat({
      transcript: [
        { role: "user", content: "привет" },
        { role: "assistant", kind: "error", content: "Что-то подвисло" },
      ],
    }),
  );

  assert.ok(flagKeys(described).includes("endedOnError"));
  assert.equal(described.needsAttention, true);
});

test("an error the bot recovered from is noted but not raised as urgent", () => {
  const described = describeChat(
    chat({
      transcript: [
        { role: "user", content: "привет" },
        { role: "assistant", kind: "error", content: "Что-то подвисло" },
        { role: "assistant", content: "вот ответ" },
      ],
    }),
  );

  assert.ok(flagKeys(described).includes("hadError"));
  assert.equal(described.needsAttention, false);
});

test("a long conversation is marked, since the bot tends to circle", () => {
  const transcript = Array.from({ length: 25 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: `msg ${i}`,
  }));
  assert.ok(flagKeys(describeChat(chat({ transcript }))).includes("long"));
});

// The list used to open on a "требуют внимания" filter that showed six
// conversations out of a hundred and forty nine, so the page read as empty and
// the rest were behind a click nobody knew to make. Everything is shown now.
test("every conversation is listed, closed ones included", () => {
  const view = buildSupportView([
    chat({ chatId: "quiet" }),
    chat({ chatId: "unanswered", transcript: [{ role: "user", content: "?" }] }),
    chat({ chatId: "closed", sessionClosed: true }),
  ]);

  assert.equal(view.rows.length, 3);
  assert.equal(view.summary.total, 3);
  assert.equal(view.summary.attention, 1, "счётчики остаются — они видны в шапке");
  assert.equal(view.summary.open, 2);
});

test("the flags stay on the rows even though the filters are gone", () => {
  const view = buildSupportView([chat({ chatId: "unanswered", transcript: [{ role: "user", content: "?" }] })]);
  assert.ok(view.rows[0].flags.some((flag) => flag.key === "awaitingReply"));
  assert.equal(view.rows[0].needsAttention, true);
});

test("search looks inside the transcript, not only at the name", () => {
  const chats = [
    chat({ chatId: "a", transcript: [{ role: "user", content: "где моя выплата" }] }),
    chat({ chatId: "b", transcript: [{ role: "user", content: "как участвовать" }] }),
  ];

  const view = buildSupportView(chats, { query: "выплата" });
  assert.deepEqual(view.rows.map((row) => row.chatId), ["a"]);
});

test("search matches a telegram id", () => {
  const view = buildSupportView([chat({ chatId: "987654" })], { query: "9876" });
  assert.equal(view.rows.length, 1);
});

// A chat list is read newest-first; an unanswered conversation from January is
// not more interesting than one from this morning.
test("newest first, whatever state it is in", () => {
  const view = buildSupportView([
    chat({ chatId: "old_unanswered", lastMessageAt: "2026-01-01", transcript: [{ role: "user", content: "?" }] }),
    chat({ chatId: "recent_fine", lastMessageAt: "2026-08-20" }),
  ]);

  assert.deepEqual(view.rows.map((row) => row.chatId), ["recent_fine", "old_unanswered"]);
});

test("pages instead of printing everything at once", () => {
  const chats = Array.from({ length: 120 }, (_, i) => chat({ chatId: `c${i}` }));
  const view = buildSupportView(chats, { page: 2, pageSize: 50 });

  assert.equal(view.rows.length, 50);
  assert.equal(view.totalPages, 3);
  assert.equal(view.page, 2);
});

test("a page beyond the end falls back to the last one", () => {
  const view = buildSupportView([chat()], { page: 99 });
  assert.equal(view.page, 1);
  assert.equal(view.rows.length, 1);
});
