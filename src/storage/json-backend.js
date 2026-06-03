const fs = require("fs");
const path = require("path");
const { DOCUMENT_DEFAULTS, KEY_TO_JSON_FILE } = require("./constants");
const { DATA_DIR } = require("./paths");

function jsonFilePath(key) {
  const fileName = KEY_TO_JSON_FILE[key];
  if (!fileName) {
    throw new Error(`Unknown store key: ${key}`);
  }
  return path.join(DATA_DIR, fileName);
}

function ensureJsonFiles() {
  for (const [key, fileName] of Object.entries(KEY_TO_JSON_FILE)) {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      const fallback = DOCUMENT_DEFAULTS[key] ?? {};
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
    }
  }
}

function readDocument(key) {
  const filePath = jsonFilePath(key);
  if (!fs.existsSync(filePath)) {
    return structuredCloneFallback(DOCUMENT_DEFAULTS[key] ?? {});
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return structuredCloneFallback(DOCUMENT_DEFAULTS[key] ?? {});
  }
}

function writeDocument(key, payload) {
  const filePath = jsonFilePath(key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function structuredCloneFallback(value) {
  return JSON.parse(JSON.stringify(value));
}

function readAllDocumentsFromJson() {
  const result = {};
  for (const key of Object.keys(KEY_TO_JSON_FILE)) {
    result[key] = readDocument(key);
  }
  return result;
}

module.exports = {
  ensureJsonFiles,
  readDocument,
  writeDocument,
  readAllDocumentsFromJson,
  jsonFilePath,
};
