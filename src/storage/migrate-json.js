const fs = require("fs");
const path = require("path");
const { ALL_STORE_KEYS, DOCUMENT_DEFAULTS, KEY_TO_JSON_FILE } = require("./constants");
const { DATA_DIR, JSON_ARCHIVE_DIR } = require("./paths");
const jsonBackend = require("./json-backend");

function collectMigrationStats(documents) {
  const draws = documents.draws?.draws || [];
  const users = documents["user-project-profiles"]?.users || {};
  const projects = documents.projects?.projects || [];
  const supportChats = documents["support-chats"] || {};
  const depmanChats = documents["depman-support-chats"] || {};

  let participantEntries = 0;
  let winnerEntries = 0;
  for (const draw of draws) {
    participantEntries += (draw.participantIds || []).length;
    winnerEntries += (draw.winnerIds || []).length;
  }

  let profileBindings = 0;
  for (const userNode of Object.values(users)) {
    profileBindings += Object.keys(userNode?.projects || {}).length;
  }

  return {
    draws: draws.length,
    projects: projects.length,
    users: Object.keys(users).length,
    profileBindings,
    participantEntries,
    winnerEntries,
    supportChats: Object.keys(supportChats).length,
    depmanSupportChats: Object.keys(depmanChats).length,
  };
}

function loadDocumentsFromJsonFiles() {
  jsonBackend.ensureJsonFiles();
  return jsonBackend.readAllDocumentsFromJson();
}

function archiveJsonFiles(timestamp = Date.now()) {
  fs.mkdirSync(JSON_ARCHIVE_DIR, { recursive: true });
  const archived = [];
  for (const fileName of Object.values(KEY_TO_JSON_FILE)) {
    const source = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(source)) {
      continue;
    }
    const target = path.join(JSON_ARCHIVE_DIR, `${fileName}.${timestamp}.bak`);
    fs.copyFileSync(source, target);
    archived.push(target);
  }
  return archived;
}

function seedDocuments(db, documents, options = {}) {
  const insert = db.prepare(`
    INSERT INTO documents (key, payload, updated_at)
    VALUES (@key, @payload, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);

  const writeAll = db.transaction((entries) => {
    for (const [key, payload] of entries) {
      insert.run({
        key,
        payload: JSON.stringify(payload),
      });
    }
  });

  const entries = ALL_STORE_KEYS.map((key) => [key, documents[key] ?? DOCUMENT_DEFAULTS[key] ?? {}]);
  if (options.replace) {
    writeAll(entries);
    return;
  }

  for (const [key, payload] of entries) {
    const existing = db.prepare("SELECT key FROM documents WHERE key = ?").get(key);
    if (!existing) {
      insert.run({ key, payload: JSON.stringify(payload) });
    }
  }
}

function verifyDocumentsMatchJson(db) {
  const mismatches = [];
  for (const key of ALL_STORE_KEYS) {
    const fromJson = jsonBackend.readDocument(key);
    const row = db.prepare("SELECT payload FROM documents WHERE key = ?").get(key);
    const fromDb = row ? JSON.parse(row.payload) : null;
    const jsonText = JSON.stringify(fromJson);
    const dbText = JSON.stringify(fromDb);
    if (jsonText !== dbText) {
      mismatches.push(key);
    }
  }
  return mismatches;
}

module.exports = {
  collectMigrationStats,
  loadDocumentsFromJsonFiles,
  archiveJsonFiles,
  seedDocuments,
  verifyDocumentsMatchJson,
};
