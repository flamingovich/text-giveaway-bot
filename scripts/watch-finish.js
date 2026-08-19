#!/usr/bin/env node
/**
 * Наблюдение за завершением розыгрышей в реальном времени (только чтение).
 *
 * Показывает рядом две картины и сравнивает их:
 *   - что бот пишет в лог (отправил уведомление, ошибка, досылка);
 *   - что реально легло в базу (победители, записи уведомлений, статусы).
 * Расхождение между ними и есть баг, из-за которого победителям приходило
 * по несколько сообщений, а призы сгорали.
 *
 *   node scripts/watch-finish.js            # пока не остановят (Ctrl+C)
 *   node scripts/watch-finish.js --minutes 40
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { DateTime } = require("luxon");
const Database = require("better-sqlite3");
const { STORE_KEYS } = require("../src/storage/constants");
const { SQLITE_DB_FILE } = require("../src/storage/paths");

const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";
const POLL_MS = Number(process.env.WATCH_POLL_MS || 5000);
const LOG_DIR = path.join(__dirname, "..", ".pm2", "logs");
const LOG_FILES = ["giveaway-bot-out-0.log", "giveaway-bot-error-0.log"];
const LOG_PATTERN = /\[finish\]|\[scheduler\]|\[draw\]|\[join\] не удалось|winner_notify/;

function parseMinutes(argv) {
  const index = argv.indexOf("--minutes");
  if (index === -1) {
    return null;
  }
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function now() {
  return DateTime.now().setZone(TIMEZONE);
}

function stamp() {
  return now().toFormat("HH:mm:ss");
}

function say(icon, message) {
  console.log(`${stamp()} ${icon} ${message}`);
}

function shortId(drawId) {
  return String(drawId).replace(/^draw_/, "").slice(-9);
}

function readDraws() {
  const db = new Database(SQLITE_DB_FILE, { readonly: true, fileMustExist: true });
  try {
    const read = (key) => {
      const row = db.prepare("SELECT payload FROM documents WHERE key = ?").get(key);
      return row ? JSON.parse(row.payload).draws || [] : [];
    };
    return [...read(STORE_KEYS.DRAWS), ...read(STORE_KEYS.DRAWS_ARCHIVE)];
  } finally {
    db.close();
  }
}

function snapshotDraw(draw) {
  const notifications = {};
  for (const [userId, record] of Object.entries(draw.winnerNotifications || {})) {
    notifications[userId] = {
      status: record.status || "—",
      sentAt: record.sentAt || "",
      verifiedAt: record.verifiedAt || "",
      paidAt: record.paidAt || "",
    };
  }
  return {
    status: draw.status,
    participants: (draw.participantIds || []).length,
    winnerIds: [...(draw.winnerIds || [])],
    finishedAt: draw.finishedAt || "",
    notifications,
    prize: draw.prize || "—",
    endAt: draw.endAt || "",
  };
}

const previous = new Map();
const finishedAtSeen = new Map();
let problems = 0;

function diffDraw(id, before, after) {
  const label = `${shortId(id)} (${after.prize})`;

  if (!before) {
    return;
  }

  if (after.participants > before.participants) {
    say("👤", `${label}: участников ${before.participants} → ${after.participants}`);
  } else if (after.participants < before.participants) {
    problems += 1;
    say("🔴", `ОТКАТ УЧАСТНИКОВ ${label}: ${before.participants} → ${after.participants} — запись устаревшим снимком!`);
  }

  if (before.status !== after.status) {
    say("🏁", `${label}: ${before.status} → ${after.status}`);
    if (after.status === "finished") {
      say("🎲", `${label}: победители ${after.winnerIds.join(", ") || "нет"}`);
      finishedAtSeen.set(id, Date.now());
    }
  }

  if (after.status === "finished" && before.winnerIds.length && after.winnerIds.length) {
    const changed = before.winnerIds.join(",") !== after.winnerIds.join(",");
    if (changed) {
      problems += 1;
      say("🔴", `ПЕРЕВЫБОР ПОБЕДИТЕЛЕЙ ${label}: было ${before.winnerIds.join(", ")} → стало ${after.winnerIds.join(", ")}`);
    }
  }

  for (const [userId, record] of Object.entries(after.notifications)) {
    const old = before.notifications[userId];

    if (!old) {
      say("✉️ ", `${label}: уведомление сохранено для ${userId} (${record.status})`);
      continue;
    }

    if (old.sentAt && record.sentAt && old.sentAt !== record.sentAt) {
      problems += 1;
      say("🔴", `ПОВТОРНОЕ УВЕДОМЛЕНИЕ ${label} для ${userId}: ${old.sentAt} → ${record.sentAt} — запись не сохранилась!`);
    }

    if (old.status !== record.status) {
      const icon = record.status === "confirmed" ? "✅" : record.status === "expired" ? "⛔" : "🔄";
      say(icon, `${label}: ${userId} ${old.status} → ${record.status}`);
    }

    if (!old.paidAt && record.paidAt) {
      say("💸", `${label}: ${userId} отмечен как выплаченный`);
    }
  }

  for (const userId of Object.keys(before.notifications)) {
    if (!after.notifications[userId]) {
      problems += 1;
      say("🔴", `ЗАПИСЬ ПРОПАЛА ${label} для ${userId} — её затёрли устаревшим снимком!`);
    }
  }
}

// Победители выбраны, а записи об уведомлении так и нет — именно так выглядел
// баг: ЛС уходило, но в базу не попадало, и досылка отправляла его снова.
function checkMissingNotifications(id, snapshot) {
  if (snapshot.status !== "finished" || snapshot.winnerIds.length === 0) {
    return;
  }
  const seenAt = finishedAtSeen.get(id);
  if (!seenAt || Date.now() - seenAt < 120000) {
    return;
  }
  const missing = snapshot.winnerIds.filter((winnerId) => !snapshot.notifications[String(winnerId)]);
  if (missing.length === 0) {
    finishedAtSeen.delete(id);
    return;
  }
  problems += 1;
  say("🔴", `${shortId(id)}: прошло 2 минуты, а у ${missing.length} победителей нет записи (${missing.join(", ")})`);
  finishedAtSeen.delete(id);
}

const logOffsets = new Map();

function initLogOffsets() {
  for (const name of LOG_FILES) {
    const file = path.join(LOG_DIR, name);
    logOffsets.set(name, fs.existsSync(file) ? fs.statSync(file).size : 0);
  }
}

function pollLogs() {
  for (const name of LOG_FILES) {
    const file = path.join(LOG_DIR, name);
    if (!fs.existsSync(file)) {
      continue;
    }
    const size = fs.statSync(file).size;
    const from = logOffsets.get(name) ?? size;
    if (size <= from) {
      if (size < from) {
        logOffsets.set(name, size);
      }
      continue;
    }
    const stream = fs.createReadStream(file, { start: from, end: size - 1, encoding: "utf8" });
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
    });
    stream.on("end", () => {
      logOffsets.set(name, size);
      for (const line of buffer.split("\n")) {
        const text = line.trim();
        if (text && LOG_PATTERN.test(text)) {
          const isRetry = /досылаю/.test(text);
          if (isRetry) {
            problems += 1;
          }
          say(isRetry ? "🔴" : "📄", text.slice(0, 200));
        }
      }
    });
    stream.on("error", () => {
      logOffsets.set(name, size);
    });
  }
}

function poll() {
  let draws;
  try {
    draws = readDraws();
  } catch (error) {
    say("⚠️ ", `база недоступна: ${error.message}`);
    return;
  }

  for (const draw of draws) {
    const id = String(draw.id);
    const snapshot = snapshotDraw(draw);
    diffDraw(id, previous.get(id), snapshot);
    previous.set(id, snapshot);
    checkMissingNotifications(id, snapshot);
  }

  pollLogs();
}

function printOpening() {
  const draws = readDraws().filter((draw) => draw.status === "active");
  console.log("═".repeat(78));
  console.log(`Наблюдение запущено ${now().toFormat("dd.MM.yyyy HH:mm:ss")} (${TIMEZONE}), опрос раз в ${POLL_MS / 1000}с`);
  console.log("═".repeat(78));
  if (draws.length === 0) {
    console.log("Активных розыгрышей нет.");
  }
  for (const draw of draws.sort((a, b) => String(a.endAt || "").localeCompare(String(b.endAt || "")))) {
    const end = draw.endAt ? DateTime.fromISO(draw.endAt, { zone: TIMEZONE }) : null;
    const left = end?.isValid ? Math.round(end.diff(now(), "minutes").minutes) : null;
    console.log(
      `  ${shortId(draw.id)} | ${String(draw.prize || "—").padEnd(9)} | участников ${String((draw.participantIds || []).length).padStart(4)} | ` +
        (left === null ? "завершение вручную" : `до конца ${left} мин (${end.toFormat("HH:mm")})`),
    );
  }
  console.log("─".repeat(78));
  console.log("🔴 = признак бага. Дальше только события, тишина — это норма.");
  console.log("");
}

function finish() {
  console.log("");
  console.log("═".repeat(78));
  if (problems === 0) {
    console.log(`✅ Наблюдение завершено. Признаков бага не обнаружено (${stamp()}).`);
  } else {
    console.log(`🔴 Наблюдение завершено. Подозрительных событий: ${problems}. Смотри строки с 🔴 выше.`);
  }
  console.log("═".repeat(78));
  process.exit(problems === 0 ? 0 : 2);
}

function main() {
  if (!fs.existsSync(SQLITE_DB_FILE)) {
    console.error(`База не найдена: ${SQLITE_DB_FILE}`);
    process.exit(1);
  }

  initLogOffsets();
  printOpening();
  poll();

  const timer = setInterval(poll, POLL_MS);
  const minutes = parseMinutes(process.argv);
  if (minutes) {
    setTimeout(() => {
      clearInterval(timer);
      finish();
    }, minutes * 60000);
  }

  process.on("SIGINT", () => {
    clearInterval(timer);
    finish();
  });
}

main();
