const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { createSupportBot } = require("./create-support-bot");
const { createSupportChatsStore } = require("./create-support-chats-store");
const rollerAi = require("./support-ai");

const SUPPORT_BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const { DEFAULT_OPENROUTER_MODEL } = require("./support-ai");
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL || "https://rollerbot.pro").replace(/\/$/, "");
const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";

if (!SUPPORT_BOT_TOKEN || SUPPORT_BOT_TOKEN.includes("your_")) {
  throw new Error("Укажите SUPPORT_BOT_TOKEN в .env");
}
if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes("your_")) {
  throw new Error("Укажите OPENROUTER_API_KEY в .env");
}

const chatsStore = createSupportChatsStore("support-chats.json");

const { bot, boot, stop } = createSupportBot({
  logPrefix: "[support-bot]",
  botToken: SUPPORT_BOT_TOKEN,
  chatsStore,
  ai: rollerAi,
  openRouterApiKey: OPENROUTER_API_KEY,
  openRouterModel: OPENROUTER_MODEL,
  webPublicUrl: WEB_PUBLIC_URL,
  timezone: TIMEZONE,
  alwaysOn: false,
  hoursStart: Number(process.env.SUPPORT_HOURS_START || 9),
  hoursEnd: Number(process.env.SUPPORT_HOURS_END || 21),
  idleCloseMs: Number(process.env.SUPPORT_IDLE_CLOSE_MS || 10 * 60 * 1000),
  operatorSearchMinMs: Number(process.env.SUPPORT_OPERATOR_SEARCH_MIN_MS || 5_000),
  operatorSearchMaxMs: Number(process.env.SUPPORT_OPERATOR_SEARCH_MAX_MS || 20_000),
  typingStartMinMs: Number(process.env.SUPPORT_TYPING_START_MIN_MS || 2_000),
  typingStartMaxMs: Number(process.env.SUPPORT_TYPING_START_MAX_MS || 4_000),
  replyDelayMinMs: Number(process.env.SUPPORT_REPLY_DELAY_MIN_MS || 15_000),
  replyDelayMaxMs: Number(process.env.SUPPORT_REPLY_DELAY_MAX_MS || 35_000),
  typingMinMs: Number(process.env.SUPPORT_TYPING_MIN_MS || 500),
  typingMaxMs: Number(process.env.SUPPORT_TYPING_MAX_MS || 5_000),
  typingMsPerCharMin: Number(process.env.SUPPORT_TYPING_MS_PER_CHAR_MIN || 16),
  typingMsPerCharMax: Number(process.env.SUPPORT_TYPING_MS_PER_CHAR_MAX || 28),
  historyLimit: Number(process.env.SUPPORT_HISTORY_LIMIT || 16),
  buildSearchingText: (frame) => {
    const dots = ["", ".", "..", "..."][frame % 4];
    return `Ищем свободного оператора${dots}`;
  },
  buildGreeting: (agentName) => `Привет, на связи ${agentName} из поддержки RollerBot, чем помочь?`,
  buildStopReply: (agentName) =>
    `Ок, ${agentName || "оператор"} закончил диалог. Если снова понадобится помощь — нажми /start`,
  buildOffHoursReply: () => {
    const start = Number(process.env.SUPPORT_HOURS_START || 9);
    const end = Number(process.env.SUPPORT_HOURS_END || 21);
    return `Сейчас нерабочее время — поддержка на связи с ${start}:00 до ${end}:00 по Москве. Напишите в этот промежуток, мы обязательно ответим.`;
  },
  buildMediaDeclineReply: () =>
    "Фото и файлы пока не берём — напиши текстом, на каком шаге проблема и что на экране.",
});

boot().catch((error) => {
  console.error("[support-bot] не удалось запустить:", error.message);
  process.exit(1);
});

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
