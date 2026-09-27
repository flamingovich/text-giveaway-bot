const test = require("node:test");
const assert = require("node:assert");
const {
  hasCompletedProjectIdStep,
  joinCtxHasCompletedProjectIdStep,
  isProjectRegistrationComplete,
} = require("./project-account-id");
const { resolveJoinProjectContext } = require("./project-profile-bridge");

const BEEF = { id: "brand_beef_1", name: "BEEF", templateSlug: "beef" };
const BEEF_OTHER_OWNER = { id: "brand_beef_2", name: "BEEF", templateSlug: "beef" };
const LUCKYBEAR = { id: "brand_luckybear_1", name: "LuckyBear", templateSlug: "luckybear" };
const WALLET = "TXYZabcdefghijklmnopqrstuvwxyz1234";

function drawFor(project) {
  return { id: `draw_${project.id}`, projectId: project.id, askProjectIdOnJoin: true, ownerId: 1 };
}

function contextFor(userId, draw, projects, userProjects) {
  const profiles = { users: { [userId]: { projects: userProjects } } };
  return resolveJoinProjectContext(userId, draw, {
    getUserProjectProfile: (uid, projectId) => profiles.users[String(uid)]?.projects?.[projectId] || null,
    readUserProjectProfiles: () => profiles,
    readProjects: () => ({ projects }),
    readData: () => ({ draws: [] }),
    getProjectById: (id) => projects.find((project) => project.id === id) || null,
  });
}

// #SLAVA, an e-mail in the LuckyBear step: saved before the id checks got
// stricter, and each one let its owner skip the id step in every draw since.
test("a saved id today's checks refuse no longer counts as the id step done", () => {
  const profile = { projectAccountId: "#SLAVA", projectIdStepCompletedAt: "2026-07-01T10:00:00Z" };
  assert.equal(hasCompletedProjectIdStep(profile, BEEF), false);
  assert.equal(
    hasCompletedProjectIdStep({ projectAccountId: "aleksejromanovic777@gmail.com" }, LUCKYBEAR),
    false,
  );
});

test("a real saved id still counts", () => {
  assert.equal(hasCompletedProjectIdStep({ projectAccountId: "#FJ0UW" }, BEEF), true);
  assert.equal(hasCompletedProjectIdStep({ projectAccountId: "1771050325" }, LUCKYBEAR), true);
});

// "Я не реферал" on the id step saves no id, only when the step was done.
test("the step answered without an id still counts", () => {
  const profile = { projectIdStepCompletedAt: "2026-07-01T10:00:00Z", selfReportedNonReferral: true };
  assert.equal(hasCompletedProjectIdStep(profile, BEEF), true);
});

test("without the project to check against, the answer is what it always was", () => {
  assert.equal(hasCompletedProjectIdStep({ projectAccountId: "#SLAVA" }), true);
  assert.equal(hasCompletedProjectIdStep(null, BEEF), false);
});

test("a junk id does not complete the registration either", () => {
  const draw = drawFor(BEEF);
  assert.equal(isProjectRegistrationComplete({ projectAccountId: "#SLAVA", trc20Address: WALLET }, draw, BEEF), false);
  assert.equal(isProjectRegistrationComplete({ projectAccountId: "#FJ0UW", trc20Address: WALLET }, draw, BEEF), true);
});

test("someone with a junk id in this project is asked for it again", () => {
  const draw = drawFor(BEEF);
  const ctx = contextFor("7", draw, [BEEF], {
    [BEEF.id]: { trc20Address: WALLET, projectAccountId: "#SLAVA", projectIdStepCompletedAt: "2026-07-01T10:00:00Z" },
  });
  assert.equal(ctx.canSkipRegistration, false);
  assert.equal(joinCtxHasCompletedProjectIdStep(ctx, BEEF), false);
});

test("someone with a real id in this project goes straight in", () => {
  const draw = drawFor(BEEF);
  const ctx = contextFor("7", draw, [BEEF], {
    [BEEF.id]: { trc20Address: WALLET, projectAccountId: "#FJ0UW", projectIdStepCompletedAt: "2026-07-01T10:00:00Z" },
  });
  assert.equal(ctx.canSkipRegistration, true);
  assert.equal(joinCtxHasCompletedProjectIdStep(ctx, BEEF), true);
});

// The same brand at another organizer: the id saved there is borrowed here, so
// a junk one must not be borrowed either.
test("a junk id saved at another organizer's copy of the brand is not borrowed", () => {
  const draw = drawFor(BEEF);
  const projects = [BEEF, BEEF_OTHER_OWNER];
  const junk = contextFor("7", draw, projects, {
    [BEEF_OTHER_OWNER.id]: { trc20Address: WALLET, projectAccountId: "#SLAVA", referralVerified: true },
  });
  assert.equal(junk.canSkipRegistration, false);
  assert.equal(joinCtxHasCompletedProjectIdStep(junk, BEEF), false);

  const real = contextFor("7", draw, projects, {
    [BEEF_OTHER_OWNER.id]: { trc20Address: WALLET, projectAccountId: "#FJ0UW", referralVerified: true },
  });
  assert.equal(real.canSkipRegistration, true);
});
