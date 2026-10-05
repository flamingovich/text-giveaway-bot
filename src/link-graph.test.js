const test = require("node:test");
const assert = require("node:assert/strict");
const { collectLinkEvidence, buildClusters, summarizeCounterparties } = require("./link-graph");

const profile = (projects) => ({ projects });
const kinds = (cluster) => cluster.evidence.map((e) => e.kind).sort();

test("a shared wallet, project ID or screenshot links people for certain", () => {
  const userProfiles = {
    users: {
      1: profile({ brand_pokerdom_9: { trc20Address: "TAAA", projectAccountId: "abc" } }),
      2: profile({ brand_pokerdom_9: { trc20Address: "TAAA" } }),
      3: profile({ brand_pokerdom_8: { projectAccountId: "ABC" } }),
      4: profile({ brand_beef_9: { projectAccountId: "abc", profileShot: { sha256: "s1" } } }),
      5: profile({ brand_beef_9: { profileShot: { sha256: "s1" } } }),
    },
  };
  const clusters = buildClusters(collectLinkEvidence({ userProfiles }));
  const byUser = (id) => clusters.find((c) => c.users.includes(id));
  // The wallet ties 1 and 2; the ID ties 1, 3 and 4, whoever the organiser and
  // whatever the brand; the screenshot ties 4 and 5.
  assert.deepEqual(byUser("1").users, ["1", "2", "3", "4", "5"]);
  assert.equal(byUser("1").strong, true);
  // The same ID on another brand is the same made-up account: one cluster.
  assert.deepEqual(byUser("4").users, ["1", "2", "3", "4", "5"]);
});

test("a network shared in two draws links; one draw, or a crowd, does not", () => {
  const meta = (pairs) => Object.fromEntries(pairs.map(([u, ip]) => [u, { ipHash: ip }]));
  const draws = [
    { id: "d1", participantMeta: meta([[1, "home"], [2, "home"], [3, "cafe"], [4, "cafe"]]) },
    { id: "d2", participantMeta: meta([[1, "home"], [2, "home"], [5, "mts"], [6, "mts"], [7, "mts"], [8, "mts"], [9, "mts"], [10, "mts"]]) },
    { id: "d3", participantMeta: meta([[5, "mts"], [6, "mts"], [7, "mts"], [8, "mts"], [9, "mts"], [10, "mts"]]) },
  ];
  const clusters = buildClusters(collectLinkEvidence({ draws, userProfiles: { users: {} } }));
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].users, ["1", "2"]);
  assert.equal(clusters[0].strong, false);
  assert.equal(clusters[0].evidence[0].meta.draws, 2);
});

// Inviting a friend is what the mini app asks for: alone it makes no cluster.
test("a referral draws a line only inside a cluster", () => {
  const userProfiles = { users: { 1: profile({ p: { trc20Address: "TAAA" } }), 2: profile({ p: { trc20Address: "TAAA" } }) } };
  const draws = [{ id: "d1", participantReferrals: { 2: "1", 4: "3" } }];
  const clusters = buildClusters(collectLinkEvidence({ draws, userProfiles }));
  assert.equal(clusters.length, 1);
  assert.deepEqual(kinds(clusters[0]), ["referral", "wallet"]);
});

test("money between ours, or one small wallet behind several of ours, links them", () => {
  const userProfiles = {
    users: {
      1: profile({ p: { trc20Address: "TA1" } }),
      2: profile({ p: { trc20Address: "TA2" } }),
      3: profile({ p: { trc20Address: "TA3" } }),
      4: profile({ p: { trc20Address: "TA4" } }),
    },
  };
  const counterparties = [
    { address: "TA1", links: [{ address: "TFunder", in: 2, out: 0 }, { address: "TA2", in: 0, out: 1 }] },
    { address: "TA3", links: [{ address: "TFunder", in: 1, out: 0 }] },
    { address: "TA4", links: [] },
  ];
  const clusters = buildClusters(collectLinkEvidence({ userProfiles, counterparties }));
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].users, ["1", "2", "3"]);
  assert.ok(clusters[0].evidence.every((e) => e.kind === "chain"));
});

// The owner's payout wallet or a cashier's collector touches dozens of ours.
test("a counterparty of many of ours is infrastructure, not a link", () => {
  const users = {};
  const counterparties = [];
  for (let i = 1; i <= 6; i++) {
    users[i] = profile({ p: { trc20Address: `TA${i}` } });
    counterparties.push({ address: `TA${i}`, links: [{ address: "TCollector", in: 0, out: 1 }] });
  }
  assert.equal(buildClusters(collectLinkEvidence({ userProfiles: { users }, counterparties })).length, 0);
});

test("only untagged counterparties above dust are kept", () => {
  const me = "TMe";
  const kept = summarizeCounterparties(
    [
      { from: "TFriend", to: me, amount: 10 },
      { from: me, to: "TFriend", amount: 5 },
      { from: "TBybitHot", to: me, amount: 10, fromTag: "Bybit" },
      { from: "TSpam", to: me, amount: 0.01 },
    ],
    me,
  );
  assert.deepEqual(kept, [{ address: "TFriend", in: 1, out: 1 }]);
});

test("one phone links for certain; a mobile carrier's address does not", () => {
  const meta = (pairs) => Object.fromEntries(pairs.map(([u, m]) => [u, m]));
  const draws = [
    { id: "d1", participantMeta: meta([[1, { deviceHash: "dev" }], [2, { deviceHash: "dev" }], [3, { ipHash: "cell", netKey: "mts" }], [4, { ipHash: "cell", netKey: "mts" }]]) },
    { id: "d2", participantMeta: meta([[3, { ipHash: "cell", netKey: "mts" }], [4, { ipHash: "cell", netKey: "mts" }], [5, { fpHash: "fp", ipHash: "home" }], [6, { fpHash: "fp", ipHash: "home" }]]) },
  ];
  const clusters = buildClusters(collectLinkEvidence({ draws, userProfiles: { users: {} }, networkTypes: new Map([["mts", "mobile"]]) }));
  const sets = clusters.map((c) => c.users.join(",")).sort();
  assert.deepEqual(sets, ["1,2", "5,6"]);
  assert.ok(clusters.every((c) => c.strong));
});
