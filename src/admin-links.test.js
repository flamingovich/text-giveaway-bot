const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLinksView, layoutGraph, renderClusterGraph } = require("./admin-links");
const { renderLinksPage, renderLinkClusterPage } = require("./admin-pages");
const UI = require("./admin-ui");

function sampleView() {
  const userProfiles = {
    users: {
      1: { meta: { first_name: "Анна" }, projects: { brand_pokerdom_9: { trc20Address: "TAAA" } } },
      2: { meta: { username: "bob" }, projects: { brand_pokerdom_9: { trc20Address: "TAAA" } } },
      3: { meta: {}, projects: { brand_pokerdom_9: { trc20Address: "TBBB" } } },
    },
  };
  const draws = [
    { id: "d1", winnerIds: [1], winnerNotifications: { 1: { paidAt: "2026-09-01T00:00:00Z" } }, participantMeta: { 2: { ipHash: "h" }, 3: { ipHash: "h" } }, participantReferrals: { 2: "1" } },
    { id: "d2", participantMeta: { 2: { ipHash: "h" }, 3: { ipHash: "h" } } },
  ];
  return buildLinksView({ draws, userProfiles });
}

test("the clusters come with faces, prizes and what links them", () => {
  const view = sampleView();
  assert.equal(view.totals.clusters, 1);
  const [cluster] = view.clusters;
  assert.deepEqual(cluster.members.map((m) => m.identity.userId), ["1", "2", "3"]);
  assert.equal(cluster.paid, 1);
  assert.deepEqual(cluster.kinds, { wallet: 1, ip: 1, referral: 1 });
});

// A page that throws while rendering is only caught by rendering it.
test("both pages render", () => {
  const view = sampleView();
  const list = renderLinksPage(view);
  assert.match(list, /href="\/admin\/links\/1"/);
  const page = renderLinkClusterPage(view.clusters[0]);
  assert.match(page, /<svg class="lg"/);
  assert.match(page, /href="\/admin\/users\/2"/);
  assert.doesNotMatch(page, /NaN/);
});

test("the graph is the same every time and nobody overlaps", () => {
  const ids = ["a", "b", "c", "t"];
  const edges = [["a", "t"], ["b", "t"], ["c", "t"]];
  const first = layoutGraph(ids, edges);
  const second = layoutGraph(ids, edges);
  assert.deepEqual([...first.values()], [...second.values()]);
  const points = [...first.values()];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= 63);
    }
  }
});

test("names in the graph are escaped", () => {
  const view = sampleView();
  view.clusters[0].members[0].identity.title = "<script>x</script>";
  const svg = renderClusterGraph(view.clusters[0], { icon: UI.icon, avatarStyle: UI.avatarStyle });
  assert.doesNotMatch(svg, /<script>x/);
});

// The live graph is a function put into the page as text: it must parse on
// its own, and the page must carry it with its data.
test("the live graph's script and data are on the cluster page", () => {
  const { linkGraphClient } = require("./admin-link-graph-client");
  assert.doesNotThrow(() => new Function(`return (${linkGraphClient.toString()})`));
  const page = renderLinkClusterPage(sampleView().clusters[0]);
  assert.match(page, /data-lg-json/);
  assert.match(page, /function linkGraphClient/);
  assert.match(page, /data-lg-kind="wallet"/);
});
