const { DateTime } = require("luxon");
const { readDocument, writeDocument, STORE_KEYS } = require("./storage");
const SUPPORT_TRANSCRIPT_LIMIT = Number(process.env.SUPPORT_TRANSCRIPT_LIMIT || 2000);

function readSupportChats() {
  try {
    return readDocument(STORE_KEYS.SUPPORT_CHATS);
  } catch {
    return {};
  }
}

function writeSupportChats(raw) {
  writeDocument(STORE_KEYS.SUPPORT_CHATS, raw);
}

function createEmptySupportChatState(chatId) {
  return {
    agentName: "Оператор",
    history: [],
    messages: [],
    lastMessageAt: null,
    user: { id: Number(chatId) || chatId },
    escalated: false,
    greeted: true,
    lastOffHoursNoticeAt: null,
    pendingTexts: [],
    statusMessageId: null,
    hasUserMessage: true,
  };
}

function updateSupportChat(chatId, updater) {
  const raw = readSupportChats();
  const key = String(chatId);
  const state = ensureChatTranscriptFields(raw[key] || createEmptySupportChatState(key));
  updater(state);
  raw[key] = state;
  writeSupportChats(raw);
  return state;
}

async function sendSupportBotMessage(botToken, chatId, text) {
  if (!botToken) {
    throw new Error("SUPPORT_BOT_TOKEN не задан в .env");
  }
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4096),
      disable_web_page_preview: true,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const detail = data.description || data.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

function ensureChatTranscriptFields(state) {
  if (!state || typeof state !== "object") {
    return state;
  }
  if (!Array.isArray(state.messages)) {
    state.messages = [];
  }
  return state;
}

function syncChatUser(state, from) {
  if (!from?.id) {
    return;
  }
  state.user = {
    id: from.id,
    username: from.username || "",
    firstName: from.first_name || "",
    lastName: from.last_name || "",
  };
}

function appendTranscript(state, entry) {
  ensureChatTranscriptFields(state);
  const content = String(entry.content || "").trim();
  if (!content) {
    return;
  }

  state.messages.push({
    at: entry.at || new Date().toISOString(),
    role: entry.role === "user" || entry.role === "system" ? entry.role : "assistant",
    content,
    kind: entry.kind || "message",
  });

  if (state.messages.length > SUPPORT_TRANSCRIPT_LIMIT) {
    state.messages = state.messages.slice(-SUPPORT_TRANSCRIPT_LIMIT);
  }

  state.lastMessageAt = state.messages[state.messages.length - 1].at;
}

function getChatTranscript(state) {
  if (!state) {
    return [];
  }
  if (Array.isArray(state.messages) && state.messages.length > 0) {
    return state.messages;
  }
  return (state.history || []).map((item) => ({
    at: state.lastMessageAt || "",
    role: item.role === "user" ? "user" : "assistant",
    content: item.content || "",
    kind: "message",
  }));
}

function formatSupportChatUser(state, chatId) {
  const user = state?.user || {};
  const parts = [];
  if (user.firstName || user.lastName) {
    parts.push([user.firstName, user.lastName].filter(Boolean).join(" "));
  }
  if (user.username) {
    parts.push(`@${user.username}`);
  }
  parts.push(`ID ${user.id || chatId}`);
  return parts.filter(Boolean).join(" · ");
}

function getLastTranscriptPreview(state) {
  const transcript = getChatTranscript(state);
  const last = transcript[transcript.length - 1];
  if (!last?.content) {
    return "—";
  }
  const text = String(last.content).replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function listSupportChats(raw) {
  return Object.entries(raw || {})
    .map(([chatId, state]) => {
      const normalized = ensureChatTranscriptFields(state);
      const transcript = getChatTranscript(normalized);
      const last = transcript[transcript.length - 1];
      return {
        chatId,
        label: formatSupportChatUser(normalized, chatId),
        agentName: normalized.agentName || "—",
        escalated: Boolean(normalized.escalated),
        greeted: Boolean(normalized.greeted),
        sessionClosed: Boolean(normalized.sessionClosed),
        lastMessageAt: normalized.lastMessageAt || last?.at || "",
        preview: getLastTranscriptPreview(normalized),
        messageCount: transcript.length,
      };
    })
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
}

function formatMessageTime(iso, timezone) {
  if (!iso) {
    return "—";
  }
  const dt = DateTime.fromISO(iso, { zone: timezone });
  if (!dt.isValid) {
    return String(iso).slice(0, 16).replace("T", " ");
  }
  return dt.toFormat("dd.MM.yyyy HH:mm");
}

function buildSupportStopReply(agentName) {
  const name = agentName || "оператор";
  return `Ок, ${name} закончил диалог. Если снова понадобится помощь — нажми /start`;
}

async function closeSupportChatFromAdmin(botToken, chatId) {
  const raw = readSupportChats();
  const key = String(chatId);
  const state = ensureChatTranscriptFields(raw[key]);
  if (!state) {
    const error = new Error("Диалог не найден");
    error.code = "not_found";
    throw error;
  }

  const replyText = buildSupportStopReply(state.agentName);
  await sendSupportBotMessage(botToken, chatId, replyText);

  state.sessionClosed = true;
  delete state.adminHold;
  state.pendingTexts = [];
  state.closedAt = new Date().toISOString();
  appendTranscript(state, { role: "assistant", content: replyText, kind: "closed" });
  raw[key] = state;
  writeSupportChats(raw);
  return state;
}

module.exports = {
  readSupportChats,
  writeSupportChats,
  updateSupportChat,
  sendSupportBotMessage,
  ensureChatTranscriptFields,
  syncChatUser,
  appendTranscript,
  getChatTranscript,
  formatSupportChatUser,
  listSupportChats,
  formatMessageTime,
  buildSupportStopReply,
  closeSupportChatFromAdmin,
};
