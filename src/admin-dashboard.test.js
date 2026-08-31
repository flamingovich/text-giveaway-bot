const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAdminUserProjectRows,
  buildAdminUserRows,
  sortAdminUserRows,
  filterAdminUserRows,
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

// A page that throws while rendering passes every unit test around it and
// still shows a blank screen; only rendering it catches that.
test("the referrals page renders with real data", () => {
  const { renderReferralsPage } = require("./admin-dashboard");
  const { buildReferralStats } = require("./admin-referrals");
  const stats = buildReferralStats(
    [
      {
        id: "d1",
        status: "finished",
        ownerId: 9,
        prize: "50$",
        participantIds: [1, 2, 3],
        winnerIds: [1],
        drawReferrals: { 1: [2, 3] },
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    { users: { 1: { meta: { username: "alpha" } }, 9: { meta: { username: "org" } } } },
  );

  const html = renderReferralsPage(stats);
  assert.match(html, /Приглашения/);
  assert.match(html, /@alpha/);
  assert.match(html, /на розыгрыш не влияет/, "the page must not repeat the +50% claim");
  assert.ok(html.includes('href="/admin/referrals"'), "the nav links to itself");
});

test("the referrals page renders when there is nothing yet", () => {
  const { renderReferralsPage } = require("./admin-dashboard");
  const { buildReferralStats } = require("./admin-referrals");
  const html = renderReferralsPage(buildReferralStats([], {}));
  assert.match(html, /Приглашения/);
  assert.ok(!html.includes("undefined"));
});

test("the projects page renders with real-shaped data", () => {
  const { renderProjectsPage } = require("./admin-dashboard");
  const { buildProjectStats } = require("./admin-projects");
  const projects = [
    { id: "brand_a_1", name: "Alpha", ownerId: 1 },
    { id: "brand_a_2", name: "Alpha", ownerId: 2 },
  ];
  const stats = buildProjectStats(
    [
      { id: "d1", projectId: "brand_a_1", ownerId: 1, participantIds: [10, 11] },
      { id: "d2", projectId: "brand_a_2", ownerId: 2, participantIds: [11, 12] },
    ],
    projects,
    {
      users: {
        1: { meta: { username: "one" } },
        2: { meta: { username: "two" } },
        11: { meta: {}, projects: { brand_a_1: { firstTouchOwnerId: 1 } } },
      },
    },
  );

  const html = renderProjectsPage(stats);
  assert.match(html, /Проекты/);
  assert.match(html, /@one/);
  assert.ok(html.includes('href="/admin/projects"'), "меню ссылается на себя");
  assert.match(html, /не складываются/, "предупреждение о пересечении обязано быть на виду");
  assert.ok(!html.includes("undefined"));
});

// Grouped, never stacked: stacking unique people would claim a total that does
// not exist, since the same person appears under two organisers.
test("the projects chart never stacks unique people", () => {
  const { renderProjectsPage } = require("./admin-dashboard");
  const { buildProjectStats } = require("./admin-projects");
  const html = renderProjectsPage(
    buildProjectStats(
      [{ id: "d1", projectId: "p", ownerId: 1, participantIds: [1] }],
      [{ id: "p", name: "P", ownerId: 1 }],
      { users: {} },
    ),
  );
  assert.ok(!/stacked:\s*true/.test(html), "столбцы не должны складываться");
});

test("the projects page renders when there is nothing yet", () => {
  const { renderProjectsPage } = require("./admin-dashboard");
  const { buildProjectStats } = require("./admin-projects");
  const html = renderProjectsPage(buildProjectStats([], [], {}));
  assert.match(html, /Проекты/);
  assert.ok(!html.includes("undefined"));
});
