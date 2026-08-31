const test = require("node:test");
const assert = require("node:assert");
const {
  participationTimestamp,
  computeFirstTouch,
  toProfilePatch,
  needsAttribution,
} = require("./project-attribution");

const project = (draw) => ({ projectId: draw.projectId, ownerId: draw.ownerId });

function draw(over = {}) {
  return {
    id: "d1",
    projectId: "brand_x",
    ownerId: 100,
    participantIds: [7],
    participantMeta: {},
    createdAt: "2026-08-10T00:00:00.000Z",
    ...over,
  };
}

test("the admin whose draw came first is the one credited", () => {
  const draws = [
    draw({ id: "later", ownerId: 200, participantMeta: { 7: { updatedAt: "2026-08-12T00:00:00.000Z" } } }),
    draw({ id: "earlier", ownerId: 100, participantMeta: { 7: { updatedAt: "2026-08-11T00:00:00.000Z" } } }),
  ];
  const found = computeFirstTouch(draws, project).get("7|brand_x");
  assert.equal(found.ownerId, "100");
  assert.equal(found.drawId, "earlier");
  assert.equal(found.source, "participant");
});

// Order in the array means nothing - the archive is merged in unsorted.
test("the answer does not depend on the order draws arrive in", () => {
  const a = draw({ id: "early", ownerId: 1, participantMeta: { 7: { updatedAt: "2026-08-01T00:00:00.000Z" } } });
  const b = draw({ id: "late", ownerId: 2, participantMeta: { 7: { updatedAt: "2026-08-09T00:00:00.000Z" } } });
  assert.equal(computeFirstTouch([a, b], project).get("7|brand_x").ownerId, "1");
  assert.equal(computeFirstTouch([b, a], project).get("7|brand_x").ownerId, "1");
});

test("a person is attributed separately on every project", () => {
  const draws = [
    draw({ id: "x", projectId: "brand_x", ownerId: 1, participantMeta: { 7: { updatedAt: "2026-08-05T00:00:00.000Z" } } }),
    draw({ id: "y", projectId: "brand_y", ownerId: 2, participantMeta: { 7: { updatedAt: "2026-08-06T00:00:00.000Z" } } }),
  ];
  const map = computeFirstTouch(draws, project);
  assert.equal(map.get("7|brand_x").ownerId, "1");
  assert.equal(map.get("7|brand_y").ownerId, "2");
});

// 25 old draws never recorded a per-participant stamp.
test("a draw without participant stamps still places the person in time", () => {
  const draws = [
    draw({ id: "old", ownerId: 1, createdAt: "2026-06-01T00:00:00.000Z", participantMeta: {} }),
    draw({ id: "new", ownerId: 2, participantMeta: { 7: { updatedAt: "2026-08-01T00:00:00.000Z" } } }),
  ];
  const found = computeFirstTouch(draws, project).get("7|brand_x");
  assert.equal(found.ownerId, "1");
  assert.equal(found.source, "draw", "and says the evidence was coarse");
});

test("when two answers tie, the exactly-dated one wins", () => {
  const when = "2026-08-01T00:00:00.000Z";
  const draws = [
    draw({ id: "coarse", ownerId: 1, createdAt: when, participantMeta: {} }),
    draw({ id: "exact", ownerId: 2, createdAt: when, participantMeta: { 7: { updatedAt: when } } }),
  ];
  const found = computeFirstTouch(draws, project).get("7|brand_x");
  assert.equal(found.source, "participant");
  assert.equal(found.ownerId, "2");
});

test("draws with no project or no owner are skipped rather than guessed at", () => {
  const draws = [
    draw({ id: "orphan", projectId: null }),
    draw({ id: "ownerless", ownerId: null }),
  ];
  assert.equal(computeFirstTouch(draws, project).size, 0);
});

test("a draw nobody can be placed in time contributes nothing", () => {
  const draws = [draw({ createdAt: null, publishAt: null, startAt: null, participantMeta: {} })];
  assert.equal(computeFirstTouch(draws, project).size, 0);
});

test("an attribution already on file is never overwritten", () => {
  assert.equal(needsAttribution({ firstTouchOwnerId: 5 }), false);
  assert.equal(needsAttribution({ firstTouchOwnerId: 0 }), false, "even id 0 counts as set");
  assert.equal(needsAttribution({}), true);
  assert.equal(needsAttribution(null), true);
});

test("the patch written to a profile carries the evidence with it", () => {
  const entry = { ownerId: "42", at: Date.parse("2026-08-01T10:00:00.000Z"), source: "participant", drawId: "d9" };
  assert.deepEqual(toProfilePatch(entry), {
    firstTouchOwnerId: 42,
    firstTouchAt: "2026-08-01T10:00:00.000Z",
    firstTouchDrawId: "d9",
    firstTouchSource: "participant",
  });
});

test("joinedAt is preferred over a later profile touch", () => {
  const d = draw({ participantMeta: { 7: { joinedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" } } });
  assert.equal(participationTimestamp(d, 7).at, Date.parse("2026-08-01T00:00:00.000Z"));
});
