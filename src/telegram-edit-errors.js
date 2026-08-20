// Telegram refuses a post edit for reasons that look alike in a log line but
// call for opposite responses: some mean "never ask again", some mean "ask the
// other way", and some mean "the network blinked, ask again later". Getting the
// three confused is expensive in both directions - retrying a dead post forever
// burns the quota that live posts then get 429'd on, and giving up on a live
// post freezes its participant counter for the rest of the draw.

function textOf(error) {
  return String(error?.message || error || "");
}

// Nothing is wrong with the post; the edit simply had nothing to do, or Telegram
// asked us to slow down.
function isIgnorableTelegramEditError(error) {
  const message = textOf(error);
  return (
    message.includes("message is not modified") ||
    message.includes("Too Many Requests") ||
    message.includes("telegram_edit_timeout")
  );
}

// The post is gone or frozen: repeating the call cannot change the outcome.
function isPermanentTelegramEditError(error) {
  const message = textOf(error);
  return (
    message.includes("message to edit not found") ||
    message.includes("message can't be edited") ||
    message.includes("there is no text in the message to edit") ||
    message.includes("MESSAGE_ID_INVALID") ||
    message.includes("chat not found") ||
    message.includes("bot was blocked")
  );
}

function isMissingTelegramMessageError(error) {
  const message = textOf(error);
  return (
    message.includes("message to edit not found") ||
    message.includes("message identifier is not specified")
  );
}

// We used the wrong edit method for this kind of message - a photo carries a
// caption, not text. The answer is to try the other method, not to give up.
function isWrongTelegramMessageKindError(error) {
  const message = textOf(error);
  return (
    message.includes("there is no caption") ||
    message.includes("there is no text in the message") ||
    message.includes("message can't be edited")
  );
}

// The call never really reached Telegram, or Telegram told us to wait. Says
// nothing at all about the state of the post.
function isTransientTelegramEditError(error) {
  const message = textOf(error);
  return (
    message.includes("Too Many Requests") ||
    message.includes("telegram_edit_timeout") ||
    message.includes("fetch failed") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET") ||
    message.includes("ENETUNREACH") ||
    message.includes("socket hang up") ||
    message.includes("aborted due to timeout") ||
    message.includes("network")
  );
}

// Editing a post is attempted twice - once as a caption, once as text - and only
// one of those can ever be right for a given message. So the failure of the
// wrong one is expected noise. If the RIGHT one failed for a passing reason,
// that is the failure worth reporting: reporting the other one instead reads as
// "this post can never be edited" and freezes a perfectly good post forever.
// This is not hypothetical - three live money draws were buried this way when
// the network blinked during a caption edit.
function pickReportableEditError(errors) {
  const list = (errors || []).filter(Boolean);
  if (list.length === 0) {
    return null;
  }
  const transient = list.find((error) => isTransientTelegramEditError(error));
  if (transient) {
    return transient;
  }
  const missing = list.find((error) => isMissingTelegramMessageError(error));
  if (missing) {
    return missing;
  }
  return list[list.length - 1];
}

module.exports = {
  isIgnorableTelegramEditError,
  isPermanentTelegramEditError,
  isMissingTelegramMessageError,
  isWrongTelegramMessageKindError,
  isTransientTelegramEditError,
  pickReportableEditError,
};
