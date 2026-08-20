const test = require("node:test");
const assert = require("node:assert/strict");
const { summariseLog, buildPlainReport, formatDuration, scrub } = require("./admin-system");

test("a bot token never reaches the report", () => {
  const line = "[boot] request to https://api.telegram.org/bot8835629478:AAH7xКлюч_ОченьДлинный123/getMe failed";
  assert.ok(!scrub(line).includes("8835629478:"));
  assert.match(scrub(line), /токен скрыт/);
});

test("log lines are grouped by what produced them", () => {
  const summary = summariseLog(
    [
      "[scheduler] тиков нет 200с — пересоздаю таймер",
      "[finish] уведомление не доставлено: draw=d1 user=7",
      "[finish] уведомление не доставлено: draw=d2 user=8",
      "[join] не удалось отправить в личку 9: 403",
    ].join("\n"),
  );

  const finish = summary.groups.find((group) => group.label.includes("Завершение"));
  assert.equal(finish.count, 2);
  assert.match(finish.last, /d2/);
  assert.equal(summary.groups[0].count, 2, "most frequent first");
});

test("stack trace continuation lines are dropped, their first line kept", () => {
  const summary = summariseLog(
    ["[scheduler] TimeoutError: boom", "    at Timeout._onTimeout (/x/y.js:1:1)", "    at listOnTimeout"].join("\n"),
  );

  assert.equal(summary.total, 1);
  assert.match(summary.tail[0], /TimeoutError/);
});

test("an empty log does not throw", () => {
  const summary = summariseLog("");
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.groups, []);
});

test("durations are said the way a person would", () => {
  assert.equal(formatDuration(45000), "45 с");
  assert.equal(formatDuration(600000), "10 мин");
  assert.equal(formatDuration(7200000), "2 ч");
  assert.equal(formatDuration(null), "—");
});

test("the pasteable report leads with whether the scheduler is alive", () => {
  const report = buildPlainReport({
    generatedAt: "2026-08-20T07:40:00.000+03:00",
    timezone: "Europe/Moscow",
    scheduler: { alive: false, ageMs: 900000, tick: 12 },
    watchdog: { installed: true, healthy: false, alertedAt: "2026-08-20T04:36:56.620Z" },
    process: { uptimeMs: 300000, memoryMb: 120, node: "v20.20.2", buildId: "123" },
    draws: {
      active: 4,
      overdue: [{ id: "draw_1", prize: "100$", lateMinutes: 22, participants: 140 }],
      finishedWithoutNotify: 2,
    },
    backups: { count: 3, ageMs: 3600000 },
    storage: { dbSize: 6672384, docs: [] },
    logs: { errors: { total: 2, groups: [{ label: "Планировщик", count: 2, last: "[scheduler] молчит" }], tail: ["[scheduler] молчит"] } },
  });

  assert.match(report, /МОЛЧИТ/);
  assert.match(report, /просрочен 22 мин: 100\$/);
  assert.match(report, /завершённых без уведомления 2/);
  assert.match(report, /Бэкапы: 3 шт/);
});
