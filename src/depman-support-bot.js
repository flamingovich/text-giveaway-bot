const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { createSupportBot } = require("./create-support-bot");
const { createSupportChatsStore } = require("./create-support-chats-store");
const depmanAi = require("./depman-support-ai");

const DEPMAN_SUPPORT_BOT_TOKEN = process.env.DEPMAN_SUPPORT_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const { DEFAULT_OPENROUTER_MODEL } = require("./support-ai");
const OPENROUTER_MODEL =
  process.env.DEPMAN_OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL || "https://rollerbot.pro").replace(/\/$/, "");
const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";

if (!DEPMAN_SUPPORT_BOT_TOKEN || DEPMAN_SUPPORT_BOT_TOKEN.includes("your_")) {
  throw new Error("Укажите DEPMAN_SUPPORT_BOT_TOKEN в .env");
}
if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes("your_")) {
  throw new Error("Укажите OPENROUTER_API_KEY в .env");
}

const chatsStore = createSupportChatsStore("depman-support-chats.json");

const MEDIA_DECLINES = [
  "фото и видео тут не открываются — напиши текстом что на экране",
  "медиа не принимаем только текст опиши шаг и ошибку",
  "скрины не грузятся у меня — кинь текстом что там пишет",
];

const LINK_DECLINES = [
  "ссылки на казино сюда не кидай — опиши текстом в чём вопрос",
  "не принимаю ссылки — напиши словами что не так",
];

function evaluateUserMessage(text) {
  if (depmanAi.isMoneyRequest(text)) {
    return { action: "close", reason: "money" };
  }
  if (depmanAi.isSevereAggression(text)) {
    return { action: "close", reason: "aggression" };
  }
  if (depmanAi.isCasinoLinkMessage(text)) {
    return {
      action: "reply",
      kind: "link",
      message: LINK_DECLINES[Math.floor(Math.random() * LINK_DECLINES.length)],
    };
  }
  return { action: "continue" };
}

const { bot, boot, stop } = createSupportBot({
  logPrefix: "[depman-support]",
  botToken: DEPMAN_SUPPORT_BOT_TOKEN,
  chatsStore,
  ai: depmanAi,
  openRouterApiKey: OPENROUTER_API_KEY,
  openRouterModel: OPENROUTER_MODEL,
  webPublicUrl: WEB_PUBLIC_URL,
  timezone: TIMEZONE,
  alwaysOn: true,
  idleCloseMs: Number(process.env.DEPMAN_SUPPORT_IDLE_CLOSE_MS || 10 * 60 * 1000),
  operatorSearchMinMs: Number(process.env.DEPMAN_OPERATOR_SEARCH_MIN_MS || 4_000),
  operatorSearchMaxMs: Number(process.env.DEPMAN_OPERATOR_SEARCH_MAX_MS || 14_000),
  typingStartMinMs: Number(process.env.DEPMAN_TYPING_START_MIN_MS || 1_500),
  typingStartMaxMs: Number(process.env.DEPMAN_TYPING_START_MAX_MS || 3_500),
  replyDelayMinMs: Number(process.env.DEPMAN_REPLY_DELAY_MIN_MS || 10_000),
  replyDelayMaxMs: Number(process.env.DEPMAN_REPLY_DELAY_MAX_MS || 28_000),
  historyLimit: Number(process.env.DEPMAN_SUPPORT_HISTORY_LIMIT || 16),
  buildSearchingText: (frame) => {
    const dots = ["", ".", "..", "..."][frame % 4];
    return `Подключаем модератора${dots}`;
  },
  buildGreeting: () => "ВИП поддержка на связи, чем помочь?",
  buildStopReply: (_agentName, meta = {}) => {
    if (meta.reason === "aggression") {
      return "Диалог закрыт из-за оскорблений. Чтобы снова написать — /start";
    }
    if (meta.reason === "money") {
      return "По таким запросам не помогаем. Диалог закрыт — /start если по делу";
    }
    return "Диалог закрыт. Если снова понадобится помощь — нажми /start";
  },
  buildClosedReply: () => "Диалог закрыт. Нажми /start, чтобы снова написать в ВИП поддержку.",
  buildMediaDeclineReply: () => MEDIA_DECLINES[Math.floor(Math.random() * MEDIA_DECLINES.length)],
  evaluateUserMessage,
  bootLogLine: () => "Depman VIP · @depman_support_bot · 24/7",
});

boot().catch((error) => {
  console.error("[depman-support] не удалось запустить:", error.message);
  process.exit(1);
});

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
