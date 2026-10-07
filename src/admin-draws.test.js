const test = require("node:test");
const assert = require("node:assert");
const { collectLinkEvidence } = require("./link-graph");
const { buildDrawsView, buildDrawDetail, buildDrawRows, joinTimeline, prizeStateOf } = require("./admin-draws");
const { renderDrawsPage, renderDrawPage } = require("./admin-pages");

const TZ = "Europe/Moscow";
const at = (day, hour = 12) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();

const projects = [{ id: "brand_beef_1", name: "BEEF", ownerId: "1" }];
const draw = (id, day, participantIds, extra = {}) => ({
  id,
  status: "finished",
  projectId: "brand_beef_1",
  ownerId: "1",
  prize: "100$",
  publishAt: at(day),
  finishedAt: at(day + 1),
  participantIds,
  winnerIds: [],
  winnerNotifications: {},
  ...extra,
});
const profiles = (wallets) => ({
  users: Object.fromEntries(
    Object.entries(wallets).map(([userId, address]) => [userId, { meta: { first_name: `U${userId}` }, projects: { brand_beef_1: { trc20Address: address } } }]),
  ),
});

function setup(draws, userProfiles) {
  const evidence = collectLinkEvidence({ draws, userProfiles, projects });
  return { draws, projects, userProfiles, evidence, timezone: TZ };
}

test("newcomers, people new to the organiser and the returning are counted in order", () => {
  const draws = [
    draw("a", 1, ["10", "11"]),
    draw("other", 2, ["12"], { ownerId: "2", projectId: null }),
    draw("b", 3, ["10", "12", "13"]),
  ];
  const { rows } = buildDrawRows(setup(draws, profiles({})));
  const b = rows.find((row) => row.id === "b");
  assert.equal(b.newcomers, 1); // 13
  assert.equal(b.newToOwner, 1); // 12 came through the other organiser
  assert.equal(b.returning, 1); // 10
});

test("growth is against the organiser's previous finished draw, never for a live one", () => {
  const draws = [draw("a", 1, ["1", "2", "3", "4"]), draw("b", 3, ["1", "2", "3", "4", "5"]), draw("c", 5, ["1"], { status: "active" })];
  const { rows } = buildDrawRows(setup(draws, profiles({})));
  assert.deepEqual(rows.find((row) => row.id === "b").delta, { percent: 25, direction: "up" });
  assert.equal(rows.find((row) => row.id === "b").previousId, "a");
  assert.equal(rows.find((row) => row.id === "c").delta, null);
});

test("two accounts of one person in a draw are one extra entry; a twin outside is not", () => {
  const userProfiles = profiles({ 10: "TWallet1", 11: "TWallet1", 12: "TWallet2", 99: "TWallet2" });
  const draws = [draw("a", 1, ["10", "11", "12", "13"]), draw("z", 2, ["99"])];
  const { rows } = buildDrawRows(setup(draws, userProfiles));
  const a = rows.find((row) => row.id === "a");
  assert.equal(a.multi, 3);
  assert.equal(a.repeated.extra, 1);
  assert.equal(a.repeated.groups, 1);
});

test("the draw's graph holds only its own people; the rest are listed as linked outside", () => {
  const userProfiles = profiles({ 10: "TWallet1", 11: "TWallet1", 12: "TWallet2", 99: "TWallet2" });
  const draws = [draw("a", 1, ["10", "11", "12", "13"], { winnerIds: ["11"], winnerNotifications: { 11: { paidAt: at(3) } } }), draw("z", 2, ["99"])];
  const detail = buildDrawDetail("a", setup(draws, userProfiles));
  assert.equal(detail.clusters.length, 1);
  assert.deepEqual(detail.clusters[0].members.map((m) => m.identity.userId).sort(), ["10", "11"]);
  assert.equal(detail.clusters[0].members.find((m) => m.identity.userId === "11").winner, true);
  assert.equal(detail.links.winnersInGroups, 1);
  assert.deepEqual(detail.outside.map((item) => item.identity.userId), ["12"]);
  assert.equal(detail.winners[0].inDrawLinked, true);
});

test("one network inside one draw is shown, but not a carrier's", () => {
  const meta = (ipHash, netKey) => ({ ipHash, netKey });
  const draws = [
    draw("a", 1, ["10", "11", "12", "13"], {
      participantMeta: { 10: meta("ip1", "home"), 11: meta("ip1", "home"), 12: meta("ip2", "lte"), 13: meta("ip2", "lte") },
    }),
  ];
  const detail = buildDrawDetail("a", { ...setup(draws, profiles({})), networkTypes: new Map([["home", "home"], ["lte", "mobile"]]) });
  assert.equal(detail.clusters.length, 1);
  assert.equal(detail.clusters[0].strong, false);
  assert.equal(detail.clusters[0].evidence[0].kind, "ipdraw");
  assert.equal(detail.links.strongPeople, 0);
});

test("joins are binned by the hour and summed up", () => {
  const base = Date.UTC(2026, 9, 1, 10);
  const rows = [
    { stages: 64, firstAt: base },
    { stages: 64, firstAt: base + 10 * 60 * 1000 },
    { stages: 1, firstAt: base + 20 * 60 * 1000 },
    { stages: 65, firstAt: base + 2 * 60 * 60 * 1000 },
  ];
  const timeline = joinTimeline(rows, { timezone: TZ });
  assert.equal(timeline.unit, "hour");
  assert.deepEqual(timeline.perStep, [2, 0, 1]);
  assert.deepEqual(timeline.total, [2, 2, 3]);
  assert.equal(joinTimeline([{ stages: 1, firstAt: base }], { timezone: TZ }), null);
});

test("a winner's prize state", () => {
  assert.equal(prizeStateOf({ paidAt: at(1) }).key, "paid");
  assert.equal(prizeStateOf({ status: "forfeited", forfeitureReason: "anti_fraud" }).key, "fraud");
  assert.equal(prizeStateOf({ status: "forfeited", forfeitureReason: "not_subscribed" }).key, "forfeited");
  assert.equal(prizeStateOf(null).key, "none");
});

test("the pages render and escape what people typed", () => {
  const userProfiles = profiles({ 10: "TWallet1", 11: "TWallet1" });
  const draws = [draw("a", 1, ["10", "11"], { postTitle: "<script>x</script>" })];
  const ctx = setup(draws, userProfiles);
  const list = renderDrawsPage(buildDrawsView({ ...ctx, now: Date.parse(at(3)) }), TZ);
  assert.ok(!list.includes("<script>x</script>"));
  assert.ok(list.includes("/admin/draws/a"));
  const page = renderDrawPage(buildDrawDetail("a", ctx), TZ);
  assert.ok(!page.includes("<script>x</script>"));
  assert.ok(page.includes("data-lg-root"));
});
