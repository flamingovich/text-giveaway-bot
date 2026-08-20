#!/usr/bin/env node
/**
 * Сторож планировщика. Запускается systemd-таймером раз в несколько минут.
 *
 * 20 августа планировщик умер в 04:55 и пролежал до 07:11 — узнали об этом
 * только потому, что победитель пожаловался. Розыгрыши всё это время не
 * завершались, три приза сгорели необработанными. Пульс в логе появился, но
 * логи никто не читает, поэтому проверять должен кто-то снаружи процесса.
 *
 *   node scripts/watchdog.js            # проверить и починить при необходимости
 *   node scripts/watchdog.js --dry-run  # только проверить
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { DateTime } = require("luxon");
const Database = require("better-sqlite3");
const { SQLITE_DB_FILE, DATA_DIR } = require("../src/storage/paths");
const { STORE_KEYS } = require("../src/storage/constants");

const execFileAsync = promisify(execFile);

const HEARTBEAT_FILE = path.join(DATA_DIR, ".scheduler-heartbeat");
const STATE_FILE = path.join(DATA_DIR, ".watchdog-state");
const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";
const PROCESS_NAME = process.env.WATCHDOG_PM2_NAME || "giveaway-bot";
const STALE_AFTER_MS = Number(process.env.WATCHDOG_STALE_MS || 150000);
const OVERDUE_AFTER_MS = Number(process.env.WATCHDOG_OVERDUE_MS || 300000);
const ALERT_CHAT_ID = String(process.env.WATCHDOG_ALERT_CHAT_ID || process.env.ADMIN_IDS || "")
  .split(",")[0]
  .trim();
const BOT_TOKEN = process.env.BOT_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

function readHeartbeat() {
  try {
    const stat = fs.statSync(HEARTBEAT_FILE);
    let tick = null;
    try {
      tick = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf8")).tick ?? null;
    } catch {
      // A torn write is not a reason to declare the scheduler dead; mtime is
      // what actually answers the question.
    }
    return { ageMs: Date.now() - stat.mtimeMs, tick };
  } catch {
    return { ageMs: null, tick: null };
  }
}

// Read-only, own connection: the bot is expected to be running.
function readOverdueDraws() {
  if (!fs.existsSync(SQLITE_DB_FILE)) {
    return [];
  }
  let db;
  try {
    db = new Database(SQLITE_DB_FILE, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT payload FROM documents WHERE key = ?").get(STORE_KEYS.DRAWS);
    if (!row) {
      return [];
    }
    const now = DateTime.now().setZone(TIMEZONE);
    return (JSON.parse(row.payload).draws || []).filter((draw) => {
      if (draw.status !== "active" || !draw.endAt) {
        return false;
      }
      const endAt = DateTime.fromISO(draw.endAt, { zone: TIMEZONE });
      return endAt.isValid && now.diff(endAt).milliseconds > OVERDUE_AFTER_MS;
    });
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { healthy: true, alertedAt: null };
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
  } catch {
    // Losing the state file only costs a repeated alert.
  }
}

async function notify(text) {
  if (!BOT_TOKEN || !ALERT_CHAT_ID) {
    console.warn("[watchdog] некому слать: нет BOT_TOKEN или ADMIN_IDS");
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ALERT_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.warn(`[watchdog] Telegram ответил ${response.status}`);
    }
  } catch (error) {
    console.warn("[watchdog] уведомление не ушло:", error.message);
  }
}

async function restartBot() {
  await execFileAsync("pm2", ["restart", PROCESS_NAME], { timeout: 60000 });
}

function describeAge(ms) {
  if (ms === null) {
    return "пульса нет вообще";
  }
  const minutes = Math.round(ms / 60000);
  return minutes >= 1 ? `${minutes} мин` : `${Math.round(ms / 1000)} с`;
}

async function main() {
  const heartbeat = readHeartbeat();
  const overdue = readOverdueDraws();
  const stale = heartbeat.ageMs === null || heartbeat.ageMs > STALE_AFTER_MS;
  const healthy = !stale && overdue.length === 0;
  const state = readState();
  const stamp = DateTime.now().setZone(TIMEZONE).toFormat("HH:mm");

  if (healthy) {
    if (!state.healthy) {
      await notify(`✅ <b>Планировщик снова работает</b>\nПроверка в ${stamp}, пульс ${describeAge(heartbeat.ageMs)} назад.`);
    }
    writeState({ healthy: true, alertedAt: null });
    console.log(`[watchdog] ок: пульс ${describeAge(heartbeat.ageMs)} назад, тик #${heartbeat.tick ?? "?"}`);
    return;
  }

  const reasons = [];
  if (stale) {
    reasons.push(`планировщик молчит ${describeAge(heartbeat.ageMs)}`);
  }
  if (overdue.length) {
    reasons.push(
      `${overdue.length} ${overdue.length === 1 ? "розыгрыш просрочен" : "розыгрышей просрочено"}`,
    );
  }

  console.error(`[watchdog] проблема: ${reasons.join("; ")}`);

  if (DRY_RUN) {
    console.error("[watchdog] --dry-run: не перезапускаю и не пишу");
    return;
  }

  let restarted = false;
  let restartError = "";
  // Only a silent scheduler is worth a restart. Overdue draws with a live
  // scheduler mean it is busy or stuck on one draw, and restarting would
  // interrupt whatever it is doing mid-way.
  if (stale) {
    try {
      await restartBot();
      restarted = true;
    } catch (error) {
      restartError = error.message || String(error);
    }
  }

  const lines = [`⚠️ <b>RollerBot: сбой планировщика</b>`, "", `Проверка в ${stamp}: ${reasons.join("; ")}.`];
  if (overdue.length) {
    lines.push("", "Просрочены:");
    for (const draw of overdue.slice(0, 5)) {
      lines.push(`• ${draw.prize || "без приза"} — участников ${(draw.participantIds || []).length}`);
    }
  }
  lines.push("", restarted ? "Бот перезапущен автоматически." : stale ? `Перезапустить не удалось: ${restartError}` : "Перезапуск не требовался.");

  // One message per outage, not one every five minutes.
  if (state.healthy) {
    await notify(lines.join("\n"));
  }
  writeState({ healthy: false, alertedAt: new Date().toISOString() });
}

main().catch((error) => {
  console.error("[watchdog]", error);
  process.exit(1);
});
