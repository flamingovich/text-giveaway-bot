const test = require("node:test");
const assert = require("node:assert");
const {
  CHAT_BUTTON_TEXT,
  getWinnerDirectChatUrl,
  buildWinnerChatLinkMessage,
  isChatLinkPrivacyRefusal,
  createChatLinkThrottle,
} = require("./winner-chat-link");

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("a winner with a username is opened straight away", () => {
  assert.equal(getWinnerDirectChatUrl("@nika_draws"), "https://t.me/nika_draws");
  assert.equal(getWinnerDirectChatUrl("nika_draws"), "https://t.me/nika_draws");
});

test("without a real username there is no direct link", () => {
  assert.equal(getWinnerDirectChatUrl(""), "");
  assert.equal(getWinnerDirectChatUrl(null), "");
  assert.equal(getWinnerDirectChatUrl("bad name/../x"), "");
});

test("the organiser gets a button that opens the chat by the winner's ID", () => {
  const { text, extra } = buildWinnerChatLinkMessage({
    userId: 5481604439,
    name: "Влад <script>",
    drawLabel: "Розыгрыш 50$ · FUGU",
    escapeHtml,
  });
  assert.match(text, /Влад &lt;script&gt;/);
  assert.match(text, /ID <code>5481604439<\/code>/);
  assert.match(text, /Розыгрыш 50\$ · FUGU/);
  assert.equal(extra.parse_mode, "HTML");
  assert.deepEqual(extra.reply_markup.inline_keyboard, [[{ text: CHAT_BUTTON_TEXT, url: "tg://user?id=5481604439" }]]);
});

test("a winner who forbids links to their account is told apart from other failures", () => {
  assert.equal(
    isChatLinkPrivacyRefusal({ response: { description: "Bad Request: BUTTON_USER_PRIVACY_RESTRICTED" } }),
    true,
  );
  assert.equal(isChatLinkPrivacyRefusal(new Error("400: Bad Request: BUTTON_USER_PRIVACY_RESTRICTED")), true);
  assert.equal(isChatLinkPrivacyRefusal(new Error("403: Forbidden: bot was blocked by the user")), false);
  assert.equal(isChatLinkPrivacyRefusal(null), false);
});

test("a second tap on the same winner sends nothing new for a while", () => {
  let now = 0;
  const throttle = createChatLinkThrottle({ windowMs: 15000, now: () => now });
  assert.equal(throttle.take("1:2"), true);
  assert.equal(throttle.take("1:2"), false);
  assert.equal(throttle.take("1:3"), true, "другой победитель — другое сообщение");
  now = 15000;
  assert.equal(throttle.take("1:2"), true);
});

test("a message that failed to go can be asked for again at once", () => {
  const throttle = createChatLinkThrottle();
  assert.equal(throttle.take("1:2"), true);
  throttle.release("1:2");
  assert.equal(throttle.take("1:2"), true);
});
