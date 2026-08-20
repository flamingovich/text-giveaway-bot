const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDashboardStats, resolvePeriod, firstSeenDay } = require("./admin-dashboard-stats");

const TZ = "Europe/Moscow";

function deps({ draws = [], archived = [], profiles = { users: {} }, projects = [] } = {}) {
  return {
    timezone: TZ,
    readData: () => ({ draws }),
    readArchivedDraws: () => ({ draws: archived }),
    readUserProjectProfiles: () => profiles,
    readProjects: () => ({ projects }),
  };
}

test("the three headline numbers are users, participants and draws", () => {
  const stats = buildDashboardStats(
    deps({
      draws: [{ id: "d1", status: "active", participantIds: [1, 2], createdAt: "2026-08-01" }],
      archived: [{ id: "d2", status: "finished", participantIds: [2, 3], winnerIds: [3], createdAt: "2026-07-01" }],
      profiles: { users: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} } },
    }),
    { period: "all" },
  );

  assert.equal(stats.totals.users, 5, "everyone the bot knows");
  assert.equal(stats.totals.participants, 3, "only those who entered at least one draw");
  assert.equal(stats.totals.draws, 2, "archive included");
  assert.equal(stats.totals.winners, 1);
});

test("a person entering twice counts as one participant", () => {
  const stats = buildDashboardStats(
    deps({
      draws: [
        { id: "d1", participantIds: [7], createdAt: "2026-08-01" },
        { id: "d2", participantIds: [7], createdAt: "2026-08-02" },
      ],
      profiles: { users: { 7: {} } },
    }),
    { period: "all" },
  );

  assert.equal(stats.totals.participants, 1);
});

test("a user with only a meta record still lands on the growth curve", () => {
  const day = firstSeenDay({ meta: { updatedAt: "2026-07-04T10:00:00.000Z" } }, TZ);
  assert.equal(day, "2026-07-04");
});

test("a project date wins over the meta record, which moves as they write", () => {
  const day = firstSeenDay(
    {
      meta: { updatedAt: "2026-08-20T10:00:00.000Z" },
      projects: { p: { referralCheckedAt: "2026-06-01T10:00:00.000Z" } },
    },
    TZ,
  );
  assert.equal(day, "2026-06-01");
});

test("first seen is the earliest trace a person left, not the latest", () => {
  const day = firstSeenDay(
    {
      projects: {
        a: { referralCheckedAt: "2026-06-15T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" },
        b: { nonReferralMarkedAt: "2026-05-01T10:00:00.000Z" },
      },
    },
    TZ,
  );

  assert.equal(day, "2026-05-01");
});

test("growth accumulates and never goes down", () => {
  const stats = buildDashboardStats(
    deps({
      profiles: {
        users: {
          1: { projects: { p: { updatedAt: "2026-08-01T00:00:00.000Z" } } },
          2: { projects: { p: { updatedAt: "2026-08-02T00:00:00.000Z" } } },
          3: { projects: { p: { updatedAt: "2026-08-02T00:00:00.000Z" } } },
        },
      },
    }),
    { period: "all" },
  );

  const totals = stats.series.totalUsers;
  for (let i = 1; i < totals.length; i += 1) {
    assert.ok(totals[i] >= totals[i - 1], "a cumulative line cannot fall");
  }
  assert.equal(totals[totals.length - 1], 3);
});

test("people who arrived before the window are carried into the running total", () => {
  const stats = buildDashboardStats(
    deps({
      profiles: {
        users: {
          old: { projects: { p: { updatedAt: "2020-01-01T00:00:00.000Z" } } },
        },
      },
    }),
    { period: "7" },
  );

  assert.equal(stats.series.totalUsers[0], 1, "the window starts from what already existed");
  assert.equal(stats.series.newUsers[0], 0, "but they are not counted as new inside it");
});

test("the period selector picks a known window and falls back sanely", () => {
  assert.equal(resolvePeriod("7").days, 7);
  assert.equal(resolvePeriod("all").days, null);
  assert.equal(resolvePeriod("нет такого").id, "30");
});

test("breakdowns group draws by brand and prize", () => {
  const stats = buildDashboardStats(
    deps({
      draws: [
        { id: "a", projectId: "p1", prizeType: "money_usd", status: "finished", createdAt: "2026-08-01" },
        { id: "b", projectId: "p1", prizeType: "money_usd", status: "finished", createdAt: "2026-08-01" },
        { id: "c", projectId: "p2", prizeType: "money_rub", status: "active", createdAt: "2026-08-01" },
        { id: "d", prizeType: "custom", status: "active", createdAt: "2026-08-01" },
      ],
      projects: [
        { id: "p1", name: "Pokerdom" },
        { id: "p2", name: "BEEF" },
      ],
    }),
    { period: "all" },
  );

  assert.deepEqual(stats.breakdowns.brands[0], ["Pokerdom", 2]);
  assert.ok(stats.breakdowns.brands.some(([name]) => name === "Без проекта"));
  assert.deepEqual(stats.breakdowns.prizeTypes[0], ["Доллары", 2]);
  assert.equal(stats.breakdowns.status.active, 2);
});

test("the organizer filter narrows the whole page", () => {
  const stats = buildDashboardStats(
    deps({
      draws: [
        { id: "a", ownerId: 1, participantIds: [10], createdAt: "2026-08-01" },
        { id: "b", ownerId: 2, participantIds: [20], createdAt: "2026-08-01" },
      ],
      profiles: { users: { 10: {}, 20: {} } },
    }),
    { ownerFilter: "1", period: "all" },
  );

  assert.equal(stats.totals.draws, 1);
  assert.equal(stats.totals.participants, 1);
});

test("an empty database renders zeros rather than throwing", () => {
  const stats = buildDashboardStats(deps({}), { period: "30" });
  assert.equal(stats.totals.users, 0);
  assert.equal(stats.totals.draws, 0);
  assert.equal(stats.series.labels.length, 30);
});

test("the growth line ends on the headline number, not below it", () => {
  const stats = buildDashboardStats(
    deps({
      profiles: {
        users: {
          dated: { meta: { updatedAt: "2026-08-19T00:00:00.000Z" } },
          undated: {},
          alsoUndated: { projects: {} },
        },
      },
    }),
    { period: "7" },
  );

  const line = stats.series.totalUsers;
  assert.equal(
    line[line.length - 1],
    stats.totals.users,
    "a curve that ends below the counter contradicts it",
  );
});

test("a delta compares the window with the one before it", () => {
  const now = require("luxon").DateTime.now().setZone(TZ);
  const inWindow = now.minus({ days: 2 }).toISO();
  const beforeWindow = now.minus({ days: 40 }).toISO();

  const stats = buildDashboardStats(
    deps({
      profiles: {
        users: {
          a: { meta: { updatedAt: inWindow } },
          b: { meta: { updatedAt: inWindow } },
          c: { meta: { updatedAt: beforeWindow } },
        },
      },
    }),
    { period: "30" },
  );

  assert.equal(stats.deltas.users.current, 2);
  assert.equal(stats.deltas.users.previous, 1);
  assert.equal(stats.deltas.users.percent, 100);
  assert.equal(stats.deltas.users.direction, "up");
});

test("no earlier window means no delta rather than a made up one", () => {
  const stats = buildDashboardStats(
    deps({
      profiles: {
        users: { a: { meta: { updatedAt: require("luxon").DateTime.now().setZone(TZ).toISO() } } },
      },
    }),
    { period: "30" },
  );

  assert.equal(stats.deltas.users, null);
});
