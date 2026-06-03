const STORE_KEYS = {
  DRAWS: "draws",
  PROJECTS: "projects",
  KNOWN_CHANNELS: "known-channels",
  USER_PROJECT_PROFILES: "user-project-profiles",
  DELEGATED_ADMINS: "delegated-admins",
  SUPPORT_CHATS: "support-chats",
  DEPMAN_SUPPORT_CHATS: "depman-support-chats",
};

const DOCUMENT_DEFAULTS = {
  [STORE_KEYS.DRAWS]: { draws: [] },
  [STORE_KEYS.PROJECTS]: { projects: [] },
  [STORE_KEYS.KNOWN_CHANNELS]: { channels: [] },
  [STORE_KEYS.USER_PROJECT_PROFILES]: { users: {} },
  [STORE_KEYS.DELEGATED_ADMINS]: { admins: [] },
  [STORE_KEYS.SUPPORT_CHATS]: {},
  [STORE_KEYS.DEPMAN_SUPPORT_CHATS]: {},
};

const KEY_TO_JSON_FILE = {
  [STORE_KEYS.DRAWS]: "draws.json",
  [STORE_KEYS.PROJECTS]: "projects.json",
  [STORE_KEYS.KNOWN_CHANNELS]: "known-channels.json",
  [STORE_KEYS.USER_PROJECT_PROFILES]: "user-project-profiles.json",
  [STORE_KEYS.DELEGATED_ADMINS]: "delegated-admins.json",
  [STORE_KEYS.SUPPORT_CHATS]: "support-chats.json",
  [STORE_KEYS.DEPMAN_SUPPORT_CHATS]: "depman-support-chats.json",
};

const ALL_STORE_KEYS = Object.values(STORE_KEYS);

module.exports = {
  STORE_KEYS,
  DOCUMENT_DEFAULTS,
  KEY_TO_JSON_FILE,
  ALL_STORE_KEYS,
};
