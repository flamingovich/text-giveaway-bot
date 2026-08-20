const test = require("node:test");
const assert = require("node:assert");
const {
  isPermanentTelegramEditError,
  isTransientTelegramEditError,
  isWrongTelegramMessageKindError,
  pickReportableEditError,
} = require("./telegram-edit-errors");

const err = (message) => new Error(message);

const TIMEOUT = err("telegram_edit_timeout");
const NO_TEXT = err("400: Bad Request: there is no text in the message to edit");
const NO_CAPTION = err("400: Bad Request: there is no caption in the message to edit");
const GONE = err("400: Bad Request: message to edit not found");
const NETWORK = err("request to https://api.telegram.org/botX/editMessageCaption failed, reason: fetch failed");

// This is the incident: a photo post, the caption edit timed out on a network
// blink, the fallback text edit answered "there is no text" - and that answer,
// read as final, marked three live money draws uneditable for the rest of
// their run.
test("a network blink during a caption edit is not mistaken for a dead post", () => {
  const reported = pickReportableEditError([TIMEOUT, NO_TEXT]);
  assert.equal(reported, TIMEOUT);
  assert.equal(isPermanentTelegramEditError(reported), false, "the post must stay editable");
});

test("the same holds when the transport failed outright", () => {
  const reported = pickReportableEditError([NETWORK, NO_TEXT]);
  assert.equal(reported, NETWORK);
  assert.equal(isPermanentTelegramEditError(reported), false);
});

test("a post that truly takes neither kind of edit is still given up on", () => {
  const reported = pickReportableEditError([NO_CAPTION, NO_TEXT]);
  assert.equal(reported, NO_TEXT);
  assert.equal(isPermanentTelegramEditError(reported), true, "otherwise it is retried forever");
});

test("a deleted post is reported as deleted even after a wrong-kind complaint", () => {
  assert.equal(pickReportableEditError([NO_CAPTION, GONE]), GONE);
});

test("nothing to report when nothing failed", () => {
  assert.equal(pickReportableEditError([]), null);
  assert.equal(pickReportableEditError(null), null);
});

test("a wrong-kind complaint asks for the other method, not for surrender", () => {
  assert.equal(isWrongTelegramMessageKindError(NO_TEXT), true);
  assert.equal(isWrongTelegramMessageKindError(NO_CAPTION), true);
  assert.equal(isWrongTelegramMessageKindError(GONE), false);
});

test("passing failures are recognised across the shapes Telegram and Node use", () => {
  for (const message of [
    "429: Too Many Requests: retry after 6",
    "telegram_edit_timeout",
    "fetch failed",
    "connect ETIMEDOUT 149.154.166.110:443",
    "connect ENETUNREACH 2001:67c:4e8:f004::9:443",
    "socket hang up",
    "The operation was aborted due to timeout",
  ]) {
    assert.equal(isTransientTelegramEditError(err(message)), true, message);
  }
});

test("a real refusal from Telegram is not called transient", () => {
  for (const e of [NO_TEXT, NO_CAPTION, GONE, err("400: Bad Request: chat not found")]) {
    assert.equal(isTransientTelegramEditError(e), false, e.message);
  }
});
