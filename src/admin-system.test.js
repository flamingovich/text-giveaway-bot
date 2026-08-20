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

// A section total next to one sample line reads as though that line happened
// that many times. It did not, and that made a quiet log look like a fire.
test("the summary counts the repeating thing, not the section it belongs to", () => {
  const summary = summariseLog(
    [
      "[countdown] дайджест @chan: 400: Bad Request: message to edit not found",
      "[countdown] дайджест @chan: 400: Bad Request: message to edit not found",
      "[countdown] дайджест @chan: 400: Bad Request: message to edit not found",
      "[join] не удалось отправить в личку 111111111: 403",
      "[join] не удалось отправить в личку 222222222: 403",
    ].join("\n"),
  );

  const top = summary.kinds[0];
  assert.equal(top.count, 3);
  assert.match(top.sample, /дайджест/);

  const join = summary.kinds.find((kind) => /личку/.test(kind.sample));
  assert.equal(join.count, 2, "two people, one problem");
});

test("draw ids do not split one problem into many", () => {
  const summary = summariseLog(
    [
      "[sync] пропуск draw_1787181919981_672: 429: Too Many Requests",
      "[sync] пропуск draw_1787183675779_4384: 429: Too Many Requests",
    ].join("\n"),
  );
  assert.equal(summary.kinds[0].count, 2);
  assert.match(summary.kinds[0].sample, /draw_/, "the sample stays readable");
});

// The log file keeps every line ever written. A bug fixed this morning still
// has hundreds of lines in it, and counting them makes a quiet system look
// like a burning one.
test("lines from before timestamps were switched on are left out of the count", () => {
  const summary = summariseLog(
    [
      "[draw] пост больше не редактируется — счётчик замер",
      "[draw] пост больше не редактируется — счётчик замер",
      "[draw] пост больше не редактируется — счётчик замер",
      "2026-08-20T18:51:19: [join] не удалось отправить в личку 5536963572: chat not found",
    ].join("\n"),
  );

  assert.equal(summary.total, 1, "only what actually happened since");
  assert.equal(summary.undatedCount, 3, "and the older ones are still owned up to");
  assert.match(summary.kinds[0].sample, /chat not found/);
});

test("a log with no dates at all is still counted in full", () => {
  const summary = summariseLog(["[boot] что-то пошло не так", "[boot] и ещё раз"].join("\n"));
  assert.equal(summary.total, 2);
  assert.equal(summary.undatedCount, 0);
});
