const test = require("node:test");
const assert = require("node:assert");

// A stand-in for Telegraf: keeps the handlers and records what is sent. Set up
// before the factory is required, which takes Telegraf at load time.
class FakeTelegraf {
  constructor() {
    this.handlers = {};
    this.sent = [];
    this.deleted = [];
    const record = (chatId, text) => {
      this.sent.push(String(text));
      return { message_id: this.sent.length };
    };
    this.telegram = {
      sendMessage: async (chatId, text) => record(chatId, text),
      sendPhoto: async () => ({}),
      sendVideo: async () => ({}),
      editMessageText: async () => ({}),
      editMessageCaption: async () => ({}),
      deleteMessage: async (_chatId, messageId) => {
        this.deleted.push(messageId);
      },
      sendChatAction: async () => true,
    };
  }
  start(handler) {
    this.handlers.start = handler;
  }
  command(name, handler) {
    this.handlers[name] = handler;
  }
  on(type, handler) {
    this.handlers[Array.isArray(type) ? "media" : type] = handler;
  }
  catch() {}
  stop() {}
}
require.cache[require.resolve("telegraf")] = { exports: { Telegraf: FakeTelegraf } };
const { createSupportBot } = require("./create-support-bot");

const SEARCH_MS = 150;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeBot() {
  let disk = {};
  const aiCalls = [];
  const instance = createSupportBot({
    logPrefix: "[test]",
    botToken: "test",
    alwaysOn: true,
    idleCloseMs: 0,
    replyDelayMinMs: 20,
    replyDelayMaxMs: 20,
    typingStartMinMs: 5,
    typingStartMaxMs: 5,
    typingMinMs: 0,
    typingMaxMs: 0,
    resolveOperatorSearchDelayMs: () => SEARCH_MS,
    buildSearchingText: () => "Ищем оператора",
    buildGreeting: () => "Привет",
    chatsStore: {
      readSupportChats: () => structuredClone(disk),
      writeSupportChats: (payload) => {
        disk = structuredClone(payload);
      },
      ensureChatTranscriptFields: (state) => state,
      syncChatUser: (state, from) => {
        if (from) state.user = { id: from.id };
      },
      appendTranscript: () => {},
    },
    ai: {
      pickRandomAgentName: () => "Аня",
      callOpenRouter: async ({ userMessage }) => {
        aiCalls.push(userMessage);
        return "Сейчас посмотрю";
      },
      humanizeSupportReply: (text) => text,
      isAggressiveUserMessage: () => false,
    },
  });
  const ctx = (text) => ({
    chat: { id: 7, type: "private" },
    from: { id: 7, first_name: "Тест" },
    message: { text },
    reply: (reply) => instance.bot.telegram.sendMessage(7, reply),
  });
  return { bot: instance.bot, aiCalls, ctx };
}

// The incident: at night the search lasts minutes, and awaiting it inside the
// handler stopped the whole support bot - Telegraf takes no new updates until
// a handler is done - until its 90-second timeout, 23 times in four nights.
test("/start hands the update back before the operator is found", async () => {
  const { bot, ctx } = makeBot();
  const started = Date.now();
  await bot.handlers.start(ctx("/start"));
  assert.ok(Date.now() - started < SEARCH_MS, "обработчик не должен ждать поиск");
  assert.deepEqual(bot.sent, ["Ищем оператора"]);
  await wait(SEARCH_MS + 100);
  assert.deepEqual(bot.sent, ["Ищем оператора", "Привет"]);
});

test("what is written during the search is answered after the greeting", async () => {
  const { bot, aiCalls, ctx } = makeBot();
  await bot.handlers.start(ctx("/start"));
  await bot.handlers.text(ctx("где мой приз"));
  await wait(60);
  assert.equal(aiCalls.length, 0, "оператор ещё не «нашёлся»");
  await wait(SEARCH_MS + 200);
  assert.deepEqual(aiCalls, ["где мой приз"]);
  assert.deepEqual(bot.sent, ["Ищем оператора", "Привет", "Сейчас посмотрю"]);
});

test("a second /start replaces the first search instead of greeting twice", async () => {
  const { bot, ctx } = makeBot();
  await bot.handlers.start(ctx("/start"));
  await bot.handlers.start(ctx("/start"));
  await wait(SEARCH_MS * 2 + 100);
  assert.equal(bot.sent.filter((text) => text === "Привет").length, 1);
  assert.ok(bot.deleted.includes(1), "первое «Ищем оператора» убрано");
});

test("/stop during the search ends it without a greeting", async () => {
  const { bot, ctx } = makeBot();
  await bot.handlers.start(ctx("/start"));
  await bot.handlers.stop(ctx("/stop"));
  await wait(SEARCH_MS + 100);
  assert.equal(bot.sent.includes("Привет"), false);
});
