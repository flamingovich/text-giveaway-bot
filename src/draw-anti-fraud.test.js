const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateIpFraud } = require("./draw-anti-fraud");

// A draw without a project: only the IP counts decide, no profiles involved.
function drawWith(ipByUser) {
  const participantIds = Object.keys(ipByUser).map(Number);
  const participantMeta = Object.fromEntries(Object.entries(ipByUser).map(([id, ip]) => [id, { ipHash: ip }]));
  return { id: "d", participantIds, participantMeta };
}

function evaluate(draw, userId) {
  const byIp = new Map();
  for (const meta of Object.values(draw.participantMeta)) byIp.set(meta.ipHash, (byIp.get(meta.ipHash) || 0) + 1);
  return evaluateIpFraud(draw, userId, { users: {} }, { byIp }, {
    getDrawParticipantMeta: (d, id) => d.participantMeta[String(id)] || null,
    getUserProfileBundle: () => ({ projectData: null }),
    normalizeWalletAddress: (value) => String(value || "").toUpperCase(),
  });
}

test("two people on one home connection in a small draw are not flagged as bots", () => {
  const ips = { 1: "home", 2: "home" };
  for (let id = 3; id <= 15; id += 1) ips[id] = "ip" + id;
  assert.equal(evaluate(drawWith(ips), 1).shouldFlag, false);
});

test("three or more on one address above a tenth of the draw are still flagged", () => {
  const ips = { 1: "farm", 2: "farm", 3: "farm" };
  for (let id = 4; id <= 15; id += 1) ips[id] = "ip" + id;
  const result = evaluate(drawWith(ips), 1);
  assert.equal(result.shouldFlag, true);
  assert.equal(result.trigger, "ip_share_ratio");
});

// The owner's rule: one picture sent from several accounts makes them all one
// cluster of multi-accounts - the first sender included.
test("everyone sharing a profile screenshot is flagged, the first one too", () => {
  const { buildGlobalShotOwners, sharesProfileShot } = require("./draw-anti-fraud");
  const profiles = {
    users: {
      1: { projects: { brand_beef_9: { profileShot: { sha256: "aaa" } } } },
      2: { projects: { brand_beef_9: { profileShot: { sha256: "aaa" } } } },
      3: { projects: { brand_beef_9: { profileShot: { sha256: "bbb" } }, brand_beef_8: { profileShot: { sha256: "bbb" } } } },
    },
  };
  const owners = buildGlobalShotOwners(profiles);
  assert.equal(sharesProfileShot(profiles, 1, owners), true);
  assert.equal(sharesProfileShot(profiles, 2, owners), true);
  // One person's own picture on two organisers' copies of a brand is not a cluster.
  assert.equal(sharesProfileShot(profiles, 3, owners), false);
  assert.equal(sharesProfileShot(profiles, 4, owners), false);
});

// One phone behind several accounts: the device id alone, or the fingerprint
// together with the network - identical iPhones share the fingerprint only.
test("a shared device, or fingerprint and network together, flags everyone on it", () => {
  const { buildDeviceOwners, sharesDevice } = require("./draw-anti-fraud");
  const draws = [
    { participantMeta: { 1: { deviceHash: "dev1" }, 2: { deviceHash: "dev1" }, 3: { fpHash: "fp", ipHash: "home" }, 4: { fpHash: "fp", ipHash: "home" }, 5: { fpHash: "fp", ipHash: "other" } } },
  ];
  const owners = buildDeviceOwners(draws);
  assert.equal(sharesDevice(1, owners), true);
  assert.equal(sharesDevice(2, owners), true);
  assert.equal(sharesDevice(3, owners), true);
  assert.equal(sharesDevice(4, owners), true);
  assert.equal(sharesDevice(5, owners), false);
  assert.equal(sharesDevice(6, owners), false);
});

test("a fingerprint shared on one network by a crowd is a public Wi-Fi", () => {
  const { buildDeviceOwners, sharesDevice } = require("./draw-anti-fraud");
  const meta = {};
  for (let i = 1; i <= 6; i++) meta[i] = { fpHash: "iphone", ipHash: "mall" };
  assert.equal(sharesDevice(1, buildDeviceOwners([{ participantMeta: meta }])), false);
});

// Two people cannot hold one account; one person cannot have the same ID on
// two brands, each issues its own. Either way everyone holding it is flagged.
test("a project ID shared by people, or by brands, flags its holders", () => {
  const { buildAccountIdIndex, sharesProjectAccountId } = require("./draw-anti-fraud");
  const profiles = {
    users: {
      1: { projects: { brand_iris_7: { projectAccountId: "#ab1cd" } } },
      2: { projects: { brand_iris_8: { projectAccountId: "#AB1CD" } } },
      3: { projects: { brand_iris_7: { projectAccountId: "#TEST1" }, brand_beef_7: { projectAccountId: "#test1" } } },
      4: { projects: { brand_iris_7: { projectAccountId: "#Q9W8E" }, brand_iris_8: { projectAccountId: "#Q9W8E" } } },
      5: { projects: { brand_beef_7: { projectAccountId: "#11111" } } },
      6: { projects: { brand_beef_8: { projectAccountId: "#11111" } } },
    },
  };
  const index = buildAccountIdIndex(profiles, {
    normalize: (raw) => String(raw || "").trim().toUpperCase(),
    brandOf: (projectId) => (/^brand_([a-z]+)_/.exec(projectId) || [])[1] || null,
    isFiller: (id) => /^#?(.)\1+$/.test(id),
  });
  assert.equal(sharesProjectAccountId(1, index), true);
  assert.equal(sharesProjectAccountId(2, index), true);
  assert.equal(sharesProjectAccountId(3, index), true);
  // One person, one brand, two organisers' copies: the same account.
  assert.equal(sharesProjectAccountId(4, index), false);
  assert.equal(sharesProjectAccountId(5, index), false);
});

// The hole the dry runs on the real base found: an address kept on the IRIS
// profile, or given as a winner's address, was not looked at in a Pokerdom draw.
test("a shared payout address marks its people everywhere", () => {
  const { buildWalletIndex, sharesWallet } = require("./draw-anti-fraud");
  const profiles = {
    users: {
      1: { projects: { brand_iris_7: { antifraudTrc20Address: "taaa" } } },
      2: { projects: { brand_pokerdom_9: { trc20Address: "TBBB" } } },
      3: { projects: { brand_pokerdom_9: { trc20Address: "TCCC" } } },
    },
  };
  const draws = [{ winnerNotifications: { 2: { trc20Address: "TAAA" } } }];
  const index = buildWalletIndex(profiles, draws);
  assert.equal(sharesWallet(1, index), true);
  assert.equal(sharesWallet(2, index), true);
  assert.equal(sharesWallet(3, index), false);
});
