const path = require("path");

// The test bot (npm run dev:test) keeps its base elsewhere, named in
// GIVEAWAY_DATA_DIR. Production never sets it.
const DATA_DIR = process.env.GIVEAWAY_DATA_DIR
  ? path.resolve(process.env.GIVEAWAY_DATA_DIR)
  : path.join(__dirname, "..", "..", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const SQLITE_DB_FILE = path.join(DATA_DIR, "giveaway.db");
const JSON_ARCHIVE_DIR = path.join(DATA_DIR, "json-archive");

module.exports = {
  DATA_DIR,
  UPLOADS_DIR,
  SQLITE_DB_FILE,
  JSON_ARCHIVE_DIR,
};
