const fs = require("fs");
const Database = require("better-sqlite3");
const { ALL_STORE_KEYS, DOCUMENT_DEFAULTS } = require("./constants");
const { DATA_DIR, SQLITE_DB_FILE } = require("./paths");
const { loadDocumentsFromJsonFiles, seedDocuments } = require("./migrate-json");

let dbInstance = null;

function initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function maybeAutoMigrateFromJson(db) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM documents").get();
  if (row.count > 0) {
    return { migrated: false, reason: "sqlite_not_empty" };
  }

  const hasJson = fs.existsSync(DATA_DIR);
  if (!hasJson) {
    return { migrated: false, reason: "no_data_dir" };
  }

  const documents = loadDocumentsFromJsonFiles();
  seedDocuments(db, documents, { replace: true });
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("initial_json_import");

  return { migrated: true, reason: "imported_from_json" };
}

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  dbInstance = new Database(SQLITE_DB_FILE);
  initSchema(dbInstance);
  maybeAutoMigrateFromJson(dbInstance);
  return dbInstance;
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function readDocument(key) {
  const db = getDb();
  const row = db.prepare("SELECT payload FROM documents WHERE key = ?").get(key);
  if (!row) {
    return JSON.parse(JSON.stringify(DOCUMENT_DEFAULTS[key] ?? {}));
  }
  try {
    return JSON.parse(row.payload);
  } catch {
    return JSON.parse(JSON.stringify(DOCUMENT_DEFAULTS[key] ?? {}));
  }
}

function writeDocument(key, payload) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO documents (key, payload, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    stmt.run(key, JSON.stringify(payload));
  })();
}

function readAllDocuments() {
  const db = getDb();
  const rows = db.prepare("SELECT key, payload FROM documents").all();
  const result = {};
  for (const key of ALL_STORE_KEYS) {
    result[key] = JSON.parse(JSON.stringify(DOCUMENT_DEFAULTS[key] ?? {}));
  }
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.payload);
    } catch {
      result[row.key] = JSON.parse(JSON.stringify(DOCUMENT_DEFAULTS[row.key] ?? {}));
    }
  }
  return result;
}

module.exports = {
  getDb,
  closeDb,
  readDocument,
  writeDocument,
  readAllDocuments,
  maybeAutoMigrateFromJson,
  initSchema,
};
