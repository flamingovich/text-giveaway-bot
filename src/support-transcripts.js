const path = require("path");
const fs = require("fs");
const { DateTime } = require("luxon");

const SUPPORT_CHATS_FILE = path.join(__dirname, "..", "data", "support-chats.json");
const SUPPORT_TRANSCRIPT_LIMIT = Number(process.env.SUPPORT_TRANSCRIPT_LIMIT || 2000);

function readSupportChats() {
  if (!fs.existsSync(SUPPORT_CHATS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(SUPPORT_CHATS_FILE, "utf8"));
  } catch {
    return {};
  }
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

module.exports = {
  SUPPORT_CHATS_FILE,
  readSupportChats,
  ensureChatTranscriptFields,
  syncChatUser,
  appendTranscript,
  getChatTranscript,
  formatSupportChatUser,
  listSupportChats,
  formatMessageTime,
};
