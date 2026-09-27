const test = require("node:test");
const assert = require("node:assert");
const {
  isWinSettled,
  planPokerdomReferralBackfill,
  applyPokerdomReferralBackfill,
} = require("./pokerdom-referral-backfill");

const POKERDOM = { id: "brand_pokerdom_1", name: "Pokerdom", templateSlug: "pokerdom" };
const BEEF = { id: "brand_beef_1", name: "BEEF", templateSlug: "beef" };
const PROJECTS = [POKERDOM, BEEF];

function pokerdomId(iso) {
  return Math.floor(Date.parse(iso) / 1000).toString(16).padStart(8, "0") + "e81e6a8743d0d7e2";
}

const OLD_ACCOUNT = pokerdomId("2025-11-10T12:00:00Z");
const NEW_ACCOUNT = pokerdomId("2026-07-10T12:00:00Z");

function profiles(users) {
  return { users };
}

function win(userId, notify, fields = {}) {
  return {
    id: `win_${userId}`,
    status: "finished",
    projectId: POKERDOM.id,
    prizeType: "money_rub",
    winnerIds: [Number(userId)],
    winnerNotifications: notify ? { [userId]: notify } : {},
    ...fields,
  };
}

test("a referral whose Pokerdom account predates 1 June is marked, a newer one is not", () => {
  const plan = planPokerdomReferralBackfill({
    profiles: profiles({
      1: { projects: { [POKERDOM.id]: { projectAccountId: OLD_ACCOUNT, referralVerified: true } } },
      2: { projects: { [POKERDOM.id]: { projectAccountId: NEW_ACCOUNT, referralVerified: true } } },
    }),
    projects: PROJECTS,
  });
  assert.deepEqual(plan.marks.map((mark) => mark.userId), ["1"]);
  assert.equal(plan.marks[0].createdAt.toISOString(), "2025-11-10T12:00:00.000Z");
});

test("other brands and people already marked are left alone", () => {
  const plan = planPokerdomReferralBackfill({
    profiles: profiles({
      1: { projects: { [BEEF.id]: { projectAccountId: OLD_ACCOUNT, referralVerified: true } } },
      2: { projects: { [POKERDOM.id]: { projectAccountId: OLD_ACCOUNT, selfReportedNonReferral: true } } },
      3: { projects: { [POKERDOM.id]: { referralVerified: true } } },
    }),
    projects: PROJECTS,
  });
  assert.deepEqual(plan.marks, []);
});

// The panel works the payout out from today's profile; the win message said
// the full prize. Marking now would halve a prize already won.
test("someone waiting for a Pokerdom payout waits to be marked", () => {
  const plan = planPokerdomReferralBackfill({
    profiles: profiles({ 1: { projects: { [POKERDOM.id]: { projectAccountId: OLD_ACCOUNT, referralVerified: true } } } }),
    projects: PROJECTS,
    draws: [win("1", { status: "confirmed" })],
  });
  assert.deepEqual(plan.marks, []);
  assert.deepEqual(plan.deferred, [{ userId: "1", projectId: POKERDOM.id }]);
});

test("once the win is settled the person is marked", () => {
  for (const notify of [
    { status: "confirmed", paidAt: "2026-09-01T10:00:00Z" },
    { status: "confirmed", paymentDeniedAt: "2026-09-01T10:00:00Z" },
    { status: "forfeited" },
    { status: "expired" },
    { status: "pending", antiFraudFlag: true },
  ]) {
    const plan = planPokerdomReferralBackfill({
      profiles: profiles({ 1: { projects: { [POKERDOM.id]: { projectAccountId: OLD_ACCOUNT } } } }),
      projects: PROJECTS,
      draws: [win("1", notify)],
    });
    assert.equal(plan.marks.length, 1, JSON.stringify(notify));
  }
});

test("a win with no payout to halve does not hold the marking back", () => {
  const plan = planPokerdomReferralBackfill({
    profiles: profiles({ 1: { projects: { [POKERDOM.id]: { projectAccountId: OLD_ACCOUNT } } } }),
    projects: PROJECTS,
    draws: [win("1", { status: "confirmed" }, { prizeType: "item" }), win("1", { status: "confirmed" }, { projectId: BEEF.id })],
  });
  assert.equal(plan.marks.length, 1);
});

test("a pending confirmation that ran out of time counts as settled", () => {
  assert.equal(isWinSettled({ status: "pending" }, {}, () => true), true);
  assert.equal(isWinSettled({ status: "pending" }, {}, () => false), false);
  assert.equal(isWinSettled(null, {}, () => true), false, "без записи о победе приз считается должным");
});

test("marking makes the profile a non-referral with halved prizes and records why", () => {
  const data = profiles({ 1: { projects: { [POKERDOM.id]: { projectAccountId: OLD_ACCOUNT, referralVerified: true, referralOwnerId: 55 } } } });
  const plan = planPokerdomReferralBackfill({ profiles: data, projects: PROJECTS });
  const applied = applyPokerdomReferralBackfill(data, plan.marks, new Date("2026-09-27T00:00:00Z"));
  const projectData = data.users[1].projects[POKERDOM.id];
  assert.equal(applied, 1);
  assert.equal(projectData.referralVerified, false);
  assert.equal(projectData.selfReportedNonReferral, true);
  assert.equal(projectData.referralOwnerId, null);
  assert.equal(projectData.projectAccountPredatesReferrals, true);
  assert.equal(projectData.projectAccountCreatedAt, "2025-11-10T12:00:00.000Z");
  assert.equal(projectData.nonReferralMarkedAt, "2026-09-27T00:00:00.000Z");

  const again = planPokerdomReferralBackfill({ profiles: data, projects: PROJECTS });
  assert.equal(again.marks.length, 0, "второй запуск ничего не трогает");
});
