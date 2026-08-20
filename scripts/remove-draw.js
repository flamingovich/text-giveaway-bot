#!/usr/bin/env node
// Removes a draw record by id. Read-only unless --apply is passed.
//
// Deliberately fussy: a draw is the record of who took part and who was owed
// what, so this refuses to touch anything that looks like it still matters and
// makes a copy of the database before it writes.
//
//   node scripts/remove-draw.js <draw_id>
//   node scripts/remove-draw.js <draw_id> --apply

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { readData, writeData, ensureStorage, SQLITE_DB_FILE } = require("../src/storage");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const drawId = args.find((arg) => !arg.startsWith("--"));

function refuse(reason) {
  console.log(`  ОТКАЗ: ${reason}`);
  console.log("  Если это всё же нужно — добавьте --force.");
  process.exit(1);
}

function main() {
  if (!drawId) {
    console.log("  укажите id розыгрыша");
    process.exit(1);
  }
  ensureStorage();
  const data = readData();
  const index = (data.draws || []).findIndex((item) => item.id === drawId);
  if (index === -1) {
    console.log(`  розыгрыш ${drawId} не найден среди активных`);
    process.exit(1);
  }

  const draw = data.draws[index];
  const participants = (draw.participantIds || []).length;
  const winners = draw.winnerIds || [];
  const notifications = draw.winnerNotifications || {};
  const owed = winners.filter((id) => {
    const notify = notifications[String(id)];
    return notify && !notify.paidAt && notify.status !== "forfeited";
  });

  console.log(`  ${draw.id}`);
  console.log(`     приз: ${draw.prize || "—"} | статус: ${draw.status} | участников: ${participants}`);
  console.log(`     канал: ${draw.channelId} | сообщение: ${draw.messageId || "—"}`);
  console.log(`     создан: ${String(draw.createdAt || "").slice(0, 10)} | победителей: ${winners.length}`);

  if (!FORCE && owed.length > 0) {
    refuse(`у ${owed.length} победителей приз ещё не выдан и не сгорел`);
  }
  if (!FORCE && participants > 10) {
    refuse(`участников ${participants} — это не похоже на тест`);
  }

  if (!APPLY) {
    console.log(`\n  пробный прогон. Чтобы удалить: node scripts/remove-draw.js ${drawId} --apply`);
    return;
  }

  const backup = `${SQLITE_DB_FILE}.before-remove-${drawId}`;
  fs.copyFileSync(SQLITE_DB_FILE, backup);
  console.log(`  копия базы: ${backup}`);

  data.draws.splice(index, 1);
  writeData(data);
  console.log(`  удалён. Пост в канале остался — бот его больше не трогает.`);
}

main();
