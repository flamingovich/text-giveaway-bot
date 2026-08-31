const test = require("node:test");
const assert = require("node:assert");
const { buildProjectStats } = require("./admin-projects");

const PROJECTS = [
  { id: "brand_a_1", name: "Alpha", ownerId: 1 },
  { id: "brand_a_2", name: "Alpha", ownerId: 2 },
  { id: "brand_b_1", name: "Beta", ownerId: 1 },
];

function draw(over = {}) {
  return { id: "d", projectId: "brand_a_1", ownerId: 1, participantIds: [], ...over };
}

test("a brand is counted across every organiser who runs it", () => {
  const stats = buildProjectStats(
    [
      draw({ id: "d1", projectId: "brand_a_1", ownerId: 1, participantIds: [10, 11] }),
      draw({ id: "d2", projectId: "brand_a_2", ownerId: 2, participantIds: [11, 12] }),
    ],
    PROJECTS,
    { users: {} },
  );
  const alpha = stats.brands.find((row) => row.brand === "Alpha");
  assert.equal(alpha.people, 3, "три человека, а не четыре");
  assert.equal(alpha.owners, 2);
  assert.equal(alpha.entries, 4, "участий всё же четыре");
});

// The whole reason both cuts exist: unique counts must never be added up.
test("per-organiser uniques do not sum to the brand's unique count", () => {
  const stats = buildProjectStats(
    [
      draw({ id: "d1", projectId: "brand_a_1", ownerId: 1, participantIds: [10, 11] }),
      draw({ id: "d2", projectId: "brand_a_2", ownerId: 2, participantIds: [11, 12] }),
    ],
    PROJECTS,
    { users: {} },
  );
  const alpha = stats.brands.find((row) => row.brand === "Alpha");
  const perOwner = stats.cells.filter((cell) => cell.brand === "Alpha").reduce((s, c) => s + c.people, 0);
  assert.equal(perOwner, 4);
  assert.equal(alpha.people, 3);
  assert.ok(perOwner > alpha.people, "пересечение обязано быть видно");
});

test("the same person on two projects is one person overall", () => {
  const stats = buildProjectStats(
    [
      draw({ id: "d1", projectId: "brand_a_1", participantIds: [10] }),
      draw({ id: "d2", projectId: "brand_b_1", participantIds: [10] }),
    ],
    PROJECTS,
    { users: {} },
  );
  assert.equal(stats.totals.people, 1);
  assert.equal(stats.totals.sharedPeople, 1, "и он числится пересекающимся");
  assert.deepEqual(stats.spreadByProject, [{ count: 2, people: 1 }]);
});

test("attribution is read from the profiles, never recomputed", () => {
  const stats = buildProjectStats(
    [
      draw({ id: "d1", projectId: "brand_a_1", ownerId: 1, participantIds: [10] }),
      draw({ id: "d2", projectId: "brand_a_2", ownerId: 2, participantIds: [10] }),
    ],
    PROJECTS,
    {
      users: {
        // Took part with both, but was brought in by the second.
        10: { meta: {}, projects: { brand_a_2: { firstTouchOwnerId: 2 } } },
      },
    },
  );
  assert.equal(stats.totals.attributed, 1);
  assert.equal(stats.cells.find((row) => row.ownerId === "2").attributed, 1, "кредит по записи в профиле");
  assert.equal(stats.cells.find((row) => row.ownerId === "1").attributed, 0, "второму — ничего");
});

// A credit pointing at an organiser with no draws left in that brand must not
// take the page down; the count is simply not shown against a cell.
test("an attribution with no matching cell is survivable", () => {
  const stats = buildProjectStats(
    [draw({ id: "d1", projectId: "brand_a_1", ownerId: 1, participantIds: [10] })],
    PROJECTS,
    { users: { 10: { meta: {}, projects: { brand_b_1: { firstTouchOwnerId: 99 } } } } },
  );
  assert.equal(stats.totals.attributed, 1);
  assert.ok(Array.isArray(stats.cells));
});

test("a draw without an owner is left out rather than guessed at", () => {
  const stats = buildProjectStats([draw({ ownerId: null, projectId: null, participantIds: [10] })], PROJECTS, {
    users: {},
  });
  assert.equal(stats.totals.people, 0);
  assert.deepEqual(stats.brands, []);
});

test("organisers are ordered by reach", () => {
  const stats = buildProjectStats(
    [
      draw({ id: "d1", projectId: "brand_a_1", ownerId: 1, participantIds: [10] }),
      draw({ id: "d2", projectId: "brand_a_2", ownerId: 2, participantIds: [20, 21, 22] }),
    ],
    PROJECTS,
    { users: {} },
  );
  assert.equal(stats.owners[0].ownerId, "2");
  assert.equal(stats.owners[0].people, 3);
});

test("nothing at all does not throw", () => {
  const stats = buildProjectStats([], [], {});
  assert.equal(stats.totals.people, 0);
  assert.deepEqual(stats.spreadByProject, []);
});
