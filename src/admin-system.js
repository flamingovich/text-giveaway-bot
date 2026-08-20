// Everything a person would have to SSH in to find out, on one page. When
// something breaks the useful question is "what does the server say", and until
// now the answer lived in log files nobody outside the terminal could reach.

const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const { DATA_DIR, SQLITE_DB_FILE } = require("./storage/paths");
const { STORE_KEYS } = require("./storage/constants");

const HEARTBEAT_FILE = path.join(DATA_DIR, ".scheduler-heartbeat");
const WATCHDOG_STATE_FILE = path.join(DATA_DIR, ".watchdog-state");
const BACKUP_DIR = path.join(DATA_DIR, "..", "backups", "hourly");
const LOG_DIR = path.join(DATA_DIR, "..", ".pm2", "logs");
const LOG_TAIL_BYTES = 220 * 1024;

// A token in a log line must not reach a screenshot in a chat.
function scrub(line) {
  return String(line)
    // Anything shaped like bot<digits>:<secret> goes, whatever the secret looks
    // like - a scrub that only matches the expected alphabet is not a scrub.
    .replace(/bot\d{6,}:\S{5,}/g, "bot<токен скрыт>")
    .replace(/\b[A-Za-z0-9_-]{24,}:[A-Za-z0-9_-]{24,}\b/g, "<скрыто>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "<ключ скрыт>");
}

function readTail(file, bytes = LOG_TAIL_BYTES) {
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - bytes);
    const fd = fs.openSync(file, "r");
    try {
      const buffer = Buffer.alloc(size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function fileAge(file) {
  try {
    return Date.now() - fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "—";
  }
  if (bytes > 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }
  return `${Math.round(bytes / 1024)} КБ`;
}

function formatDuration(ms) {
  if (ms === null || !Number.isFinite(ms)) {
    return "—";
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds} с`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ч`;
  return `${Math.round(hours / 24)} дн`;
}

const LOG_KINDS = [
  { key: "scheduler", match: /^\[scheduler\]/, label: "Планировщик" },
  { key: "finish", match: /^\[finish\]/, label: "Завершение и победители" },
  { key: "boot", match: /^\[boot\]/, label: "Запуск и Telegram" },
  { key: "openrouter", match: /^\[openrouter\]/, label: "AI-прокси" },
  { key: "payout", match: /^\[payout-queue\]/, label: "Очередь выплат" },
  { key: "sync", match: /^\[sync\]|^\[draw-sync\]/, label: "Синхронизация постов" },
  { key: "join", match: /^\[join\]/, label: "Вступления" },
  { key: "admin", match: /^\[admin\]/, label: "Админка" },
];

function classify(line) {
  for (const kind of LOG_KINDS) {
    if (kind.match.test(line)) {
      return kind;
    }
  }
  return { key: "other", label: "Прочее" };
}

// Grouped counts answer "is this happening a lot"; the raw tail answers "what
// exactly did it say". Both are needed, neither on its own.
function summariseLog(text, { limit = 40 } = {}) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    // Stack trace continuation lines say nothing without their first line.
    .filter((line) => !/^at\s/.test(line));

  const groups = new Map();
  for (const line of lines) {
    const kind = classify(line);
    const entry = groups.get(kind.key) || { label: kind.label, count: 0, last: "" };
    entry.count += 1;
    entry.last = line;
    groups.set(kind.key, entry);
  }

  return {
    total: lines.length,
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
    tail: lines.slice(-limit).map(scrub),
  };
}

function readDrawState(timezone) {
  const result = { active: 0, overdue: [], finishedWithoutNotify: 0, total: 0, updatedAt: null };
  if (!fs.existsSync(SQLITE_DB_FILE)) {
    return result;
  }

  let db;
  try {
    // eslint-disable-next-line global-require
    const Database = require("better-sqlite3");
    db = new Database(SQLITE_DB_FILE, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT payload, updated_at FROM documents WHERE key = ?").get(STORE_KEYS.DRAWS);
    if (!row) {
      return result;
    }
    result.updatedAt = row.updated_at;
    const draws = JSON.parse(row.payload).draws || [];
    result.total = draws.length;
    const now = DateTime.now().setZone(timezone);

    for (const draw of draws) {
      if (draw.status === "active") {
        result.active += 1;
        if (draw.endAt) {
          const endAt = DateTime.fromISO(draw.endAt, { zone: timezone });
          if (endAt.isValid && endAt < now) {
            result.overdue.push({
              id: draw.id,
              prize: draw.prize || "—",
              lateMinutes: Math.round(now.diff(endAt, "minutes").minutes),
              participants: (draw.participantIds || []).length,
            });
          }
        }
      }
      if (draw.status === "finished") {
        const winners = draw.winnerIds || [];
        const notifications = draw.winnerNotifications || {};
        if (winners.some((id) => !notifications[String(id)])) {
          result.finishedWithoutNotify += 1;
        }
      }
    }
  } catch {
    // A diagnostics page must never be the thing that breaks.
  } finally {
    db?.close();
  }
  return result;
}

function readStorageState() {
  const docs = [];
  let dbSize = null;
  if (!fs.existsSync(SQLITE_DB_FILE)) {
    return { dbSize, docs };
  }
  let db;
  try {
    dbSize = fs.statSync(SQLITE_DB_FILE).size;
    // eslint-disable-next-line global-require
    const Database = require("better-sqlite3");
    db = new Database(SQLITE_DB_FILE, { readonly: true, fileMustExist: true });
    for (const row of db
      .prepare("SELECT key, length(payload) AS size, updated_at FROM documents ORDER BY size DESC")
      .all()) {
      docs.push({ key: row.key, size: row.size, updatedAt: row.updated_at });
    }
  } catch {
    // ignore
  } finally {
    db?.close();
  }
  return { dbSize, docs };
}

function readBackupState() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith(".db"))
      .map((name) => ({ name, mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0) {
      return { count: 0, ageMs: null, newest: "" };
    }
    return { count: files.length, ageMs: Date.now() - files[0].mtime, newest: files[0].name };
  } catch {
    return { count: 0, ageMs: null, newest: "" };
  }
}

function collectSystemState({ timezone, buildId, botUsername, schedulerIntervalMs, telegramCalls = null }) {
  const heartbeat = readJson(HEARTBEAT_FILE);
  const heartbeatAge = fileAge(HEARTBEAT_FILE);
  const watchdog = readJson(WATCHDOG_STATE_FILE);
  const memory = process.memoryUsage();

  const staleAfter = Math.max(150000, (schedulerIntervalMs || 30000) * 4);

  return {
    generatedAt: DateTime.now().setZone(timezone).toISO(),
    timezone,
    scheduler: {
      alive: heartbeatAge !== null && heartbeatAge < staleAfter,
      ageMs: heartbeatAge,
      tick: heartbeat?.tick ?? null,
      lastAt: heartbeat?.at || null,
      intervalMs: schedulerIntervalMs || null,
    },
    watchdog: {
      installed: watchdog !== null,
      healthy: watchdog ? watchdog.healthy !== false : null,
      alertedAt: watchdog?.alertedAt || null,
      checkedAgeMs: fileAge(WATCHDOG_STATE_FILE),
    },
    process: {
      uptimeMs: Math.round(process.uptime() * 1000),
      memoryMb: Math.round(memory.rss / 1024 / 1024),
      node: process.version,
      buildId: buildId || "—",
      botUsername: botUsername || "—",
      pid: process.pid,
    },
    telegramCalls,
    draws: readDrawState(timezone),
    storage: readStorageState(),
    backups: readBackupState(),
    logs: {
      errors: summariseLog(readTail(path.join(LOG_DIR, "giveaway-bot-error-0.log"))),
      support: summariseLog(readTail(path.join(LOG_DIR, "support-bot-error-1.log"), 60 * 1024), 12),
    },
  };
}

// The point of the page: something to paste into a chat.
function buildPlainReport(state) {
  const lines = [];
  const when = DateTime.fromISO(state.generatedAt, { zone: state.timezone });
  lines.push(`RollerBot — состояние на ${when.toFormat("dd.MM.yyyy HH:mm")} (${state.timezone})`);
  lines.push("");
  lines.push(
    `Планировщик: ${state.scheduler.alive ? "работает" : "МОЛЧИТ"}, пульс ${formatDuration(state.scheduler.ageMs)} назад, тик #${state.scheduler.tick ?? "?"}`,
  );
  lines.push(
    `Сторож: ${state.watchdog.installed ? (state.watchdog.healthy ? "норма" : "СООБЩАЛ О СБОЕ") : "не установлен"}${
      state.watchdog.alertedAt ? `, последняя тревога ${state.watchdog.alertedAt}` : ""
    }`,
  );
  lines.push(
    `Процесс: аптайм ${formatDuration(state.process.uptimeMs)}, память ${state.process.memoryMb} МБ, node ${state.process.node}, сборка ${state.process.buildId}`,
  );
  lines.push(
    `Розыгрыши: активных ${state.draws.active}, просрочено ${state.draws.overdue.length}, завершённых без уведомления ${state.draws.finishedWithoutNotify}`,
  );
  for (const draw of state.draws.overdue.slice(0, 5)) {
    lines.push(`  просрочен ${draw.lateMinutes} мин: ${draw.prize} (${draw.participants} участников) ${draw.id}`);
  }
  lines.push(
    `Бэкапы: ${state.backups.count} шт, свежий ${formatDuration(state.backups.ageMs)} назад`,
  );
  lines.push(`База: ${formatBytes(state.storage.dbSize)}`);
  if (state.telegramCalls) {
    lines.push(
      `Запросы к Telegram: ${state.telegramCalls.total} с запуска, ${state.telegramCalls.perMinute}/мин — ` +
        state.telegramCalls.methods
          .slice(0, 5)
          .map((row) => `${row.method} ${row.count}`)
          .join(", "),
    );
  }
  lines.push("");
  lines.push(`Ошибки в логе (${state.logs.errors.total} строк в хвосте):`);
  for (const group of state.logs.errors.groups) {
    lines.push(`  ${group.label}: ${group.count} — ${scrub(group.last).slice(0, 160)}`);
  }
  lines.push("");
  lines.push("Последние строки лога:");
  for (const line of state.logs.errors.tail.slice(-25)) {
    lines.push(`  ${line.slice(0, 200)}`);
  }
  return lines.join("\n");
}

module.exports = {
  collectSystemState,
  buildPlainReport,
  summariseLog,
  formatDuration,
  formatBytes,
  scrub,
};
