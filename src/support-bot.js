const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { Telegraf } = require("telegraf");
const { DateTime } = require("luxon");
const { callOpenRouter, verifyOpenRouterKey, humanizeSupportReply } = require("./support-ai");

const SUPPORT_BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";
const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL || "https://rollerbot.pro").replace(/\/$/, "");
const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";
const SUPPORT_HOURS_START = Number(process.env.SUPPORT_HOURS_START || 9);
const SUPPORT_HOURS_END = Number(process.env.SUPPORT_HOURS_END || 21);
const SUPPORT_OPERATOR_SEARCH_MIN_MS = Number(process.env.SUPPORT_OPERATOR_SEARCH_MIN_MS || 5_000);
const SUPPORT_OPERATOR_SEARCH_MAX_MS = Number(process.env.SUPPORT_OPERATOR_SEARCH_MAX_MS || 20_000);
const SUPPORT_TYPING_START_MIN_MS = Number(process.env.SUPPORT_TYPING_START_MIN_MS || 2_000);
const SUPPORT_TYPING_START_MAX_MS = Number(process.env.SUPPORT_TYPING_START_MAX_MS || 4_000);
const SUPPORT_REPLY_DELAY_MIN_MS = Number(process.env.SUPPORT_REPLY_DELAY_MIN_MS || 15_000);
const SUPPORT_REPLY_DELAY_MAX_MS = Number(process.env.SUPPORT_REPLY_DELAY_MAX_MS || 35_000);
const SUPPORT_TYPING_MIN_MS = Number(process.env.SUPPORT_TYPING_MIN_MS || 500);
const SUPPORT_TYPING_MAX_MS = Number(process.env.SUPPORT_TYPING_MAX_MS || 5_000);
const SUPPORT_TYPING_MS_PER_CHAR_MIN = Number(process.env.SUPPORT_TYPING_MS_PER_CHAR_MIN || 16);
const SUPPORT_TYPING_MS_PER_CHAR_MAX = Number(process.env.SUPPORT_TYPING_MS_PER_CHAR_MAX || 28);
const TYPING_ACTION_INTERVAL_MS = 4_500;
const SUPPORT_HISTORY_LIMIT = Number(process.env.SUPPORT_HISTORY_LIMIT || 16);
const SUPPORT_ADMIN_IDS = (process.env.SUPPORT_ADMIN_IDS || process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter(Number.isFinite);

const AGENT_NAMES = ["Никита", "Алексей", "Мария", "Дарья"];
const ESCALATION_PATTERN =
  /(жалоб|обман|скам|scam|мошен|верните|вернуть|оператор|человек|живой|менеджер|админ)/i;

const DATA_DIR = path.join(__dirname, "..", "data");
const CHATS_FILE = path.join(DATA_DIR, "support-chats.json");

if (!SUPPORT_BOT_TOKEN || SUPPORT_BOT_TOKEN.includes("your_")) {
  throw new Error("Укажите SUPPORT_BOT_TOKEN в .env");
}
if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes("your_")) {
  throw new Error("Укажите OPENROUTER_API_KEY в .env");
}
if (SUPPORT_ADMIN_IDS.length === 0) {
  throw new Error(
    "Укажите SUPPORT_ADMIN_IDS или ADMIN_IDS в .env — ваш Telegram ID для эскалаций (@userinfobot)",
  );
}

fs.mkdirSync(DATA_DIR, { recursive: true });

/** @type {Map<string, object>} */
const chats = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const pendingTimers = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const typingStartTimers = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const typingActionTimers = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const statusAnimTimers = new Map();

const STATUS_DOT_FRAMES = ["", ".", "..", "..."];
const STATUS_ANIM_MS = 480;

function buildSearchingOperatorText(dotFrame = 0) {
  const dots = STATUS_DOT_FRAMES[dotFrame % STATUS_DOT_FRAMES.length];
  return `Ищем свободного оператора${dots}`;
}

function stopStatusAnimation(chatKey) {
  const timer = statusAnimTimers.get(chatKey);
  if (timer) {
    clearInterval(timer);
    statusAnimTimers.delete(chatKey);
  }
}

function startStatusAnimation(bot, chatKey, chatId, messageId, getText) {
  stopStatusAnimation(chatKey);
  let frame = 0;
  const timer = setInterval(async () => {
    frame = (frame + 1) % STATUS_DOT_FRAMES.length;
    try {
      await bot.telegram.editMessageText(chatId, messageId, undefined, getText(frame));
    } catch {
      stopStatusAnimation(chatKey);
    }
  }, STATUS_ANIM_MS);
  statusAnimTimers.set(chatKey, timer);
}

function loadChats() {
  if (!fs.existsSync(CHATS_FILE)) {
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CHATS_FILE, "utf8"));
    for (const [chatId, state] of Object.entries(raw)) {
      chats.set(chatId, state);
    }
  } catch {
    // ignore broken file
  }
}

function saveChats() {
  const payload = Object.fromEntries(chats.entries());
  fs.writeFileSync(CHATS_FILE, JSON.stringify(payload, null, 2));
}

function getChatState(chatId) {
  const key = String(chatId);
  if (!chats.has(key)) {
    chats.set(key, {
      agentName: AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)],
      history: [],
      escalated: false,
      greeted: false,
      lastOffHoursNoticeAt: null,
      pendingTexts: [],
      statusMessageId: null,
    });
  }
  return chats.get(key);
}

function isWithinSupportHours(now = DateTime.now().setZone(TIMEZONE)) {
  const hour = now.hour;
  return hour >= SUPPORT_HOURS_START && hour < SUPPORT_HOURS_END;
}

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimHistory(history) {
  return history.slice(-SUPPORT_HISTORY_LIMIT);
}

function formatUserLabel(from) {
  if (!from) return "Пользователь";
  const parts = [];
  if (from.username) parts.push(`@${from.username}`);
  if (from.first_name) parts.push(from.first_name);
  parts.push(`id:${from.id}`);
  return parts.join(" · ");
}

async function deleteMessageSafe(bot, chatId, messageId) {
  if (!messageId) return;
  try {
    await bot.telegram.deleteMessage(chatId, messageId);
  } catch {
    // ignore
  }
}

function clearTypingStartTimer(chatKey) {
  const timer = typingStartTimers.get(chatKey);
  if (timer) {
    clearTimeout(timer);
    typingStartTimers.delete(chatKey);
  }
}

function stopTypingAction(chatKey) {
  const timer = typingActionTimers.get(chatKey);
  if (timer) {
    clearInterval(timer);
    typingActionTimers.delete(chatKey);
  }
}

async function sendTypingActionSafe(bot, chatId) {
  try {
    await bot.telegram.sendChatAction(chatId, "typing");
  } catch {
    // ignore
  }
}

function startTypingActionLoop(bot, chatId) {
  const chatKey = String(chatId);
  stopTypingAction(chatKey);
  sendTypingActionSafe(bot, chatId);
  const timer = setInterval(() => {
    sendTypingActionSafe(bot, chatId);
  }, TYPING_ACTION_INTERVAL_MS);
  typingActionTimers.set(chatKey, timer);
}

function clearPendingReplyTimer(chatKey) {
  const timer = pendingTimers.get(chatKey);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(chatKey);
  }
}

async function notifyAdmins(bot, from, text, reason) {
  const label = formatUserLabel(from);
  const body = [
    "🆘 Эскалация поддержки",
    reason ? `Причина: ${reason}` : "",
    label,
    "",
    text,
  ]
    .filter(Boolean)
    .join("\n");

  for (const adminId of SUPPORT_ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(adminId, body);
    } catch {
      // ignore delivery errors
    }
  }
}

function buildOffHoursReply() {
  return `Сейчас нерабочее время — поддержка на связи с ${SUPPORT_HOURS_START}:00 до ${SUPPORT_HOURS_END}:00 по Москве. Напишите в этот промежуток, мы обязательно ответим.`;
}

function buildMediaDeclineReply() {
  return "Фото и файлы пока не берём — напиши текстом, на каком шаге проблема и что на экране.";
}

function estimateTypingDurationMs(text) {
  const len = String(text || "").length;
  const thinkMs = randomBetween(200, 700);
  const msPerChar = randomBetween(SUPPORT_TYPING_MS_PER_CHAR_MIN, SUPPORT_TYPING_MS_PER_CHAR_MAX);
  const raw = thinkMs + len * msPerChar;
  return Math.max(SUPPORT_TYPING_MIN_MS, Math.min(raw, SUPPORT_TYPING_MAX_MS));
}

async function simulateTyping(bot, chatId, text) {
  const chatKey = String(chatId);
  stopTypingAction(chatKey);
  const duration = estimateTypingDurationMs(text);
  const started = Date.now();
  while (Date.now() - started < duration) {
    await sendTypingActionSafe(bot, chatId);
    await sleep(Math.min(TYPING_ACTION_INTERVAL_MS, duration - (Date.now() - started)));
  }
}

async function clearStatusMessage(bot, chatId, state) {
  const chatKey = String(chatId);
  stopStatusAnimation(chatKey);
  if (state.statusMessageId) {
    await deleteMessageSafe(bot, chatId, state.statusMessageId);
    state.statusMessageId = null;
    saveChats();
  }
}

async function deliverReply(bot, chatId, state, combinedText, from) {
  if (state.escalated) {
    return;
  }

  if (!isWithinSupportHours()) {
    return;
  }

  if (ESCALATION_PATTERN.test(combinedText)) {
    state.escalated = true;
    await clearStatusMessage(bot, chatId, state);
    saveChats();
    await notifyAdmins(bot, from, combinedText, "ключевые слова");
    await bot.telegram.sendMessage(
      chatId,
      "Понял, сейчас передам старшему специалисту — вернёмся к вам в ближайшее время.",
    );
    return;
  }

  try {
    const reply = humanizeSupportReply(
      await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model: OPENROUTER_MODEL,
        referer: WEB_PUBLIC_URL,
        userId: from?.id,
        agentName: state.agentName,
        history: state.history,
        userMessage: combinedText,
      }),
    );

    await simulateTyping(bot, chatId, reply);
    stopTypingAction(String(chatId));

    state.history.push({ role: "user", content: combinedText });
    state.history.push({ role: "assistant", content: reply });
    state.history = trimHistory(state.history);
    await clearStatusMessage(bot, chatId, state);
    saveChats();

    await bot.telegram.sendMessage(chatId, reply);
  } catch (error) {
    console.error("[support-bot] OpenRouter error:", error.message);
    stopTypingAction(String(chatId));
    await clearStatusMessage(bot, chatId, state);
    await bot.telegram.sendMessage(
      chatId,
      "Что-то подвисло у меня. Напиши ещё раз через пару минут.",
    );
    await notifyAdmins(bot, from, combinedText, `ошибка AI: ${error.message}`);
  }
}

function scheduleTypingStart(bot, chatId) {
  const key = String(chatId);
  clearTypingStartTimer(key);

  const delay = randomBetween(SUPPORT_TYPING_START_MIN_MS, SUPPORT_TYPING_START_MAX_MS);
  const timer = setTimeout(() => {
    typingStartTimers.delete(key);
    const state = getChatState(key);
    if (!state.pendingTexts?.length || state.escalated) {
      return;
    }
    startTypingActionLoop(bot, chatId);
  }, delay);

  typingStartTimers.set(key, timer);
}

function scheduleReply(bot, chatId, from) {
  const key = String(chatId);

  clearPendingReplyTimer(key);
  scheduleTypingStart(bot, chatId);

  const delay = randomBetween(SUPPORT_REPLY_DELAY_MIN_MS, SUPPORT_REPLY_DELAY_MAX_MS);
  const timer = setTimeout(async () => {
    pendingTimers.delete(key);
    clearTypingStartTimer(key);
    const current = getChatState(key);
    const batch = (current.pendingTexts || []).join("\n\n").trim();
    current.pendingTexts = [];
    saveChats();
    if (!batch) return;
    await deliverReply(bot, chatId, current, batch, from);
  }, delay);

  pendingTimers.set(key, timer);
}

const bot = new Telegraf(SUPPORT_BOT_TOKEN);

bot.start(async (ctx) => {
  if (ctx.chat?.type !== "private") return;

  const state = getChatState(ctx.chat.id);
  if (!isWithinSupportHours()) {
    await ctx.reply(buildOffHoursReply());
    return;
  }

  const chatKey = String(ctx.chat.id);
  const searchMessage = await ctx.reply(buildSearchingOperatorText(0));
  startStatusAnimation(
    bot,
    `${chatKey}:search`,
    ctx.chat.id,
    searchMessage.message_id,
    (frame) => buildSearchingOperatorText(frame),
  );
  await sleep(randomBetween(SUPPORT_OPERATOR_SEARCH_MIN_MS, SUPPORT_OPERATOR_SEARCH_MAX_MS));
  stopStatusAnimation(`${chatKey}:search`);
  await deleteMessageSafe(bot, ctx.chat.id, searchMessage.message_id);

  state.greeted = true;
  saveChats();
  await ctx.reply(`Привет, на связи ${state.agentName} из поддержки RollerBot, чем помочь?`);
});

bot.command("human", async (ctx) => {
  if (ctx.chat?.type !== "private") return;
  const state = getChatState(ctx.chat.id);
  state.escalated = true;
  clearPendingReplyTimer(String(ctx.chat.id));
  clearTypingStartTimer(String(ctx.chat.id));
  stopTypingAction(String(ctx.chat.id));
  stopStatusAnimation(String(ctx.chat.id));
  await clearStatusMessage(bot, ctx.chat.id, state);
  saveChats();
  await notifyAdmins(bot, ctx.from, ctx.message?.text || "/human", "команда /human");
  await ctx.reply("Передал ваш вопрос старшему специалисту — скоро вернёмся с ответом.");
});

bot.on("text", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Напишите мне в личные сообщения — так быстрее поможем.");
    return;
  }

  const text = String(ctx.message.text || "").trim();
  if (!text || text.startsWith("/")) return;

  const chatId = ctx.chat.id;
  const chatKey = String(chatId);
  const state = getChatState(chatId);

  if (!isWithinSupportHours()) {
    const now = Date.now();
    const last = state.lastOffHoursNoticeAt ? Date.parse(state.lastOffHoursNoticeAt) : 0;
    if (!last || now - last > 4 * 60 * 60 * 1000) {
      state.lastOffHoursNoticeAt = new Date().toISOString();
      saveChats();
      await ctx.reply(buildOffHoursReply());
    }
    return;
  }

  if (state.escalated) {
    await notifyAdmins(bot, ctx.from, text, "диалог уже эскалирован");
    await ctx.reply("Ваше сообщение передано специалисту, мы скоро ответим.");
    return;
  }

  if (!state.greeted) {
    state.greeted = true;
    saveChats();
  }

  if (!state.pendingTexts) state.pendingTexts = [];
  state.pendingTexts.push(text);
  saveChats();
  scheduleReply(bot, chatId, ctx.from);
});

bot.on(["photo", "document", "video", "voice", "video_note", "audio", "sticker", "animation"], async (ctx) => {
  if (ctx.chat?.type !== "private") return;

  const chatId = ctx.chat.id;
  const state = getChatState(chatId);

  clearPendingReplyTimer(String(chatId));
  clearTypingStartTimer(String(chatId));
  stopTypingAction(String(chatId));
  stopStatusAnimation(String(chatId));
  await clearStatusMessage(bot, chatId, state);
  state.pendingTexts = [];
  saveChats();

  if (!isWithinSupportHours()) {
    const now = Date.now();
    const last = state.lastOffHoursNoticeAt ? Date.parse(state.lastOffHoursNoticeAt) : 0;
    if (!last || now - last > 4 * 60 * 60 * 1000) {
      state.lastOffHoursNoticeAt = new Date().toISOString();
      saveChats();
      await ctx.reply(buildOffHoursReply());
    }
    return;
  }

  if (state.escalated) {
    await notifyAdmins(bot, ctx.from, "[медиа]", "диалог уже эскалирован");
    await ctx.reply("Ваше сообщение передано специалисту, мы скоро ответим.");
    return;
  }

  await ctx.reply(buildMediaDeclineReply());
});

bot.catch((error) => {
  console.error("[support-bot]", error);
});

loadChats();

async function boot() {
  const keyCheck = await verifyOpenRouterKey(OPENROUTER_API_KEY);
  if (!keyCheck.ok) {
    console.error(
      "[support-bot] OPENROUTER_API_KEY не работает:",
      keyCheck.error,
      "\n→ Создайте новый ключ: https://openrouter.ai/keys",
    );
  } else {
    console.log("[support-bot] OpenRouter ключ OK · модель", OPENROUTER_MODEL);
  }

  await bot.launch();
  console.log(
    `[support-bot] Telegram запущен · ${SUPPORT_HOURS_START}:00–${SUPPORT_HOURS_END}:00 ${TIMEZONE}`,
  );
}

boot().catch((error) => {
  console.error("[support-bot] не удалось запустить:", error.message);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
