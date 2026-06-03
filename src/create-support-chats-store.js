const { DateTime } = require("luxon");
const { readDocument, writeDocument, DATA_DIR } = require("./storage");

const TRANSCRIPT_LIMIT = Number(process.env.SUPPORT_TRANSCRIPT_LIMIT || 2000);

function createSupportChatsStore(storeKey) {
  function readSupportChats() {
    try {
      return readDocument(storeKey);
    } catch {
      return {};
    }
  }

  function writeSupportChats(raw) {
    writeDocument(storeKey, raw);
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

    if (state.messages.length > TRANSCRIPT_LIMIT) {
      state.messages = state.messages.slice(-TRANSCRIPT_LIMIT);
    }

    state.lastMessageAt = state.messages[state.messages.length - 1].at;
  }

  return {
    storeKey,
    readSupportChats,
    writeSupportChats,
    ensureChatTranscriptFields,
    createEmptySupportChatState,
    syncChatUser,
    appendTranscript,
  };
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

module.exports = { createSupportChatsStore, formatMessageTime, DATA_DIR };
