// The support section listed every conversation in one flat table, newest
// first. On production that is 117 rows of which 101 are closed, so the handful
// that still need a human were buried. Nobody answers from the panel day to day
// - the bot does - which makes the panel's job spotting where the bot failed,
// not running an operator queue. These are the signals worth spotting.

const LONG_CONVERSATION_MESSAGES = Number(process.env.SUPPORT_LONG_CONVERSATION || 20);

const CHAT_FLAGS = {
  awaitingReply: { label: "Без ответа", tone: "danger", weight: 100 },
  endedOnError: { label: "Оборвался ошибкой", tone: "danger", weight: 90 },
  escalated: { label: "Эскалация", tone: "warn", weight: 80 },
  hadError: { label: "Были сбои AI", tone: "warn", weight: 40 },
  long: { label: "Длинный", tone: "muted", weight: 20 },
  humanTouched: { label: "Отвечал человек", tone: "muted", weight: 10 },
};

function describeChat(chat) {
  const messages = Array.isArray(chat.transcript) ? chat.transcript : [];
  const last = messages[messages.length - 1] || null;

  const flags = [];
  const add = (key) => {
    if (CHAT_FLAGS[key]) {
      flags.push({ key, ...CHAT_FLAGS[key] });
    }
  };

  // The bot answers everything, so the user having the last word means it never
  // came back to them.
  if (last?.role === "user") {
    add("awaitingReply");
  }
  if (last?.kind === "error") {
    add("endedOnError");
  }
  if (chat.escalated) {
    add("escalated");
  }
  if (messages.some((message) => message.kind === "error")) {
    add("hadError");
  }
  if (messages.length >= LONG_CONVERSATION_MESSAGES) {
    add("long");
  }
  if (messages.some((message) => message.kind === "admin")) {
    add("humanTouched");
  }

  flags.sort((left, right) => right.weight - left.weight);

  return {
    ...chat,
    flags,
    // Anything a person should look at, as opposed to a conversation that
    // merely had a hiccup along the way and recovered.
    needsAttention: flags.some((flag) => flag.weight >= 80),
    severity: flags.reduce((max, flag) => Math.max(max, flag.weight), 0),
  };
}

const CHAT_TABS = [
  { id: "attention", label: "Требуют внимания" },
  { id: "open", label: "Живые" },
  { id: "errors", label: "Со сбоями AI" },
  { id: "closed", label: "Закрытые" },
  { id: "all", label: "Все" },
];

function matchesTab(chat, tab) {
  if (tab === "attention") {
    return chat.needsAttention;
  }
  if (tab === "open") {
    return !chat.sessionClosed;
  }
  if (tab === "errors") {
    return chat.flags.some((flag) => flag.key === "hadError" || flag.key === "endedOnError");
  }
  if (tab === "closed") {
    return Boolean(chat.sessionClosed);
  }
  return true;
}

function matchesQuery(chat, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) {
    return true;
  }
  if (String(chat.chatId).includes(needle)) {
    return true;
  }
  if (String(chat.label || "").toLowerCase().includes(needle)) {
    return true;
  }
  // Searching the transcript is the whole point when you are chasing "who asked
  // about a payout that never arrived".
  return (chat.transcript || []).some((message) =>
    String(message.content || "").toLowerCase().includes(needle),
  );
}

function summariseChats(chats) {
  return {
    total: chats.length,
    attention: chats.filter((chat) => chat.needsAttention).length,
    open: chats.filter((chat) => !chat.sessionClosed).length,
    withErrors: chats.filter((chat) =>
      chat.flags.some((flag) => flag.key === "hadError" || flag.key === "endedOnError"),
    ).length,
  };
}

function buildSupportView(chats, { tab = "attention", query = "", page = 1, pageSize = 50 } = {}) {
  const described = chats.map(describeChat);
  const summary = summariseChats(described);

  const activeTab = CHAT_TABS.some((item) => item.id === tab) ? tab : "attention";
  const filtered = described
    .filter((chat) => matchesTab(chat, activeTab))
    .filter((chat) => matchesQuery(chat, query))
    .sort((left, right) => {
      // Worst first inside the tab, then most recent.
      if (right.severity !== left.severity) {
        return right.severity - left.severity;
      }
      return String(right.lastMessageAt || "").localeCompare(String(left.lastMessageAt || ""));
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  return {
    summary,
    tabs: CHAT_TABS,
    activeTab,
    query,
    page: safePage,
    totalPages,
    totalFiltered: filtered.length,
    rows: filtered.slice(offset, offset + pageSize),
  };
}

module.exports = {
  describeChat,
  buildSupportView,
  summariseChats,
  CHAT_TABS,
  CHAT_FLAGS,
  LONG_CONVERSATION_MESSAGES,
};
