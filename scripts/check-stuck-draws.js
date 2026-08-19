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

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { DateTime } = require("luxon");
const { readData, readArchivedDraws, getStorageInfo } = require("../src/storage");

const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";

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
  const active = (readData().draws || []).map((draw) => ({ draw, archived: false }));
  const archived = (readArchivedDraws().draws || []).map((draw) => ({ draw, archived: true }));
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

  console.log(`Хранилище: ${getStorageInfo().backend}`);
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
