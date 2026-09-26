const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findBrandHomes,
  resolveJoinProjectContext,
  ensureCrossOrganizerProjectProfile,
} = require("./project-profile-bridge");
const { planBrandHomeBackfill, applyBrandHomeBackfill } = require("./brand-home-backfill");

const ME = 1;
const OTHER = 2;
const PROJECTS = [
  { id: "brand_fugu_1", name: "FUGU", templateSlug: "fugu", ownerId: ME },
  { id: "brand_fugu_2", name: "FUGU", templateSlug: "fugu", ownerId: OTHER },
  { id: "brand_beef_2", name: "BEEF", templateSlug: "beef", ownerId: OTHER },
];

function draw(id, projectId, ownerId, participants, fields = {}) {
  const participantMeta = {};
  for (const [userId, at] of Object.entries(participants)) {
    participantMeta[userId] = { updatedAt: at };
  }
  return {
    id,
    projectId,
    ownerId,
    status: "finished",
    participantIds: Object.keys(participants).map(Number),
    participantMeta,
    ...fields,
  };
}

function ctxFor(userId, currentDraw, { profiles = {}, history = [] } = {}) {
  const data = { users: { [userId]: { projects: profiles } } };
  return resolveJoinProjectContext(userId, currentDraw, {
    getUserProjectProfile: (uid, projectId) => data.users[String(uid)]?.projects?.[projectId] || null,
    readUserProjectProfiles: () => data,
    readProjects: () => ({ projects: PROJECTS }),
    readData: () => ({ draws: history }),
    getProjectById: (id) => PROJECTS.find((project) => project.id === id) || null,
    readDrawHistory: () => history,
  });
}

test("a brand's home is the organiser the person first took part with on it", () => {
  const homes = findBrandHomes(
    [
      draw("late", "brand_fugu_2", OTHER, { 7: "2026-09-10T10:00:00Z" }),
      draw("early", "brand_fugu_1", ME, { 7: "2026-08-01T10:00:00Z" }),
      draw("beef", "brand_beef_2", OTHER, { 7: "2026-07-01T10:00:00Z" }),
    ],
    PROJECTS,
  );
  assert.equal(homes.get("7|fugu").ownerId, ME);
  assert.equal(homes.get("7|beef").ownerId, OTHER, "у каждого бренда свой хозяин");
});

// The owner's words: took part with me on FUGU - with anyone else on FUGU he
// is not a referral, and goes in straight away.
test("with another organiser of the same brand the person is not a referral", () => {
  const history = [draw("mine", "brand_fugu_1", ME, { 7: "2026-08-01T10:00:00Z" })];
  const theirs = draw("theirs", "brand_fugu_2", OTHER, {}, { status: "active" });
  const ctx = ctxFor(7, theirs, {
    history,
    profiles: { brand_fugu_1: { trc20Address: "TWALLET", selfReportedNonReferral: true } },
  });
  assert.equal(ctx.isCrossOrganizerNonReferral, true, "не реф у второго организатора");
  assert.equal(ctx.brandHomeOwnerId, ME);
  assert.equal(ctx.canSkipRegistration, true, "пропускает в конкурс сразу");

  const mineAgain = ctxFor(7, draw("mine2", "brand_fugu_1", ME, {}, { status: "active" }), {
    history,
    profiles: { brand_fugu_1: { trc20Address: "TWALLET", referralVerified: true } },
  });
  assert.equal(mineAgain.isCrossOrganizerNonReferral, false, "у своего организатора — как был");
});

test("the brand's first organiser decides even over a referral mark elsewhere", () => {
  const history = [
    draw("mine", "brand_fugu_1", ME, { 7: "2026-08-01T10:00:00Z" }),
    draw("theirs", "brand_fugu_2", OTHER, { 7: "2026-09-01T10:00:00Z" }),
  ];
  const ctx = ctxFor(7, draw("theirs2", "brand_fugu_2", OTHER, {}, { status: "active" }), {
    history,
    profiles: {
      brand_fugu_1: { trc20Address: "TWALLET", selfReportedNonReferral: true },
      brand_fugu_2: { trc20Address: "TWALLET", referralVerified: true, referralOwnerId: OTHER },
    },
  });
  assert.equal(ctx.isCrossOrganizerNonReferral, true);
});

test("without any history a verified referral elsewhere still counts, as before", () => {
  const ctx = ctxFor(7, draw("theirs", "brand_fugu_2", OTHER, {}, { status: "active" }), {
    history: [],
    profiles: { brand_fugu_1: { trc20Address: "TWALLET", referralVerified: true, referralOwnerId: ME } },
  });
  assert.equal(ctx.isCrossOrganizerNonReferral, true);
});

// A draw without wallets used to leave the profile empty: no status at all,
// and the prize went out in full, as to a referral.
test("the not-a-referral status is written even without a wallet", () => {
  const history = [draw("mine", "brand_fugu_1", ME, { 7: "2026-08-01T10:00:00Z" })];
  const theirs = draw("theirs", "brand_fugu_2", OTHER, {}, { status: "active", askWalletOnJoin: false });
  const ctx = ctxFor(7, theirs, { history, profiles: { brand_fugu_1: { referralVerified: true } } });
  const writes = [];
  ensureCrossOrganizerProjectProfile(7, theirs, ctx, (userId, projectId, patch) => writes.push({ projectId, patch }));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].projectId, "brand_fugu_2");
  assert.equal(writes[0].patch.referralVerified, false);
  assert.equal(writes[0].patch.selfReportedNonReferral, true);
  assert.equal(writes[0].patch.crossOrganizerNonReferral, true);
  assert.equal(writes[0].patch.referralOwnerId, ME, "чей это человек");
});

test("old profiles: a referral at a second organiser of the brand is taken back", () => {
  const history = [
    draw("mine", "brand_fugu_1", ME, { 7: "2026-08-01T10:00:00Z", 8: "2026-09-05T10:00:00Z" }),
    draw("theirs", "brand_fugu_2", OTHER, { 7: "2026-09-01T10:00:00Z", 8: "2026-08-20T10:00:00Z" }),
  ];
  const profiles = {
    users: {
      7: { projects: { brand_fugu_1: { referralVerified: true }, brand_fugu_2: { referralVerified: true } } },
      8: { projects: { brand_fugu_1: { referralVerified: true }, brand_fugu_2: { referralVerified: true } } },
    },
  };
  const plan = planBrandHomeBackfill({ profiles, projects: PROJECTS, draws: history });
  assert.deepEqual(
    plan.marks.map((mark) => `${mark.userId}:${mark.projectId}`).sort(),
    ["7:brand_fugu_2", "8:brand_fugu_1"],
    "у каждого остаётся реф у того, с кем он участвовал первым",
  );
  applyBrandHomeBackfill(profiles, plan.marks);
  assert.equal(profiles.users[7].projects.brand_fugu_1.referralVerified, true);
  assert.equal(profiles.users[7].projects.brand_fugu_2.referralVerified, false);
  assert.equal(profiles.users[7].projects.brand_fugu_2.crossOrganizerNonReferral, true);
  assert.equal(planBrandHomeBackfill({ profiles, projects: PROJECTS, draws: history }).marks.length, 0, "второй запуск ничего не трогает");
});

test("someone waiting for a payout at that organiser waits to be corrected", () => {
  const history = [
    draw("mine", "brand_fugu_1", ME, { 7: "2026-08-01T10:00:00Z" }),
    draw("theirs", "brand_fugu_2", OTHER, { 7: "2026-09-01T10:00:00Z" }, {
      prizeType: "money_rub",
      winnerIds: [7],
      winnerNotifications: { 7: { status: "confirmed" } },
    }),
  ];
  const profiles = { users: { 7: { projects: { brand_fugu_1: { referralVerified: true }, brand_fugu_2: { referralVerified: true } } } } };
  const plan = planBrandHomeBackfill({ profiles, projects: PROJECTS, draws: history });
  assert.equal(plan.marks.length, 0);
  assert.deepEqual(plan.deferred, [{ userId: "7", projectId: "brand_fugu_2" }]);
});
