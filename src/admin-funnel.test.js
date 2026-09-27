const test = require("node:test");
const assert = require("node:assert");
const { buildFunnelStats, normalizeFunnelPeriod } = require("./admin-funnel");
const { stagesToMask } = require("./join-funnel");

const NOW = Date.parse("2026-09-26T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function fakeStore(rows) {
  return {
    list: ({ since }) => rows.filter((row) => row.firstAt >= since),
    trackedSince: () => Math.min(...rows.map((row) => row.firstAt)),
  };
}

function row(drawId, stages, daysAgo = 1) {
  return { drawId, stages: stagesToMask(stages), firstAt: NOW - daysAgo * DAY_MS };
}

const DRAWS = [
  { id: "d1", prize: "100$", projectId: "p1", status: "active", createdAt: "2026-09-20T10:00:00Z" },
  { id: "d2", prize: "50$", projectId: "p1", status: "finished", createdAt: "2026-09-10T10:00:00Z" },
];
const PROJECTS = [{ id: "p1", name: "BEEF" }];

test("the page counts people, how many got in and where the rest stopped", () => {
  const stats = buildFunnelStats({
    store: fakeStore([
      row("d1", ["opened", "captcha"]),
      row("d1", ["opened", "captcha", "channel"]),
      row("d1", ["opened", "captcha", "channel"]),
      row("d1", ["opened", "captcha", "channel", "registration", "trc20", "joined"]),
      row("d2", ["opened", "joined"]),
    ]),
    draws: DRAWS,
    projects: PROJECTS,
    timezone: "Europe/Moscow",
    period: "30",
    now: NOW,
  });

  assert.equal(stats.total.people, 5);
  assert.equal(stats.total.joined, 2);
  assert.equal(stats.conversion, 40);
  assert.equal(stats.dropped, 3);
  assert.deepEqual(stats.worst, { stage: "channel", label: "Подписка на канал", stuck: 2 });

  const captcha = stats.steps.find((step) => step.stage === "captcha");
  assert.deepEqual(
    { reached: captcha.reached, stuck: captcha.stuck, passed: captcha.passed, passRate: captcha.passRate },
    { reached: 4, stuck: 1, passed: 3, passRate: 75 },
  );

  assert.equal(stats.drawRows[0].drawId, "d1", "больше всего людей — выше");
  assert.match(stats.drawRows[0].title, /^100\$ · BEEF/);
  assert.equal(stats.drawRows[0].conversion, 25);
  assert.equal(stats.drawRows[1].worst, null, "никто не отвалился");
});

test("only the chosen period is counted", () => {
  const stats = buildFunnelStats({
    store: fakeStore([row("d1", ["opened", "joined"], 2), row("d2", ["opened", "joined"], 20)]),
    draws: DRAWS,
    projects: PROJECTS,
    timezone: "Europe/Moscow",
    period: "7",
    now: NOW,
  });
  assert.equal(stats.total.people, 1);
});

test("a draw that is gone is still listed, by name only", () => {
  const stats = buildFunnelStats({
    store: fakeStore([row("gone", ["opened", "captcha"])]),
    draws: DRAWS,
    projects: PROJECTS,
    timezone: "Europe/Moscow",
    period: "30",
    now: NOW,
  });
  assert.equal(stats.drawRows[0].title, "Розыгрыш удалён");
});

test("an unknown period falls back to thirty days", () => {
  assert.equal(normalizeFunnelPeriod("365"), "30");
  assert.equal(normalizeFunnelPeriod("7"), "7");
});

test("with nothing recorded yet the page still has its numbers", () => {
  const stats = buildFunnelStats({ store: null, draws: [], projects: [], timezone: "Europe/Moscow", period: "30", now: NOW });
  assert.equal(stats.total.people, 0);
  assert.equal(stats.conversion, 0);
  assert.equal(stats.worst, null);
  assert.equal(stats.trackedSince, null);
});

// A page that throws while rendering is only caught by rendering it.
test("the page renders, full and empty, and prints draw names as text", () => {
  const { renderFunnelPage } = require("./admin-dashboard");
  const stats = buildFunnelStats({
    store: fakeStore([row("d1", ["opened", "captcha"]), row("d1", ["opened", "captcha", "channel", "joined"])]),
    draws: [{ ...DRAWS[0], prize: "<img src=x onerror=alert(1)>" }],
    projects: PROJECTS,
    timezone: "Europe/Moscow",
    period: "30",
    now: NOW,
  });
  const html = renderFunnelPage(stats, "Europe/Moscow");
  assert.match(html, /Воронка/);
  assert.match(html, /Капча/);
  assert.ok(!html.includes("<img src=x"), "название розыгрыша вставлено как разметка");

  const empty = renderFunnelPage(
    buildFunnelStats({ store: null, draws: [], projects: [], timezone: "Europe/Moscow", period: "7", now: NOW }),
    "Europe/Moscow",
  );
  assert.match(empty, /никто не открывал участие/);
});
