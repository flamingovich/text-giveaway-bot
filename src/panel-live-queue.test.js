const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// index.js is not loaded in tests (it starts the bot), so this reads its source.
//
// The payout queue was drawn once, when the panel opened, and the live poll
// stood still while any sheet was open. A winner who confirmed and sent an
// address while the organiser watched the queue stayed "Уведомлён", with no
// address and no "Оплатил", until the panel was opened again.
const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");

test("the live poll sends the payout queue along", () => {
  assert.ok(source.includes("payoutQueueHtml: renderPayoutQueueContent(statsDraws, userProfiles, panelContext),"));
});

test("the queue's draws count into the version, on the page and in the poll alike", () => {
  const uses = source.split("getPanelVersionDraws(historyDraws, statsDraws, userProfiles, panelContext)").length - 1;
  assert.equal(uses, 2, "страница и опрос считают версию одинаково");
});

test("the poll keeps running while the payout queue sheet is open", () => {
  assert.ok(source.includes('const queuePanel = document.getElementById("payoutQueuePanel");'));
  assert.ok(source.includes('if (!queuePanel || queuePanel.classList.contains("panel-hidden")) return true;'));
});

// The icons left the blue buttons, but the project form's pencil still swapped
// the one on "Сохранить": querySelector found nothing, the script threw before
// opening the form, and the pencil did nothing at all.
test("no panel script reaches for the icons the buttons no longer have", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.doesNotMatch(source, /querySelector\(["']\.draw-ico["']\)/);
});
