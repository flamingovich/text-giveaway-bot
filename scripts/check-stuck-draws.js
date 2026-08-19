#!/usr/bin/env node
/**
 * Диагностика розыгрышей, пострадавших от гонки записи (только чтение).
 *
 * До фикса планировщик мог отредактировать пост в канале и разослать ЛС
 * победителям, не сохранив результат в базу. Такие розыгрыши остаются
 * активными с просроченным endAt, и после выкатки фикса им выберут ДРУГИХ
 * победителей. Скрипт показывает их до перезапуска бота.
 *
 *   node scripts/check-stuck-draws.js
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { DateTime } = require("luxon");
const Database = require("better-sqlite3");
const { STORE_KEYS, DOCUMENT_DEFAULTS, KEY_TO_JSON_FILE } = require("../src/storage/constants");
const { DATA_DIR, SQLITE_DB_FILE } = require("../src/storage/paths");
const { getBackendName } = require("../src/storage");

const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";

function documentDefault(key) {
  return JSON.parse(JSON.stringify(DOCUMENT_DEFAULTS[key] ?? {}));
}

function parseOrDefault(payload, key) {
  try {
    return JSON.parse(payload);
  } catch {
    return documentDefault(key);
  }
}

function readJsonDocuments(keys) {
  const result = {};
  for (const key of keys) {
    const filePath = path.join(DATA_DIR, KEY_TO_JSON_FILE[key]);
    result[key] = fs.existsSync(filePath)
      ? parseOrDefault(fs.readFileSync(filePath, "utf8"), key)
      : documentDefault(key);
  }
  return result;
}

// Строго на чтение и одним соединением: скрипт рассчитан на запуск по живой
// базе работающего бота, создавать и мигрировать он ничего не должен.
function readSqliteDocuments(keys) {
  if (!fs.existsSync(SQLITE_DB_FILE)) {
    console.error(`База не найдена: ${SQLITE_DB_FILE}`);
    console.error("Проверьте STORAGE_BACKEND в .env и каталог data/.");
    process.exit(1);
  }

  let db;
  try {
    db = new Database(SQLITE_DB_FILE, { readonly: true, fileMustExist: true });
    db.prepare("SELECT 1 FROM documents LIMIT 1").get();
  } catch (error) {
    db?.close();
    console.error(`Не удалось открыть базу на чтение: ${error.message}`);
    console.error("");
    console.error("База в режиме WAL: соединению только на чтение нужны файлы");
    console.error("giveaway.db-wal и giveaway.db-shm, а их создаёт работающий бот.");
    console.error("Запускайте скрипт при работающем боте и от его пользователя:");
    console.error("  sudo -u giveaway node scripts/check-stuck-draws.js");
    process.exit(1);
  }

  try {
    const result = {};
    const statement = db.prepare("SELECT payload FROM documents WHERE key = ?");
    for (const key of keys) {
      const row = statement.get(key);
      result[key] = row ? parseOrDefault(row.payload, key) : documentDefault(key);
    }
    return result;
  } finally {
    db.close();
  }
}

function readDrawDocuments() {
  const keys = [STORE_KEYS.DRAWS, STORE_KEYS.DRAWS_ARCHIVE];
  return getBackendName() === "json" ? readJsonDocuments(keys) : readSqliteDocuments(keys);
}

function formatAt(iso) {
  if (!iso) {
    return "—";
  }
  const dt = DateTime.fromISO(iso, { zone: TIMEZONE });
  return dt.isValid ? dt.toFormat("dd.MM.yyyy HH:mm") : String(iso);
}

function overdueMinutes(endAt, now) {
  const dt = DateTime.fromISO(endAt, { zone: TIMEZONE });
  if (!dt.isValid || dt > now) {
    return null;
  }
  return Math.round(now.diff(dt, "minutes").minutes);
}

function main() {
  const now = DateTime.now().setZone(TIMEZONE);
  const documents = readDrawDocuments();
  const active = (documents[STORE_KEYS.DRAWS].draws || [])
    .map((draw) => ({ draw, archived: false }));
  const archived = (documents[STORE_KEYS.DRAWS_ARCHIVE].draws || [])
    .map((draw) => ({ draw, archived: true }));
  const draws = [...active, ...archived];

  const overdue = [];
  const finishedWithoutNotifications = [];

  for (const { draw, archived } of draws) {
    if (draw.status === "active" && draw.endAt) {
      const late = overdueMinutes(draw.endAt, now);
      if (late !== null) {
        overdue.push({ draw, late });
      }
    }

    if (draw.status === "finished") {
      const winnerIds = draw.winnerIds || [];
      const notifications = draw.winnerNotifications || {};
      const missing = winnerIds.filter((id) => !notifications[String(id)]);
      if (winnerIds.length > 0 && missing.length > 0) {
        finishedWithoutNotifications.push({ draw, missing, archived });
      }
    }
  }

  console.log(`Хранилище: ${getBackendName()} (открыто только на чтение)`);
  console.log(`Всего розыгрышей (активные + архив): ${draws.length}`);
  console.log("");

  if (overdue.length === 0) {
    console.log("✅ Активных розыгрышей с просроченным endAt нет.");
  } else {
    console.log(`⚠️  Активные с просроченным endAt: ${overdue.length}`);
    console.log("   Проверьте пост в канале ДО перезапуска бота: если победители");
    console.log("   там уже объявлены, при завершении будут выбраны другие.");
    console.log("");
    for (const { draw, late } of overdue) {
      console.log(
        [
          `   ${draw.id}`,
          `приз: ${draw.prize || "—"}`,
          `канал: ${draw.channelId || "—"}`,
          `пост: ${draw.messageId ?? "нет"}`,
          `завершение: ${formatAt(draw.endAt)} (просрочено на ${late} мин)`,
          `участников: ${(draw.participantIds || []).length}`,
        ].join(" | "),
      );
    }
  }

  console.log("");

  if (finishedWithoutNotifications.length === 0) {
    console.log("✅ Завершённых розыгрышей с победителями без уведомлений нет.");
    return;
  }

  const live = finishedWithoutNotifications.filter((item) => !item.archived);
  console.log(`⚠️  Завершённые с победителями без записи об уведомлении: ${finishedWithoutNotifications.length}`);
  console.log(`   Из них в активных (досылка отправит им уведомление): ${live.length}`);
  console.log("   Архивные досылка не трогает — они только для сверки.");
  console.log("");
  for (const { draw, missing, archived } of finishedWithoutNotifications) {
    console.log(
      [
        `   ${draw.id}`,
        archived ? "архив" : "АКТИВНЫЕ",
        `приз: ${draw.prize || "—"}`,
        `завершён: ${formatAt(draw.finishedAt || draw.endAt)}`,
        `без уведомления: ${missing.join(", ")}`,
      ].join(" | "),
    );
  }
}

main();
