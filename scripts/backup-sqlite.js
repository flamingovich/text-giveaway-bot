#!/usr/bin/env node
const path = require("path");
const Database = require("better-sqlite3");

const sourcePath = process.argv[2];
const targetPath = process.argv[3];

if (!sourcePath || !targetPath) {
  console.error("Usage: node scripts/backup-sqlite.js <source.db> <target.db>");
  process.exit(1);
}

const db = new Database(sourcePath, { readonly: true });
db.backup(targetPath)
  .then(() => {
    db.close();
  })
  .catch((error) => {
    try {
      db.close();
    } catch {
      // ignore
    }
    console.error(error.message || error);
    process.exit(1);
  });
