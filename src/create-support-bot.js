const path = require("path");
const fs = require("fs");
const { Telegraf } = require("telegraf");
const { DateTime } = require("luxon");
const { applyNoLinkPreview } = require("./telegram-no-preview");

function createSupportBot(options) {
  const {
    logPrefix,
    botToken,
    chatsStore,
    ai,
    openRouterApiKey,
    openRouterModel,
    webPublicUrl,
    timezone = "Europe/Moscow",
    alwaysOn = false,
    hoursStart = 9,
    hoursEnd = 21,
    idleCloseMs = 10 * 60 * 1000,
    operatorSearchMinMs = 5_000,
    operatorSearchMaxMs = 20_000,
    typingStartMinMs = 2_000,
    typingStartMaxMs = 4_000,
    replyDelayMinMs = 15_000,
    replyDelayMaxMs = 35_000,
    typingMinMs = 500,
    typingMaxMs = 5_000,
    typingMsPerCharMin = 16,
    typingMsPerCharMax = 28,
    historyLimit = 16,
    buildSearchingText = (dots) => `Ищем свободного оператора${dots}`,
    buildGreeting = () => "Привет, ВИП поддержка на связи, чем помочь?",
    buildStopReply = () => "Диалог закрыт. Если снова понадобится помощь — нажми /start",
    buildClosedReply = () => "Диалог закрыт. Нажми /start, чтобы снова написать в поддержку.",
    buildOffHoursReply = () => "Сейчас нерабочее время. Напишите позже.",
    buildMediaDeclineReply = () => "Медиа не принимаем — напиши текстом что на экране и на каком шаге",
    evaluateUserMessage = () => ({ action: "continue" }),
    bootLogLine = () => "",
  } = options;

  const {
    chatsFile,
    readSupportChats,
    ensureChatTranscriptFields,
    syncChatUser,
    appendTranscript,
  } = chatsStore;

  fs.mkdirSync(path.dirname(chatsFile), { recursive: true });

  const chats = new Map();
  const pendingTimers = new Map();
  const typingStartTimers = new Map();
  const typingActionTimers = new Map();
  const statusAnimTimers = new Map();
  const idleCloseTimers = new Map();

  const STATUS_DOT_FRAMES = ["", ".", "..", "..."];
  const STATUS_ANIM_MS = 480;
  const TYPING_ACTION_INTERVAL_MS = 4_500;

  function log(...args) {
    console.log(logPrefix, ...args);
  }

  function warn(...args) {
    console.warn(logPrefix, ...args);
  }

  function error(...args) {
    console.error(logPrefix, ...args);
  }

  function loadChats() {
    if (!fs.existsSync(chatsFile)) {
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(chatsFile, "utf8"));
      for (const [chatId, state] of Object.entries(raw)) {
        const normalized = ensureChatTranscriptFields(state);
        normalized.escalated = false;
        delete normalized.adminHold;
        chats.set(chatId, normalized);
      }
    } catch {
      // ignore
    }
  }

  function saveChats() {
    const payload = Object.fromEntries(chats.entries());
    fs.writeFileSync(chatsFile, JSON.stringify(payload, null, 2));
  }

  function getChatState(chatId) {
    const key = String(chatId);
    if (!chats.has(key)) {
      chats.set(key, {
        agentName: ai.pickRandomAgentName(),
        history: [],
        messages: [],
        lastMessageAt: null,
        user: null,
        escalated: false,
        greeted: false,
        lastOffHoursNoticeAt: null,
        pendingTexts: [],
        statusMessageId: null,
        hasUserMessage: false,
      });
    }
    return chats.get(key);
  }

  function mergeChatStateFromDisk(chatId) {
    const key = String(chatId);
    const disk = readSupportChats()[key];
    const state = getChatState(chatId);
    if (!disk) {
      return state;
    }
    delete state.adminHold;
    state.pendingTexts = Array.isArray(disk.pendingTexts) ? [...disk.pendingTexts] : state.pendingTexts;
    if (Array.isArray(disk.messages) && disk.messages.length) {
      state.messages = disk.messages;
    }
    state.lastMessageAt = disk.lastMessageAt || state.lastMessageAt;
    if (disk.agentName) {
      state.agentName = disk.agentName;
    }
    if (disk.user) {
      state.user = disk.user;
    }
    if (Array.isArray(disk.history) && disk.history.length) {
      state.history = disk.history;
    }
    state.sessionClosed = Boolean(disk.sessionClosed);
    chats.set(key, ensureChatTranscriptFields(state));
    return state;
  }

  function clearIdleCloseTimer(chatKey) {
    const timer = idleCloseTimers.get(chatKey);
    if (timer) {
      clearTimeout(timer);
      idleCloseTimers.delete(chatKey);
    }
  }

  function clearChatTimers(chatKey) {
    clearPendingReplyTimer(chatKey);
    clearTypingStartTimer(chatKey);
    stopTypingAction(chatKey);
    stopStatusAnimation(chatKey);
    clearIdleCloseTimer(chatKey);
  }

  function resetChatState(chatId) {
    const chatKey = String(chatId);
    clearChatTimers(chatKey);
    chats.delete(chatKey);
    saveChats();
  }

  function isWithinSupportHours(now = DateTime.now().setZone(timezone)) {
    if (alwaysOn) {
      return true;
    }
    const hour = now.hour;
    return hour >= hoursStart && hour < hoursEnd;
  }

  function randomBetween(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function trimHistory(history) {
    return history.slice(-historyLimit);
  }

  function estimateTypingDurationMs(text) {
    const len = String(text || "").length;
    const thinkMs = randomBetween(200, 700);
    const msPerChar = randomBetween(typingMsPerCharMin, typingMsPerCharMax);
    const raw = thinkMs + len * msPerChar;
    return Math.max(typingMinMs, Math.min(raw, typingMaxMs));
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

  async function endSupportChat(bot, chatId, state, from, reason = "closed") {
    const chatKey = String(chatId);
    clearChatTimers(chatKey);
    stopStatusAnimation(chatKey);
    await clearStatusMessage(bot, chatId, state);

    if (state) {
      syncChatUser(state, from);
      state.pendingTexts = [];
      const replyText = buildStopReply(state.agentName, { reason });
      const outgoing = ai.humanizeSupportReply(replyText, state.agentName, {});
      appendTranscript(state, { role: "assistant", content: outgoing, kind: reason });
      state.closedAt = new Date().toISOString();
      state.sessionClosed = true;
      saveChats();
      try {
        await bot.telegram.sendMessage(chatId, outgoing);
      } catch {
        // ignore
      }
    }

    resetChatState(chatId);
  }

  async function closeIdleSupportChat(bot, chatId) {
    const chatKey = String(chatId);
    const state = chats.get(chatKey);
    if (!state || state.hasUserMessage) {
      clearIdleCloseTimer(chatKey);
      return;
    }

    clearChatTimers(chatKey);
    const text = "Оператор закрыл вопрос";
    appendTranscript(state, { role: "assistant", content: text, kind: "idle_close" });
    state.closedAt = new Date().toISOString();
    saveChats();

    try {
      await bot.telegram.sendMessage(chatId, text);
    } catch {
      // ignore
    }
  }

  function scheduleIdleClose(bot, chatId) {
    const chatKey = String(chatId);
    clearIdleCloseTimer(chatKey);
    if (!idleCloseMs || idleCloseMs <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      idleCloseTimers.delete(chatKey);
      closeIdleSupportChat(bot, chatId).catch((err) => {
        error("idle close error:", err.message);
      });
    }, idleCloseMs);

    idleCloseTimers.set(chatKey, timer);
  }

  async function deliverReply(bot, chatId, state, combinedText, from) {
    if (!isWithinSupportHours()) {
      return;
    }

    state = mergeChatStateFromDisk(chatId);
    if (state.sessionClosed) {
      state.pendingTexts = [];
      saveChats();
      return;
    }

    syncChatUser(state, from);

    try {
      const aggressiveUser =
        ai.isAggressiveUserMessage?.(combinedText) ||
        (state.history || []).slice(-6).some(
          (item) => item.role === "user" && ai.isAggressiveUserMessage?.(item.content),
        );

      const rawReply = await ai.callOpenRouter({
        apiKey: openRouterApiKey,
        model: openRouterModel,
        referer: webPublicUrl,
        userId: from?.id,
        agentName: state.agentName,
        chatUser: state.user,
        history: state.history,
        userMessage: combinedText,
        aggressiveUser,
      });

      if (ai.replyRequestsMedia?.(rawReply)) {
        warn("AI запросил медиа — ответ заменён:", rawReply.slice(0, 160));
      }

      const reply = ai.humanizeSupportReply(rawReply, state.agentName, { aggressiveUser });

      await simulateTyping(bot, chatId, reply);
      stopTypingAction(String(chatId));

      state.history.push({ role: "user", content: combinedText });
      state.history.push({ role: "assistant", content: reply });
      state.history = trimHistory(state.history);
      appendTranscript(state, { role: "assistant", content: reply, kind: "ai" });
      await clearStatusMessage(bot, chatId, state);
      saveChats();

      await bot.telegram.sendMessage(chatId, reply);
    } catch (err) {
      error(`OpenRouter error (model=${openRouterModel}):`, err.message);
      stopTypingAction(String(chatId));
      await clearStatusMessage(bot, chatId, state);
      const errorReply = "Что-то подвисло. Напиши ещё раз через пару минут.";
      appendTranscript(state, { role: "assistant", content: errorReply, kind: "error" });
      saveChats();
      await bot.telegram.sendMessage(chatId, errorReply);
    }
  }

  function scheduleTypingStart(bot, chatId) {
    const key = String(chatId);
    clearTypingStartTimer(key);

    const delay = randomBetween(typingStartMinMs, typingStartMaxMs);
    const timer = setTimeout(() => {
      typingStartTimers.delete(key);
      const state = getChatState(key);
      if (!state.pendingTexts?.length) {
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

    const delay = randomBetween(replyDelayMinMs, replyDelayMaxMs);
    const timer = setTimeout(async () => {
      pendingTimers.delete(key);
      clearTypingStartTimer(key);
      const current = mergeChatStateFromDisk(key);
      if (current.sessionClosed) {
        current.pendingTexts = [];
        saveChats();
        return;
      }
      const batch = (current.pendingTexts || []).join("\n\n").trim();
      current.pendingTexts = [];
      saveChats();
      if (!batch) return;
      await deliverReply(bot, chatId, current, batch, from);
    }, delay);

    pendingTimers.set(key, timer);
  }

  const bot = new Telegraf(botToken);
  applyNoLinkPreview(bot.telegram);

  bot.start(async (ctx) => {
    if (ctx.chat?.type !== "private") return;

    const chatKey = String(ctx.chat.id);
    clearChatTimers(chatKey);
    const state = getChatState(ctx.chat.id);
    syncChatUser(state, ctx.from);
    state.agentName = ai.pickRandomAgentName();
    state.history = [];
    state.escalated = false;
    state.sessionClosed = false;
    delete state.adminHold;
    state.pendingTexts = [];

    if (!isWithinSupportHours()) {
      const offHoursText = buildOffHoursReply();
      appendTranscript(state, { role: "assistant", content: offHoursText, kind: "off_hours" });
      saveChats();
      await ctx.reply(offHoursText);
      return;
    }

    const searchMessage = await ctx.reply(buildSearchingText(0));
    startStatusAnimation(
      bot,
      `${chatKey}:search`,
      ctx.chat.id,
      searchMessage.message_id,
      (frame) => buildSearchingText(frame),
    );
    await sleep(randomBetween(operatorSearchMinMs, operatorSearchMaxMs));
    stopStatusAnimation(`${chatKey}:search`);
    await deleteMessageSafe(bot, ctx.chat.id, searchMessage.message_id);

    state.greeted = true;
    state.hasUserMessage = false;
    const greeting = buildGreeting(state.agentName);
    appendTranscript(state, { role: "assistant", content: greeting, kind: "greeting" });
    saveChats();
    await ctx.reply(greeting);
    scheduleIdleClose(bot, ctx.chat.id);
  });

  bot.command("stop", async (ctx) => {
    if (ctx.chat?.type !== "private") return;

    const state = chats.get(String(ctx.chat.id));
    if (!state) {
      await ctx.reply("Диалога нет. Чтобы начать — /start");
      return;
    }

    await endSupportChat(bot, ctx.chat.id, state, ctx.from, "closed");
  });

  bot.on("text", async (ctx) => {
    if (ctx.chat?.type !== "private") {
      await ctx.reply("Напиши в личные сообщения — так быстрее ответим.");
      return;
    }

    const text = String(ctx.message.text || "").trim();
    if (!text) return;
    if (/^\/human\b/i.test(text)) return;
    if (/^\/stop\b/i.test(text)) return;
    if (text.startsWith("/")) return;

    const chatId = ctx.chat.id;
    const chatKey = String(chatId);
    const state = mergeChatStateFromDisk(chatId);
    syncChatUser(state, ctx.from);

    if (state.sessionClosed) {
      await ctx.reply(buildClosedReply());
      return;
    }

    const decision = evaluateUserMessage(text, state);
    if (decision.action === "close") {
      await endSupportChat(bot, chatId, state, ctx.from, decision.reason || "closed");
      return;
    }
    if (decision.action === "reply") {
      appendTranscript(state, { role: "user", content: text });
      appendTranscript(state, { role: "assistant", content: decision.message, kind: decision.kind || "policy" });
      saveChats();
      await ctx.reply(decision.message);
      return;
    }

    if (!isWithinSupportHours()) {
      const now = Date.now();
      const last = state.lastOffHoursNoticeAt ? Date.parse(state.lastOffHoursNoticeAt) : 0;
      if (!last || now - last > 4 * 60 * 60 * 1000) {
        state.lastOffHoursNoticeAt = new Date().toISOString();
        const offHoursText = buildOffHoursReply();
        appendTranscript(state, { role: "user", content: text });
        appendTranscript(state, { role: "assistant", content: offHoursText, kind: "off_hours" });
        saveChats();
        await ctx.reply(offHoursText);
      }
      return;
    }

    if (!state.greeted) {
      state.greeted = true;
      saveChats();
    }

    state.hasUserMessage = true;
    clearIdleCloseTimer(chatKey);

    if (!state.pendingTexts) state.pendingTexts = [];
    state.pendingTexts.push(text);
    appendTranscript(state, { role: "user", content: text });
    saveChats();
    scheduleReply(bot, chatId, ctx.from);
  });

  bot.on(["photo", "document", "video", "voice", "video_note", "audio", "sticker", "animation"], async (ctx) => {
    if (ctx.chat?.type !== "private") return;

    const chatId = ctx.chat.id;
    const state = mergeChatStateFromDisk(chatId);
    syncChatUser(state, ctx.from);

    if (state.sessionClosed) {
      await ctx.reply(buildClosedReply());
      return;
    }

    state.hasUserMessage = true;
    clearIdleCloseTimer(String(chatId));
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
        const offHoursText = buildOffHoursReply();
        appendTranscript(state, { role: "user", content: "[медиа]" });
        appendTranscript(state, { role: "assistant", content: offHoursText, kind: "off_hours" });
        saveChats();
        await ctx.reply(offHoursText);
      }
      return;
    }

    appendTranscript(state, { role: "user", content: "[медиа]" });
    const mediaReply = buildMediaDeclineReply();
    appendTranscript(state, { role: "assistant", content: mediaReply, kind: "media" });
    saveChats();
    await ctx.reply(mediaReply);
  });

  bot.catch((err) => {
    error(err);
  });

  loadChats();

  async function boot() {
    const keyCheck = await ai.verifyOpenRouterKey(openRouterApiKey);
    if (!keyCheck.ok) {
      error("OPENROUTER_API_KEY не работает:", keyCheck.error);
    } else {
      log("OpenRouter ключ OK");
    }

    if (ai.verifyOpenRouterModel) {
      const modelCheck = await ai.verifyOpenRouterModel(
        openRouterApiKey,
        openRouterModel,
        webPublicUrl,
      );
      if (!modelCheck.ok) {
        error(
          `Модель ${openRouterModel} недоступна:`,
          modelCheck.error,
          "→ задайте OPENROUTER_MODEL=google/gemini-2.5-flash в .env",
        );
      } else {
        log("OpenRouter модель OK ·", openRouterModel);
      }
    }

    await bot.launch();
    try {
      await bot.telegram.setMyCommands([
        { command: "start", description: "Начать чат с ВИП поддержкой" },
        { command: "stop", description: "Завершить диалог" },
      ]);
    } catch (err) {
      warn("не удалось обновить команды:", err.message);
    }

    const extra = bootLogLine();
    if (extra) {
      log(extra);
    }
    log(
      alwaysOn
        ? "Telegram запущен · 24/7"
        : `Telegram запущен · ${hoursStart}:00–${hoursEnd}:00 ${timezone}`,
    );
  }

  function stop() {
    bot.stop();
  }

  return { bot, boot, stop, endSupportChat, saveChats, chats };
}

module.exports = { createSupportBot };
