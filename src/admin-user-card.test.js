const test = require("node:test");
const assert = require("node:assert/strict");
const { buildUserCard, describeWinnerOutcome } = require("./admin-user-card");

function deps(active, archived = [], profiles = { users: {} }, projects = []) {
  return {
    readData: () => ({ draws: active }),
    readArchivedDraws: () => ({ draws: archived }),
    readUserProjectProfiles: () => profiles,
    readProjects: () => ({ projects }),
  };
}

test("gathers draws from the archive as well as the live document", () => {
  const card = buildUserCard(
    deps(
      [{ id: "live", participantIds: [7], createdAt: "2026-08-01T00:00:00.000Z" }],
      [{ id: "old", participantIds: [7], winnerIds: [7], createdAt: "2026-06-01T00:00:00.000Z" }],
    ),
    7,
  );

  assert.equal(card.totals.participations, 2);
  assert.equal(card.totals.wins, 1);
  assert.deepEqual(card.draws.map((draw) => draw.id), ["live", "old"], "newest first");
});

test("a winner with no notification record is called out, not shown as fine", () => {
  const card = buildUserCard(
    deps([{ id: "d1", participantIds: [7], winnerIds: [7], winnerNotifications: {} }]),
    7,
  );

  assert.equal(card.draws[0].outcome.key, "missing");
  assert.equal(card.draws[0].outcome.tone, "danger");
});

test("payment beats every other winner status", () => {
  assert.equal(describeWinnerOutcome({ status: "expired", paidAt: "2026-08-01" }).key, "paid");
  assert.equal(describeWinnerOutcome({ status: "confirmed" }).key, "confirmed");
  assert.equal(describeWinnerOutcome({ status: "forfeited" }).tone, "danger");
});

test("counts a confirmed but unpaid win as awaiting payout", () => {
  const card = buildUserCard(
    deps([
      {
        id: "d1",
        prizeType: "money_usd",
        prizeAmountUsd: 50,
        participantIds: [7],
        winnerIds: [7],
        winnerNotifications: { 7: { status: "confirmed" } },
      },
    ]),
    7,
  );

  assert.equal(card.totals.awaitingPayout, 1);
  assert.equal(card.totals.winningsUsd, 50);
  assert.equal(card.totals.paidUsd, 0);
});

test("a paid win moves into payouts", () => {
  const card = buildUserCard(
    deps([
      {
        id: "d1",
        prizeType: "money_usd",
        prizeAmountUsd: 50,
        participantIds: [7],
        winnerIds: [7],
        winnerNotifications: { 7: { status: "confirmed", paidAt: "2026-08-01" } },
      },
    ]),
    7,
  );

  assert.equal(card.totals.paidUsd, 50);
  assert.equal(card.totals.awaitingPayout, 0);
});

test("collects wallets from the profile and from payouts", () => {
  const card = buildUserCard(
    deps(
      [
        {
          id: "d1",
          participantIds: [7],
          winnerIds: [7],
          winnerNotifications: { 7: { status: "confirmed", trc20Address: "TPayout" } },
        },
      ],
      [],
      { users: { 7: { projects: { p1: { trc20Address: "TProfile" } } } } },
    ),
    7,
  );

  assert.deepEqual(card.wallets.map((wallet) => wallet.address).sort(), ["TPayout", "TProfile"]);
});

test("an unknown project is called a former one, not a deleted one", () => {
  const card = buildUserCard(deps([{ id: "d1", projectId: "gone", participantIds: [7] }]), 7);
  assert.equal(card.draws[0].projectName, "Прежний проект");
});

test("a pre-brand Pokerdom draw shows as Pokerdom, not as deleted", () => {
  const card = buildUserCard(
    deps(
      [{ id: "d1", projectId: "project_1780118192579_6053", participantIds: [7] }],
      [],
      { users: {} },
      [{ id: "brand_pokerdom_7946967720", name: "Pokerdom", ownerId: 7946967720 }],
    ),
    7,
  );

  assert.equal(card.draws[0].projectName, "Pokerdom");
  assert.equal(card.draws[0].projectId, "brand_pokerdom_7946967720");
});

test("the old and the new Pokerdom binding become one line on the card", () => {
  const card = buildUserCard(
    deps(
      [],
      [],
      {
        users: {
          7: {
            projects: {
              project_1780118192579_6053: { trc20Address: "TOld", referralVerified: true },
              brand_pokerdom_7946967720: { projectAccountId: "#42" },
            },
          },
        },
      },
      [{ id: "brand_pokerdom_7946967720", name: "Pokerdom", ownerId: 7946967720 }],
    ),
    7,
  );

  assert.equal(card.projects.length, 1);
  assert.equal(card.projects[0].projectName, "Pokerdom");
  assert.equal(card.projects[0].refStatus, "ref");
  assert.equal(card.projects[0].wallet, "TOld");
  assert.equal(card.projects[0].accountId, "#42");
});

test("mega giveaways without a project are labelled, not dropped", () => {
  const card = buildUserCard(deps([{ id: "mega", kind: "mega", participantIds: [7] }]), 7);
  assert.equal(card.draws.length, 1);
  assert.equal(card.draws[0].projectName, "Без проекта");
});

test("an unknown user renders as empty rather than throwing", () => {
  const card = buildUserCard(deps([]), 999);
  assert.equal(card.known, false);
  assert.equal(card.label, "ID 999");
  assert.deepEqual(card.draws, []);
});
