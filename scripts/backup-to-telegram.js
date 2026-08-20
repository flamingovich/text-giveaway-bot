#!/usr/bin/env node
// Sends an encrypted copy of the database to Telegram.
//
// Backups that live on the same disk as the thing they back up protect against
// a slipped DELETE and nothing else. This puts a copy somewhere the server
// cannot take with it.
//
// The archive is encrypted because the database holds user ids, usernames and
// TRC-20 wallet addresses, and an unencrypted copy in a chat is a copy in
// somebody's cloud. Decrypting needs only openssl, no code from this repo:
//
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in <файл> -out db.gz -pass pass:ПАРОЛЬ
//   gunzip db.gz
//
//   node scripts/backup-to-telegram.js [--dry-run]

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");
const { promisify } = require("util");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const gzip = promisify(zlib.gzip);

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.BOT_TOKEN;
const PASSPHRASE = process.env.BACKUP_PASSPHRASE;
const CHAT_ID =
  process.env.BACKUP_CHAT_ID || String(process.env.ADMIN_IDS || "").split(",")[0].trim();
const DB_FILE = path.join(__dirname, "..", "data", "giveaway.db");
const MAX_TELEGRAM_UPLOAD = 50 * 1024 * 1024;

function fail(message) {
  console.error(`[backup] ${message}`);
  return message;
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(120000),
  });
  return response.json();
}

async function alertAdmin(text) {
  if (!TOKEN || !CHAT_ID) {
    return;
  }
  try {
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("text", text);
    await telegram("sendMessage", form);
  } catch {
    // If even the alert cannot go out there is nothing further to try.
  }
}

// What is actually inside, so a copy can be told apart from an empty one at a
// glance years later.
function describeDatabase(file) {
  try {
    // eslint-disable-next-line global-require
    const Database = require("better-sqlite3");
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare("SELECT payload FROM documents WHERE key = ?").get("draws");
      const draws = row ? JSON.parse(row.payload).draws || [] : [];
      const participants = draws.reduce((sum, draw) => sum + (draw.participantIds || []).length, 0);
      return `розыгрышей ${draws.length}, участий ${participants}`;
    } finally {
      db.close();
    }
  } catch {
    return "содержимое не прочитано";
  }
}

// A file copied while the bot is writing to it can be torn; SQLite's own backup
// API takes a consistent snapshot of a live database.
async function snapshot(destination) {
  // eslint-disable-next-line global-require
  const Database = require("better-sqlite3");
  const db = new Database(DB_FILE, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }
}

async function main() {
  if (!TOKEN) return fail("нет BOT_TOKEN");
  if (!CHAT_ID) return fail("некуда слать: задайте BACKUP_CHAT_ID или ADMIN_IDS");
  if (!PASSPHRASE) return fail("нет BACKUP_PASSPHRASE — копия без шифрования не отправляется");
  if (!fs.existsSync(DB_FILE)) return fail(`база не найдена: ${DB_FILE}`);

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "giveaway-backup-"));
  const snapshotFile = path.join(workDir, `giveaway-${stamp}.db`);
  const encryptedFile = `${snapshotFile}.gz.enc`;

  try {
    await snapshot(snapshotFile);
    const contents = describeDatabase(snapshotFile);
    const rawSize = fs.statSync(snapshotFile).size;

    fs.writeFileSync(`${snapshotFile}.gz`, await gzip(fs.readFileSync(snapshotFile)));
    fs.rmSync(snapshotFile);

    // The passphrase goes through the environment, not the command line, so it
    // never shows up in the process list.
    execFileSync(
      "openssl",
      [
        "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "200000",
        "-in", `${snapshotFile}.gz`,
        "-out", encryptedFile,
        "-pass", "env:BACKUP_PASSPHRASE",
      ],
      { env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE }, stdio: "pipe" },
    );
    fs.rmSync(`${snapshotFile}.gz`);

    const size = fs.statSync(encryptedFile).size;
    if (size > MAX_TELEGRAM_UPLOAD) {
      throw new Error(`архив ${Math.round(size / 1048576)} МБ — больше лимита Telegram в 50 МБ`);
    }

    const caption = [
      `Копия базы RollerBot — ${stamp.replace(/-/g, ":").replace(/^(\d{4}):(\d{2}):(\d{2})/, "$3.$2.$1")}`,
      `${contents}`,
      `${Math.round(rawSize / 1024)} КБ → ${Math.round(size / 1024)} КБ, зашифровано`,
      "Расшифровать: openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ФАЙЛ -out db.gz -pass pass:ПАРОЛЬ",
    ].join("\n");

    if (DRY_RUN) {
      console.log(`[backup] пробный прогон, не отправляю:\n${caption}`);
      return null;
    }

    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("caption", caption);
    form.append(
      "document",
      new Blob([fs.readFileSync(encryptedFile)]),
      path.basename(encryptedFile),
    );
    const result = await telegram("sendDocument", form);
    if (!result.ok) {
      throw new Error(result.description || "Telegram отклонил файл");
    }
    console.log(`[backup] отправлено: ${path.basename(encryptedFile)} (${Math.round(size / 1024)} КБ, ${contents})`);
    return null;
  } catch (error) {
    const message = `Резервная копия не создана: ${error.message}`;
    fail(message);
    // A backup that quietly stopped working is worse than none, because it is
    // trusted right up until it is needed.
    await alertAdmin(`⚠️ RollerBot: ${message}`);
    process.exitCode = 1;
    return message;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main();
