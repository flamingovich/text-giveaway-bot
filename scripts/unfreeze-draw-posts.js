// One-off repair. A network blink during a caption edit made the fallback text
// edit answer "there is no text in the message to edit", which was read as
// final and marked live posts uneditable for the rest of their draw. The code
// no longer draws that conclusion; this clears the verdicts it already reached.
//
// Read-only unless --apply is passed.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { readData, writeData, ensureStorage } = require("../src/storage");

const APPLY = process.argv.includes("--apply");
const RECOVERABLE = /there is no (text|caption) in the message/i;

function main() {
  ensureStorage();
  const data = readData();
  const repaired = [];

  for (const draw of data.draws || []) {
    if (draw.status !== "active" || !draw.postUneditableAt) {
      continue;
    }
    if (!RECOVERABLE.test(String(draw.postUneditableReason || ""))) {
      console.log(`  пропуск ${draw.id}: причина не из восстановимых — ${draw.postUneditableReason}`);
      continue;
    }
    repaired.push({
      id: draw.id,
      prize: draw.prize,
      since: draw.postUneditableAt,
      participants: (draw.participantIds || []).length,
    });
    delete draw.postUneditableAt;
    delete draw.postUneditableReason;
    delete draw.postSyncFingerprint;
  }

  for (const row of repaired) {
    console.log(`  разморожен ${row.id} | приз ${row.prize} | участников ${row.participants} | стоял с ${row.since}`);
  }

  if (repaired.length === 0) {
    console.log("  замороженных постов не найдено");
    return;
  }
  if (!APPLY) {
    console.log(`\n  это пробный прогон. Чтобы применить: node scripts/unfreeze-draw-posts.js --apply`);
    return;
  }
  writeData(data);
  console.log(`\n  применено: ${repaired.length}`);
}

main();
