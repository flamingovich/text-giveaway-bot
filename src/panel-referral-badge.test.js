const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getDrawOwnerId,
  listUserBrandProjectEntries,
  resolveReferralOwnerForBrand,
} = require("./project-profile-bridge");
const { createRenderReads, resolveWinnerReferralBadge } = require("./panel-referral-badge");

const OWNER = 100;
const OTHER = 200;

const PROJECTS = {
  projects: [
    { id: "brand_pokerdom_100", name: "Pokerdom", ownerId: OWNER },
    // Another organizer's copy of the same brand, spelled differently.
    { id: "brand_pokerdom_200", name: "  POKERDOM ", ownerId: OTHER },
    { id: "brand_beef_100", name: "BEEF", ownerId: OWNER },
  ],
};

const DATA = {
  draws: [
    { id: "d1", projectId: "brand_pokerdom_100", ownerId: OWNER, participantIds: [1, 2, 9], createdAt: "2026-08-01T00:00:00Z" },
    { id: "d2", projectId: "brand_pokerdom_200", ownerId: OTHER, participantIds: ["2", 11], createdAt: "2026-07-01T00:00:00Z" },
    // Owner known only from createdBy.
    { id: "d3", projectId: "brand_pokerdom_200", createdBy: OTHER, participantIds: [12], createdAt: "2026-06-01T00:00:00Z" },
    { id: "d4", projectId: "brand_beef_100", ownerId: OWNER, participantIds: [13], createdAt: "2026-05-01T00:00:00Z" },
    // Earlier draw of the same project by another owner: the earliest one decides.
    { id: "d5", projectId: "brand_pokerdom_100", ownerId: OTHER, participantIds: [14], publishAt: "2026-01-01T00:00:00Z" },
    { id: "d6", projectId: "brand_pokerdom_100", ownerId: OWNER, participantIds: [14], createdAt: "2026-02-01T00:00:00Z" },
  ],
};

const PROFILES = {
  users: {
    1: { meta: { username: "one" }, projects: { brand_pokerdom_100: { referralVerified: true } } },
    // Verified with the other organizer, listed first.
    2: {
      projects: {
        brand_pokerdom_200: { referralVerified: true },
        brand_pokerdom_100: {},
      },
    },
    3: { projects: { brand_pokerdom_100: { selfReportedNonReferral: true } } },
    // Unverified, but the other organizer is written down as the referrer.
    4: { projects: { brand_pokerdom_200: { referralOwnerId: "200" }, brand_pokerdom_100: {} } },
    5: { projects: { brand_pokerdom_100: { referralOwnerId: OWNER, selfReportedNonReferral: true } } },
    // 6 has no profile at all.
    8: { projects: { brand_pokerdom_100: { referralOwnerId: OTHER } } },
    9: { projects: { brand_pokerdom_100: { referralVerified: true } } },
    // A profile for a project that no longer exists is not a brand entry.
    10: { projects: { brand_gone_200: { referralOwnerId: OTHER }, brand_pokerdom_100: {} } },
    11: { projects: { brand_pokerdom_200: { referralVerified: true } } },
    12: { projects: { brand_pokerdom_200: { referralVerified: true } } },
    // Another brand's referral says nothing about this one.
    13: { projects: { brand_beef_100: { referralOwnerId: OTHER }, brand_pokerdom_100: {} } },
    14: { projects: { brand_pokerdom_100: { referralVerified: true } } },
    15: { meta: { username: "ghost" } },
    [OTHER]: { meta: { username: "rival" } },
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const findProject = (id) => PROJECTS.projects.find((project) => project.id === id) || null;

const DRAW_BY_OWNER = { id: "live", projectId: "brand_pokerdom_100", ownerId: OWNER };
const DRAW_BY_CREATOR = { id: "live2", projectId: "brand_pokerdom_100", createdBy: OTHER };
const DRAW_WITHOUT_PROJECT = { id: "live3", projectId: "", ownerId: OWNER };
const DRAW_OF_DELETED_PROJECT = { id: "live4", projectId: "brand_gone_100", ownerId: OWNER };
const DRAWS = [DRAW_BY_OWNER, DRAW_BY_CREATOR, DRAW_WITHOUT_PROJECT, DRAW_OF_DELETED_PROJECT];
const WINNERS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, OTHER];

function countingReaders(sources = { profiles: PROFILES, projects: PROJECTS, data: DATA }) {
  const calls = { profiles: 0, projects: 0, data: 0 };
  const readers = {};
  for (const name of Object.keys(calls)) {
    // Fresh parse on every call, as the storage readers do.
    readers[name] = () => {
      calls[name] += 1;
      return clone(sources[name]);
    };
  }
  return { calls, readers };
}

// The badge as it was worked out before: every card parsed the documents itself.
function previousBadgeKind(winnerId, draw, userProfiles, readers, isUnregistered) {
  if (isUnregistered) {
    return { kind: "unregistered", referralOwnerId: null };
  }
  const projectData = userProfiles.users?.[String(winnerId)]?.projects?.[draw.projectId] || {};
  const drawOwnerId = getDrawOwnerId(draw);
  const project = draw.projectId ? findProject(draw.projectId) : null;
  let referralOwnerId = null;
  if (project?.name) {
    const brandEntries = listUserBrandProjectEntries(winnerId, project.name, readers.profiles, readers.projects);
    referralOwnerId = resolveReferralOwnerForBrand(winnerId, brandEntries, readers.data);
  }
  if (referralOwnerId == null && projectData.referralOwnerId != null) {
    referralOwnerId = Number(projectData.referralOwnerId);
  }
  if (referralOwnerId && drawOwnerId && referralOwnerId !== drawOwnerId) {
    return { kind: "foreign", referralOwnerId };
  }
  if (projectData.selfReportedNonReferral) {
    return { kind: "non-referral", referralOwnerId };
  }
  return { kind: "referral", referralOwnerId };
}

function badgeFor(winnerId, draw = DRAW_BY_OWNER, options = {}) {
  const userProfiles = options.userProfiles || clone(PROFILES);
  const reads = options.reads || createRenderReads({ projects: () => clone(PROJECTS), data: () => clone(DATA) });
  return resolveWinnerReferralBadge({
    winnerId,
    draw,
    project: draw.projectId ? findProject(draw.projectId) : null,
    projectData: userProfiles.users?.[String(winnerId)]?.projects?.[draw.projectId],
    userProfiles,
    reads,
    isUnregistered: Boolean(options.isUnregistered),
  });
}

test("createRenderReads: reads nothing until asked", () => {
  const { calls, readers } = countingReaders();
  createRenderReads(readers);
  assert.deepEqual(calls, { profiles: 0, projects: 0, data: 0 });
});

test("createRenderReads: each document is read once however often it is asked for", () => {
  const { calls, readers } = countingReaders();
  const reads = createRenderReads(readers);
  const first = reads.data();
  for (let i = 0; i < 50; i += 1) {
    assert.equal(reads.data(), first);
    reads.projects();
  }
  assert.deepEqual(calls, { profiles: 0, projects: 1, data: 1 });
});

test("createRenderReads: a document that reads as nothing is still read once", () => {
  let calls = 0;
  const reads = createRenderReads({ empty: () => { calls += 1; return null; } });
  assert.equal(reads.empty(), null);
  assert.equal(reads.empty(), null);
  assert.equal(calls, 1);
});

test("createRenderReads: a failed read is not remembered", () => {
  let calls = 0;
  const reads = createRenderReads({
    flaky: () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("busy");
      }
      return { ok: true };
    },
  });
  assert.throws(() => reads.flaky(), /busy/);
  assert.deepEqual(reads.flaky(), { ok: true });
  assert.deepEqual(reads.flaky(), { ok: true });
  assert.equal(calls, 2);
});

test("createRenderReads: the next page reads afresh and sees what changed", () => {
  const source = { draws: [{ id: "a" }] };
  const read = () => clone(source);
  const firstPage = createRenderReads({ data: read });
  assert.equal(firstPage.data().draws.length, 1);
  source.draws.push({ id: "b" });
  assert.equal(firstPage.data().draws.length, 1, "one page keeps one picture");
  const nextPage = createRenderReads({ data: read });
  assert.equal(nextPage.data().draws.length, 2);
});

test("badge: not registered comes first and reads nothing", () => {
  const { calls, readers } = countingReaders();
  const badge = badgeFor(2, DRAW_BY_OWNER, { reads: createRenderReads(readers), isUnregistered: true });
  assert.deepEqual(badge, { kind: "unregistered", referralOwnerId: null });
  assert.deepEqual(calls, { profiles: 0, projects: 0, data: 0 });
});

test("badge: verified through this organizer's draws is a referral", () => {
  assert.deepEqual(badgeFor(1), { kind: "referral", referralOwnerId: OWNER });
});

test("badge: verified with another organizer of the same brand is not mine", () => {
  assert.deepEqual(badgeFor(2), { kind: "foreign", referralOwnerId: OTHER });
  assert.deepEqual(badgeFor(11), { kind: "foreign", referralOwnerId: OTHER });
});

test("badge: the other organizer's draw may name its owner only through createdBy", () => {
  assert.deepEqual(badgeFor(12), { kind: "foreign", referralOwnerId: OTHER });
});

test("badge: the earliest draw of the project decides the referrer", () => {
  assert.deepEqual(badgeFor(14), { kind: "foreign", referralOwnerId: OTHER });
});

test("badge: a written-down referrer in another copy of the brand is not mine", () => {
  assert.deepEqual(badgeFor(4), { kind: "foreign", referralOwnerId: OTHER });
});

test("badge: brand names match regardless of case and spacing", () => {
  const reads = createRenderReads({ projects: () => clone(PROJECTS), data: () => clone(DATA) });
  const project = findProject("brand_pokerdom_100");
  const badge = resolveWinnerReferralBadge({
    winnerId: 11,
    draw: DRAW_BY_OWNER,
    project: { ...project, name: "pokerDOM" },
    projectData: undefined,
    userProfiles: clone(PROFILES),
    reads,
    isUnregistered: false,
  });
  assert.deepEqual(badge, { kind: "foreign", referralOwnerId: OTHER });
});

test("badge: another brand's referrer says nothing about this brand", () => {
  assert.deepEqual(badgeFor(13), { kind: "referral", referralOwnerId: null });
});

test("badge: a profile for a deleted project is not a brand entry", () => {
  assert.deepEqual(badgeFor(10), { kind: "referral", referralOwnerId: null });
});

test("badge: said they are not a referral", () => {
  assert.deepEqual(badgeFor(3), { kind: "non-referral", referralOwnerId: null });
  assert.deepEqual(badgeFor(5), { kind: "non-referral", referralOwnerId: OWNER });
});

test("badge: nobody's referral and nothing said reads as a referral", () => {
  assert.deepEqual(badgeFor(6), { kind: "referral", referralOwnerId: null });
  assert.deepEqual(badgeFor(15), { kind: "referral", referralOwnerId: null });
  // Verified, but in no draw the documents know of.
  assert.deepEqual(badgeFor(9, { ...DRAW_BY_OWNER, projectId: "brand_pokerdom_100" }, {
    reads: createRenderReads({ projects: () => clone(PROJECTS), data: () => ({ draws: [] }) }),
  }), { kind: "referral", referralOwnerId: null });
});

test("badge: without a project the profile's own referrer still counts", () => {
  const userProfiles = clone(PROFILES);
  userProfiles.users[8].projects[""] = { referralOwnerId: OTHER };
  assert.deepEqual(badgeFor(8, DRAW_WITHOUT_PROJECT, { userProfiles }), { kind: "foreign", referralOwnerId: OTHER });
  userProfiles.users[8].projects.brand_gone_100 = { referralOwnerId: String(OTHER) };
  assert.deepEqual(badgeFor(8, DRAW_OF_DELETED_PROJECT, { userProfiles }), { kind: "foreign", referralOwnerId: OTHER });
});

test("badge: the draw owner comes from createdBy when ownerId is missing", () => {
  assert.deepEqual(badgeFor(1, DRAW_BY_CREATOR), { kind: "foreign", referralOwnerId: OWNER });
  assert.deepEqual(badgeFor(8, DRAW_BY_CREATOR), { kind: "referral", referralOwnerId: OTHER });
});

test("badge: a draw with no owner at all never says someone else's referral", () => {
  const ownerless = { id: "x", projectId: "brand_pokerdom_100" };
  assert.deepEqual(badgeFor(2, ownerless), { kind: "referral", referralOwnerId: OTHER });
});

test("badge: same answer as when every card read the documents itself", () => {
  for (const draw of DRAWS) {
    for (const unregistered of [false, true]) {
      const reads = createRenderReads({ projects: () => clone(PROJECTS), data: () => clone(DATA) });
      const userProfiles = clone(PROFILES);
      for (const winnerId of WINNERS) {
        const { readers } = countingReaders();
        const expected = previousBadgeKind(winnerId, draw, clone(PROFILES), readers, unregistered);
        const actual = badgeFor(winnerId, draw, { reads, userProfiles, isUnregistered: unregistered });
        assert.deepEqual(actual, expected, `winner ${winnerId}, draw ${draw.id}, unregistered ${unregistered}`);
      }
    }
  }
});

test("badge: a page of many winners parses each document at most once and never the profiles", () => {
  const { calls, readers } = countingReaders();
  const reads = createRenderReads({ projects: readers.projects, data: readers.data });
  const userProfiles = clone(PROFILES);
  for (let round = 0; round < 4; round += 1) {
    for (const winnerId of WINNERS) {
      badgeFor(winnerId, DRAW_BY_OWNER, { reads, userProfiles });
    }
  }
  assert.deepEqual(calls, { profiles: 0, projects: 1, data: 1 });

  // What the same page cost before, for the record.
  const before = countingReaders();
  for (let round = 0; round < 4; round += 1) {
    for (const winnerId of WINNERS) {
      previousBadgeKind(winnerId, DRAW_BY_OWNER, userProfiles, before.readers, false);
    }
  }
  assert.ok(before.calls.profiles >= WINNERS.length * 4 - 8, `profiles parsed ${before.calls.profiles} times`);
});

test("badge: working out the badges changes none of the shared documents", () => {
  const userProfiles = clone(PROFILES);
  const reads = createRenderReads({ projects: () => clone(PROJECTS), data: () => clone(DATA) });
  const projectsBefore = clone(reads.projects());
  const dataBefore = clone(reads.data());
  for (const draw of DRAWS) {
    for (const winnerId of WINNERS) {
      badgeFor(winnerId, draw, { reads, userProfiles });
    }
  }
  assert.deepEqual(userProfiles, PROFILES);
  assert.deepEqual(reads.projects(), projectsBefore);
  assert.deepEqual(reads.data(), dataBefore);
});

test("badge: a page with no brand winners never touches the draws", () => {
  const { calls, readers } = countingReaders();
  const reads = createRenderReads({ projects: readers.projects, data: readers.data });
  for (const winnerId of [3, 6, 15]) {
    badgeFor(winnerId, DRAW_BY_OWNER, { reads });
  }
  assert.equal(calls.data, 0, "nobody here is verified, so no draw lookup is needed");
  badgeFor(1, DRAW_WITHOUT_PROJECT, { reads });
  assert.equal(calls.data, 0);
});
