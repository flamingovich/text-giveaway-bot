const fs = require("fs");
const { STORE_KEYS } = require("./constants");
const { DATA_DIR, UPLOADS_DIR, SQLITE_DB_FILE } = require("./paths");
const jsonBackend = require("./json-backend");
const sqliteBackend = require("./sqlite-backend");

function getBackendName() {
  const value = String(process.env.STORAGE_BACKEND || "sqlite").trim().toLowerCase();
  return value === "json" ? "json" : "sqlite";
}

function getBackend() {
  return getBackendName() === "json" ? jsonBackend : sqliteBackend;
}

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (getBackendName() === "json") {
    jsonBackend.ensureJsonFiles();
    return;
  }

  sqliteBackend.getDb();
}

function readDocument(key) {
  ensureStorage();
  return getBackend().readDocument(key);
}

function writeDocument(key, payload) {
  ensureStorage();
  getBackend().writeDocument(key, payload);
}

function readData() {
  return readDocument(STORE_KEYS.DRAWS);
}

function writeData(data) {
  writeDocument(STORE_KEYS.DRAWS, data);
}

function readKnownChannels() {
  return readDocument(STORE_KEYS.KNOWN_CHANNELS);
}

function writeKnownChannels(data) {
  writeDocument(STORE_KEYS.KNOWN_CHANNELS, data);
}

function readProjects() {
  return readDocument(STORE_KEYS.PROJECTS);
}

function writeProjects(data) {
  writeDocument(STORE_KEYS.PROJECTS, data);
}

function readUserProjectProfiles() {
  return readDocument(STORE_KEYS.USER_PROJECT_PROFILES);
}

function writeUserProjectProfiles(data) {
  writeDocument(STORE_KEYS.USER_PROJECT_PROFILES, data);
}

function readDelegatedAdmins() {
  return readDocument(STORE_KEYS.DELEGATED_ADMINS);
}

function writeDelegatedAdmins(data) {
  writeDocument(STORE_KEYS.DELEGATED_ADMINS, data);
}

function getStorageInfo() {
  return {
    backend: getBackendName(),
    dataDir: DATA_DIR,
    sqliteFile: SQLITE_DB_FILE,
  };
}

module.exports = {
  STORE_KEYS,
  DATA_DIR,
  UPLOADS_DIR,
  SQLITE_DB_FILE,
  ensureStorage,
  readDocument,
  writeDocument,
  readData,
  writeData,
  readKnownChannels,
  writeKnownChannels,
  readProjects,
  writeProjects,
  readUserProjectProfiles,
  writeUserProjectProfiles,
  readDelegatedAdmins,
  writeDelegatedAdmins,
  getStorageInfo,
  getBackendName,
};
