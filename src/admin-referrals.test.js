const test = require("node:test");
const assert = require("node:assert");
const { buildReferralStats } = require("./admin-referrals");

const PROFILES = {
  users: {
    1: { meta: { username: "inviter_one" } },
    2: { meta: { username: "inviter_two" } },
    9: { meta: { username: "organizer" } },
  },
};

function draw(over = {}) {
  return {
    id: "d1",
    status: "finished",
    ownerId: 9,
    prize: "50$",
    participantIds: [1, 2, 3, 4],
    winnerIds: [3],
    drawReferrals: {},
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

test("invites are counted per person and per organizer", () => {
  const stats = buildReferralStats(
    [
      draw({ drawReferrals: { 1: [3, 4], 2: [5] } }),
      draw({ id: "d2", drawReferrals: { 1: [6] } }),
    ],
    PROFILES,
  );

  assert.equal(stats.totals.invites, 4);
  assert.equal(stats.totals.inviters, 2);
  assert.equal(stats.topInviters[0].identity.handle || stats.topInviters[0].identity.title, "@inviter_one");
  assert.equal(stats.topInviters[0].invites, 3);
  assert.equal(stats.topInviters[0].draws, 2);
  assert.equal(stats.byOrganizer[0].invites, 4);
  assert.equal(stats.byOrganizer[0].perDraw, 2);
});

test("one person invited to two draws is counted once as a person", () => {
  const stats = buildReferralStats(
    [draw({ drawReferrals: { 1: [7] } }), draw({ id: "d2", drawReferrals: { 2: [7] } })],
    PROFILES,
  );
  assert.equal(stats.totals.invites, 2, "two invitations");
  assert.equal(stats.totals.invitedPeople, 1, "but one person");
});

// The page exists to answer this, so it must not flatter the feature: the
// boost is cosmetic, and the win rate has to be reported as it falls.
test("winning while having invited is reported against the ordinary rate", () => {
  const stats = buildReferralStats(
    [
      draw({ participantIds: [1, 2], winnerIds: [1], drawReferrals: { 1: [2] } }),
      draw({ id: "d2", participantIds: [1, 2, 3, 4], winnerIds: [4], drawReferrals: { 1: [3] } }),
    ],
    PROFILES,
  );

  assert.equal(stats.winners.total, 2);
  assert.equal(stats.winners.whoInvited, 1);
  assert.equal(stats.winners.inviterEntries, 2, "the inviter took part in both");
  assert.equal(stats.winners.inviterWins, 1);
  assert.equal(stats.winners.inviterWinRate, 50);
  assert.equal(stats.winners.averageWinRate, 33.3, "two wins across six entries");
  assert.equal(stats.winners.rows[0].prize, "50$");
});

test("draws still running count for invites but not for win rates", () => {
  const stats = buildReferralStats(
    [draw({ status: "active", winnerIds: [], drawReferrals: { 1: [3] } })],
    PROFILES,
  );
  assert.equal(stats.totals.invites, 1);
  assert.equal(stats.winners.total, 0);
  assert.equal(stats.winners.averageWinRate, 0);
});

test("an empty referral list is not a referral", () => {
  const stats = buildReferralStats([draw({ drawReferrals: { 1: [] } })], PROFILES);
  assert.equal(stats.totals.invites, 0);
  assert.equal(stats.totals.drawsWithReferrals, 0);
  assert.equal(stats.byOrganizer.length, 0);
});

test("inviters are grouped by how much they actually brought", () => {
  const referrals = {};
  referrals[1] = [11];
  referrals[2] = Array.from({ length: 12 }, (_, i) => 100 + i);
  const stats = buildReferralStats([draw({ drawReferrals: referrals })], PROFILES);
  const byLabel = Object.fromEntries(stats.distribution.map((row) => [row.label, row.count]));
  assert.equal(byLabel["ровно 1"], 1);
  assert.equal(byLabel["10 и больше"], 1);
  assert.equal(byLabel["от 2 до 4"], 0);
});

test("nothing at all does not throw", () => {
  const stats = buildReferralStats([], {});
  assert.equal(stats.totals.invites, 0);
  assert.equal(stats.totals.sharePercent, 0);
  assert.deepEqual(stats.topInviters, []);
});
