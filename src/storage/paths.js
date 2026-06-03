const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const SQLITE_DB_FILE = path.join(DATA_DIR, "giveaway.db");
const JSON_ARCHIVE_DIR = path.join(DATA_DIR, "json-archive");

module.exports = {
  DATA_DIR,
  UPLOADS_DIR,
  SQLITE_DB_FILE,
  JSON_ARCHIVE_DIR,
};
