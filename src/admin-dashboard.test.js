const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAdminUserProjectRows,
  buildAdminUserRows,
  sortAdminUserRows,
  filterAdminUserRows,
  buildStats,
} = require("./admin-dashboard");
const { buildUserProjectActivityIndex } = require("./admin-user-stats");

function deps({ draws = [], archived = [], profiles = { users: {} }, projects = [] } = {}) {
  return {
    timezone: "Europe/Moscow",
    readData: () => ({ draws }),
    readArchivedDraws: () => ({ draws: archived }),
    readUserProjectProfiles: () => profiles,
    readProjects: () => ({ projects }),
    getUserProfileBundle: () => ({ meta: {}, projectData: {} }),
    getDrawParticipantMeta: () => ({}),
    collectDrawParticipantSignals: () => ({ byWallet: new Map(), globalWalletOwners: new Map() }),
    getWinnerAntiFraud: () => ({ labels: [], hasFraudFlag: false }),
    getWinnerPayoutAmount: () => 0,
    isMoneyPrizeType: () => false,
    normalizeWalletAddress: (v) => String(v || ""),
    evaluateIpFraud: () => ({ shouldFlag: false, linkedUserIds: [] }),
    listProjectWalletAddresses: () => [],
    formatRubAmount: (v) => `${v}R`,
    formatUsdAmount: (v) => `${v}$`,
  };
}

const PROFILES = {
  users: { 7: { meta: { username: "seven", first_name: "Семь" }, projects: { p1: { referralVerified: true } } } },
};
const PROJECTS = [{ id: "p1", name: "Pokerdom", ownerId: 1 }];

test("every project on a row carries its id, so the cell can tell real ones apart", () => {
  const d = deps({
    draws: [{ id: "d1", projectId: "p1", participantIds: [7] }],
    profiles: PROFILES,
    projects: PROJECTS,
  });
  const index = buildUserProjectActivityIndex(d, PROFILES, String);
  const [row] = buildAdminUserRows(d, index);

  assert.ok(row.projects.length > 0);
  for (const project of row.projects) {
    assert.ok("projectId" in project, "the cell filters on projectId");
  }
  assert.equal(row.projects[0].projectId, "p1");
});

test("the name shown is separate from the id printed under it", () => {
  const d = deps({ profiles: PROFILES, projects: PROJECTS });
  const [row] = buildAdminUserProjectRows(d);

  assert.equal(row.userName, "Семь (@seven)");
  assert.ok(!row.userName.includes("7"), "the id is not repeated inside the name");
});

test("the default order puts the people who took part first", () => {
  const rows = [
    { userId: "a", userName: "Аня", participations: 0, wins: 0 },
    { userId: "b", userName: "Боря", participations: 12, wins: 1 },
    { userId: "c", userName: "Вова", participations: 3, wins: 0 },
  ];

  assert.deepEqual(
    sortAdminUserRows(rows, "", "desc").map((row) => row.userId),
    ["b", "c", "a"],
  );
});

test("the activity filter hides users who never entered a draw", () => {
  const rows = [
    { userId: "a", participations: 0, wins: 0, paidRub: 0, paidUsd: 0, projects: [], hasFraud: false },
    { userId: "b", participations: 5, wins: 0, paidRub: 0, paidUsd: 0, projects: [], hasFraud: false },
    { userId: "c", participations: 5, wins: 2, paidRub: 0, paidUsd: 0, projects: [], hasFraud: false },
  ];

  assert.deepEqual(
    filterAdminUserRows(rows, { activity: "participated" }).map((r) => r.userId),
    ["b", "c"],
  );
  assert.deepEqual(filterAdminUserRows(rows, { activity: "won" }).map((r) => r.userId), ["c"]);
  assert.deepEqual(filterAdminUserRows(rows, { activity: "unpaid" }).map((r) => r.userId), ["c"]);
});

test("dashboard totals count the archive too", () => {
  const stats = buildStats(
    deps({
      draws: [{ id: "live", status: "active", participantIds: [1], createdAt: "2026-08-01" }],
      archived: [
        { id: "old", status: "finished", participantIds: [1, 2], winnerIds: [2], createdAt: "2026-06-01" },
      ],
      profiles: PROFILES,
      projects: PROJECTS,
    }),
    "",
  );

  assert.equal(stats.totals.draws, 2);
  assert.equal(stats.totals.uniqueParticipants, 2);
  assert.equal(stats.totals.winners, 1);
});

test("the organizer filter applies to the organizers table as well", () => {
  const stats = buildStats(
    deps({
      draws: [
        { id: "a", ownerId: 1, status: "finished", participantIds: [], createdAt: "2026-08-01" },
        { id: "b", ownerId: 2, status: "finished", participantIds: [], createdAt: "2026-08-01" },
      ],
      profiles: PROFILES,
      projects: PROJECTS,
    }),
    "1",
  );

  assert.equal(stats.totals.draws, 1);
  assert.deepEqual(stats.organizerRows.map((row) => row.id), ["1"]);
});
