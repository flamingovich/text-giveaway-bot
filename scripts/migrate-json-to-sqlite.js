#!/usr/bin/env node
/**
 * Импорт JSON из data/*.json в SQLite (data/giveaway.db).
 *
 * Примеры:
 *   node scripts/migrate-json-to-sqlite.js
 *   node scripts/migrate-json-to-sqlite.js --apply
 *   node scripts/migrate-json-to-sqlite.js --apply --archive-json
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { ALL_STORE_KEYS } = require("../src/storage/constants");
const { SQLITE_DB_FILE } = require("../src/storage/paths");
const {
  collectMigrationStats,
  loadDocumentsFromJsonFiles,
  archiveJsonFiles,
  seedDocuments,
  verifyDocumentsMatchJson,
} = require("../src/storage/migrate-json");
const sqliteBackend = require("../src/storage/sqlite-backend");

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    archiveJson: argv.includes("--archive-json"),
    force: argv.includes("--force"),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const documents = loadDocumentsFromJsonFiles();
  const stats = collectMigrationStats(documents);

  console.log("JSON → SQLite migration preview\n");
  console.log(`Database: ${SQLITE_DB_FILE}`);
  console.log(`Mode: ${args.apply ? "APPLY" : "dry run"}\n`);
  console.log("Counts from JSON:");
  console.log(`  draws:                ${stats.draws}`);
  console.log(`  projects:             ${stats.projects}`);
  console.log(`  users:                ${stats.users}`);
  console.log(`  profile bindings:     ${stats.profileBindings}`);
  console.log(`  participant entries:  ${stats.participantEntries}`);
  console.log(`  winner entries:       ${stats.winnerEntries}`);
  console.log(`  support chats:        ${stats.supportChats}`);
  console.log(`  depman support chats: ${stats.depmanSupportChats}`);
  console.log(`  store keys:           ${ALL_STORE_KEYS.length}`);

  if (!args.apply) {
    console.log("\nDry run only. Add --apply to write SQLite.");
    return;
  }

  const db = sqliteBackend.getDb();
  const existing = db.prepare("SELECT COUNT(*) AS count FROM documents").get().count;
  if (existing > 0 && !args.force) {
    console.error("\nSQLite already has documents. Use --force to replace them.");
    process.exit(1);
  }

  seedDocuments(db, documents, { replace: true });
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("manual_json_import");

  const mismatches = verifyDocumentsMatchJson(db);
  if (mismatches.length) {
    console.error("\nVerification failed for keys:", mismatches.join(", "));
    process.exit(1);
  }

  if (args.archiveJson) {
    const archived = archiveJsonFiles(Date.now());
    console.log(`\nArchived ${archived.length} JSON files to data/json-archive/`);
  }

  console.log("\nMigration complete. Set STORAGE_BACKEND=sqlite in .env and restart PM2.");
}

main();
