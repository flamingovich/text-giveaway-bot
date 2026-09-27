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
