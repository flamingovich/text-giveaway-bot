const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildUserProjectActivityIndex,
  getUserProjectActivity,
  listActivityKeys,
} = require("./admin-user-stats");

function stubDeps(active, archived = []) {
  return {
    readData: () => ({ draws: active }),
    readArchivedDraws: () => ({ draws: archived }),
    getUserProfileBundle: () => ({ meta: {}, projectData: {} }),
    getDrawParticipantMeta: () => ({}),
    collectDrawParticipantSignals: () => ({ byWallet: new Map(), globalWalletOwners: new Map() }),
    getWinnerAntiFraud: () => ({ labels: [], hasFraudFlag: false }),
    getWinnerPayoutAmount: () => 100,
    isMoneyPrizeType: (type) => type === "money_usd",
    normalizeWalletAddress: (value) => String(value || ""),
    evaluateIpFraud: () => ({ shouldFlag: false, linkedUserIds: [] }),
    listProjectWalletAddresses: () => [],
    formatRubAmount: (value) => `${value}R`,
    formatUsdAmount: (value) => `${value}$`,
  };
}

const profiles = { users: {} };
const label = (id) => String(id);

test("counts activity from archived draws, not only live ones", () => {
  const index = buildUserProjectActivityIndex(
    stubDeps(
      [{ id: "live", projectId: "p1", participantIds: [7], winnerIds: [] }],
      [
        { id: "old_1", projectId: "p1", participantIds: [7], winnerIds: [7] },
        { id: "old_2", projectId: "p1", participantIds: [7], winnerIds: [] },
      ],
    ),
    profiles,
    label,
  );

  const activity = getUserProjectActivity(index, "7", "p1");
  assert.equal(activity.participations, 3);
  assert.equal(activity.wins, 1);
});

test("counts mega giveaways, which carry no project id", () => {
  const index = buildUserProjectActivityIndex(
    stubDeps([{ id: "mega", kind: "mega", participantIds: [7, 8], winnerIds: [8] }]),
    profiles,
    label,
  );

  assert.equal(getUserProjectActivity(index, "7", "").participations, 1);
  assert.equal(getUserProjectActivity(index, "8", "").wins, 1);
});

test("counts a draw held in both documents once", () => {
  const draw = { id: "d1", projectId: "p1", participantIds: [7], winnerIds: [7] };
  const index = buildUserProjectActivityIndex(
    stubDeps([draw], [{ ...draw, status: "finished" }]),
    profiles,
    label,
  );

  assert.equal(getUserProjectActivity(index, "7", "p1").participations, 1);
  assert.equal(getUserProjectActivity(index, "7", "p1").wins, 1);
});

test("reports its keys so callers can cover users with no profile entry", () => {
  const index = buildUserProjectActivityIndex(
    stubDeps([{ id: "d1", projectId: "p1", participantIds: [7], winnerIds: [] }]),
    profiles,
    label,
  );

  assert.deepEqual(listActivityKeys(index), [{ userId: "7", projectId: "p1" }]);
});

test("a winner of a money draw accrues winnings, and payouts only once paid", () => {
  const base = {
    id: "d1",
    projectId: "p1",
    prizeType: "money_usd",
    participantIds: [7],
    winnerIds: [7],
  };

  const unpaid = buildUserProjectActivityIndex(stubDeps([base]), profiles, label);
  assert.equal(getUserProjectActivity(unpaid, "7", "p1").winningsUsd, 100);
  assert.equal(getUserProjectActivity(unpaid, "7", "p1").paidUsd, 0);

  const paid = buildUserProjectActivityIndex(
    stubDeps([{ ...base, winnerNotifications: { 7: { paidAt: "2026-08-01T00:00:00.000Z" } } }]),
    profiles,
    label,
  );
  assert.equal(getUserProjectActivity(paid, "7", "p1").paidUsd, 100);
});
