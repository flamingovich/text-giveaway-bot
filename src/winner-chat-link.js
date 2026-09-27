// "Написать" on a winner's card: opens a chat with them.
//
// A winner with a username is one t.me link away. One without is not: a Mini
// App opens nothing but t.me links (openTelegramLink throws on tg://), and a
// bare tg://user?id opens a profile only in a client that already knows the
// person. What Telegram does promise is a tg://user?id button in a bot's
// message, for someone who has written to the bot - every participant has,
// joining asks for it - unless their privacy settings forbid links to them.
// So the bot sends the organiser that button, and the panel takes them to it.

const CHAT_BUTTON_TEXT = "💬 Открыть чат";

function getWinnerDirectChatUrl(username) {
  const clean = String(username || "").replace(/^@/, "").trim();
  return /^[A-Za-z0-9_]{4,32}$/.test(clean) ? `https://t.me/${clean}` : "";
}

function buildWinnerChatLinkMessage({ userId, name, drawLabel = "", escapeHtml }) {
  const lines = ["💬 <b>Написать победителю</b>", `${escapeHtml(name)} · ID <code>${Number(userId)}</code>`];
  if (drawLabel) {
    lines.push(escapeHtml(drawLabel));
  }
  return {
    text: lines.join("\n"),
    extra: {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: CHAT_BUTTON_TEXT, url: `tg://user?id=${Number(userId)}` }]] },
    },
  };
}

// Telegram refuses the whole message when the person does not allow links to
// their account: "Bad Request: BUTTON_USER_PRIVACY_RESTRICTED".
function isChatLinkPrivacyRefusal(error) {
  const text = String(error?.response?.description || error?.description || error?.message || "");
  return /USER_PRIVACY_RESTRICTED/i.test(text);
}

// One tap, one message: another tap on the same winner soon after - or a
// double tap - only takes the organiser to the message already sent.
function createChatLinkThrottle({ windowMs = 15000, now = () => Date.now() } = {}) {
  const sentAt = new Map();
  return {
    take(key) {
      const at = now();
      for (const [other, time] of sentAt) {
        if (at - time >= windowMs) sentAt.delete(other);
      }
      if (sentAt.has(key)) {
        return false;
      }
      sentAt.set(key, at);
      return true;
    },
    release(key) {
      sentAt.delete(key);
    },
  };
}

module.exports = {
  CHAT_BUTTON_TEXT,
  getWinnerDirectChatUrl,
  buildWinnerChatLinkMessage,
  isChatLinkPrivacyRefusal,
  createChatLinkThrottle,
};
