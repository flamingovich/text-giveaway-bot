// Who is linked to whom: the web admin's «Связи», drawn the way Arkham draws
// wallets - people, the evidence they share, and the clusters it makes.
//
// A link is a piece of evidence two or more people share. Three kinds settle
// it alone and are the ones the anti-fraud already zeroes a prize for:
//
//   wallet  - the same payout address;
//   account - the same ID on a brand's project;
//   shot    - the same profile screenshot, byte for byte;
//   device  - the same device id (kept in Telegram's DeviceStorage);
//   fpnet   - the same device fingerprint behind the same network: identical
//             phones share a fingerprint, but not a home network as well.
//
// Two more make a cluster but zero nothing (the owner's decision: shown, not
// punished - a wrong IP must not cost an honest winner the prize):
//
//   ip      - the same network in at least two draws together. One draw is not
//             enough (a flat, a café), a network shared by more than five
//             people is a public Wi-Fi, and a mobile carrier's or a VPN's
//             (device-signals.js) puts strangers behind one address;
//   chain   - money on the blockchain: a small wallet - a person's - behind the
//             addresses of a few of ours, or one of ours paying into another's.
//             The owner's rule: one wallet cannot belong to different people,
//             so it zeroes the prize. Cashiers, exchanges and exchangers
//             (known-wallets.js, a public tag, or ten and more counterparties
//             in a page of transfers) are infrastructure and link nobody:
//             every Pokerdom player is paid from the same wallet. A shared
//             wallet not looked at yet is "chainpending" - shown, zeroes nothing.
//
// Referrals only draw a line inside a cluster: inviting a friend is what the
// mini app asks for, and on its own it says nothing.

const { knownWallet } = require("./known-wallets");

const STRONG = new Set(["wallet", "account", "shot", "device", "fpnet", "chain"]);
const CLUSTERING = new Set(["wallet", "account", "shot", "device", "fpnet", "chain", "chainpending", "ip"]);
const MAX_FPNET_PEOPLE = 5;
const MAX_IP_PEOPLE = 5;
const MIN_IP_DRAWS = 2;
// A counterparty of more of ours than this is infrastructure: a cashier's
// collector, an exchange, the owner's own payout wallet.
const MAX_CHAIN_PEOPLE = 4;

const normalizeAddress = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^0x/i.test(text) ? text.toLowerCase() : text;
};

const brandSlugOf = (projectId, projectsById) => {
  const match = /^brand_([a-z]+)_/.exec(String(projectId || ""));
  if (match) return match[1];
  return projectsById?.get(String(projectId))?.templateSlug || String(projectId || "");
};

/**
 * Evidence per person. → Map(key -> { kind, label, users:Set, meta })
 *   draws          - active and archived draws;
 *   userProfiles   - the profiles document;
 *   projects       - the projects list (for old project ids' brands);
 *   counterparties - [{ address, links: [{ address, in, out }] }] from wallet checks.
 */
function collectLinkEvidence({
  draws = [],
  userProfiles = {},
  projects = [],
  counterparties = [],
  networkTypes = new Map(),
  partyKinds = new Map(),
  // "chain" when only the blockchain links are wanted (the anti-fraud):
  // the networks, devices and referrals of every draw are then not read.
  only = null,
  normalizeAccountId = (v) => String(v || "").trim().toUpperCase(),
}) {
  const evidence = new Map();
  const projectsById = new Map(projects.map((p) => [String(p.id), p]));
  const add = (key, kind, label, userId, meta = null) => {
    const entry = evidence.get(key) || { key, kind, label, users: new Set(), meta };
    entry.users.add(String(userId));
    evidence.set(key, entry);
  };
  const ownersOfAddress = new Map();
  const ownAddress = (address, userId) => {
    const a = normalizeAddress(address);
    if (!a || a === "не указан" || a === "Не указан") return;
    add(`wallet:${a}`, "wallet", a, userId);
    if (!ownersOfAddress.has(a)) ownersOfAddress.set(a, new Set());
    ownersOfAddress.get(a).add(String(userId));
  };

  for (const [userId, node] of Object.entries(userProfiles.users || {})) {
    for (const [projectId, data] of Object.entries(node?.projects || {})) {
      ownAddress(data?.trc20Address, userId);
      ownAddress(data?.antifraudTrc20Address, userId);
      // One ID is one account wherever it is typed: every brand issues its own.
      const accountId = normalizeAccountId(data?.projectAccountId);
      if (accountId) {
        const brand = brandSlugOf(projectId, projectsById);
        add(`account:${accountId}`, "account", `${brand} ${accountId}`, userId);
      }
      const sha = data?.profileShot?.sha256;
      if (sha) add(`shot:${sha}`, "shot", `скрин ${sha.slice(0, 8)}`, userId);
    }
  }

  // Same network: counted per draw, so a pair is linked only after two draws together.
  const ipDraws = new Map();
  const ipNetwork = new Map();
  const fpNet = new Map();
  for (const draw of draws) {
    for (const [userId, notify] of Object.entries(draw.winnerNotifications || {})) {
      ownAddress(notify?.trc20Address, userId);
    }
    if (only === "chain") continue;
    for (const [userId, meta] of Object.entries(draw.participantMeta || {})) {
      if (meta?.deviceHash) add(`device:${meta.deviceHash}`, "device", "одно устройство", userId);
      if (meta?.fpHash && meta?.ipHash) {
        const users = fpNet.get(`${meta.fpHash}|${meta.ipHash}`) || new Set();
        users.add(String(userId));
        fpNet.set(`${meta.fpHash}|${meta.ipHash}`, users);
      }
      if (meta?.ipHash && meta?.netKey) ipNetwork.set(meta.ipHash, meta.netKey);
      if (!meta?.ipHash) continue;
      const users = ipDraws.get(meta.ipHash) || new Map();
      const set = users.get(String(userId)) || new Set();
      set.add(draw.id);
      users.set(String(userId), set);
      ipDraws.set(meta.ipHash, users);
    }
    for (const [invitee, inviter] of Object.entries(draw.participantReferrals || {})) {
      const pair = [String(inviter), String(invitee)];
      add(`ref:${pair[0]}>${pair[1]}`, "referral", "пригласил", pair[0], { from: pair[0], to: pair[1] });
      add(`ref:${pair[0]}>${pair[1]}`, "referral", "пригласил", pair[1], { from: pair[0], to: pair[1] });
    }
  }
  for (const [key, users] of fpNet) {
    if (users.size < 2 || users.size > MAX_FPNET_PEOPLE) continue;
    users.forEach((u) => add(`fpnet:${key}`, "fpnet", "отпечаток + сеть", u));
  }
  for (const [ipHash, users] of ipDraws) {
    if (users.size < 2 || users.size > MAX_IP_PEOPLE) continue;
    const type = networkTypes.get(ipNetwork.get(ipHash));
    if (type === "mobile" || type === "hosting") continue;
    const list = [...users.entries()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const together = [...list[i][1]].filter((id) => list[j][1].has(id)).length;
        if (together < MIN_IP_DRAWS) continue;
        const key = `ip:${ipHash}`;
        add(key, "ip", "одна сеть", list[i][0], { draws: 0 });
        add(key, "ip", "одна сеть", list[j][0], { draws: 0 });
        const entry = evidence.get(key);
        entry.meta.draws = Math.max(entry.meta.draws, together);
      }
    }
  }

  // The blockchain: a counterparty shared by the addresses of a few of ours,
  // or one of ours paying into another's address.
  const chainUsers = new Map();
  for (const row of counterparties) {
    const owners = ownersOfAddress.get(normalizeAddress(row.address));
    if (!owners) continue;
    if (knownWallet(row.address)) continue;
    for (const link of row.links || []) {
      const other = normalizeAddress(link.address);
      if (knownWallet(other)) continue;
      const otherOwners = ownersOfAddress.get(other);
      if (otherOwners) {
        const pair = [normalizeAddress(row.address), other].sort().join("~");
        for (const u of [...owners, ...otherOwners]) add(`transfer:${pair}`, "chain", "перевод между адресами", u, { kind: "transfer" });
        continue;
      }
      const entry = chainUsers.get(other) || { users: new Set(), addresses: new Set() };
      owners.forEach((u) => entry.users.add(u));
      entry.addresses.add(normalizeAddress(row.address));
      chainUsers.set(other, entry);
    }
  }
  for (const [address, { users, addresses }] of chainUsers) {
    // Only between different addresses: people sharing one address are linked
    // by that address already, and its counterparties said it twice over.
    if (addresses.size < 2 || users.size < 2 || users.size > MAX_CHAIN_PEOPLE) continue;
    const party = partyKinds.get(address);
    if (party && (party.kind === "tagged" || party.kind === "hub")) continue;
    const kind = party?.kind === "small" ? "chain" : "chainpending";
    users.forEach((u) => add(`chain:${address}`, kind, address, u, { kind: "counterparty" }));
  }
  if (only === "chain") {
    for (const [key, entry] of evidence) {
      if (entry.kind !== "chain" || entry.users.size < 2) evidence.delete(key);
    }
    return evidence;
  }

  for (const [key, entry] of evidence) {
    if (entry.users.size < 2) evidence.delete(key);
  }
  return evidence;
}

/**
 * Clusters of people linked by clustering evidence. → [{ id, users:[], evidence:[] , strong }]
 * `clustering` - the kinds that join people (the draw page adds its own).
 */
function buildClusters(evidence, clustering = CLUSTERING) {
  const parent = new Map();
  const find = (a) => {
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)));
      a = parent.get(a);
    }
    return a;
  };
  const union = (a, b) => {
    for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const entry of evidence.values()) {
    if (!clustering.has(entry.kind)) continue;
    const users = [...entry.users];
    users.slice(1).forEach((u) => union(users[0], u));
  }
  const groups = new Map();
  for (const user of parent.keys()) {
    const root = find(user);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(user);
  }
  const clusters = [];
  for (const users of groups.values()) {
    const members = new Set(users);
    // Everything shared inside the cluster; a referral rides along only
    // between people the other evidence already put in it.
    const items = [...evidence.values()].filter((entry) => [...entry.users].every((u) => members.has(u)));
    const sorted = users.sort((a, b) => Number(a) - Number(b));
    clusters.push({
      id: sorted[0],
      users: sorted,
      evidence: items,
      strong: items.some((entry) => STRONG.has(entry.kind)),
    });
  }
  return clusters.sort((a, b) => Number(b.strong) - Number(a.strong) || b.users.length - a.users.length);
}

// Many different counterparties in a single page of transfers is a cashier,
// an exchange or a payout wallet: Pokerdom's paid 50 people in 36 minutes.
const HUB_MIN_COUNTERPARTIES = 10;

/** A shared wallet's kind from what the explorer said: tagged | hub | small. */
function classifyParty({ tag = null, distinctCount = 0 }) {
  if (tag) return { kind: "tagged", name: String(tag) };
  if (distinctCount >= HUB_MIN_COUNTERPARTIES) return { kind: "hub", name: null };
  return { kind: "small", name: null };
}

/**
 * The counterparties worth keeping for an address: the untagged ones it
 * exchanged USDT with (a tagged one is an exchange or a known service).
 */
function summarizeCounterparties(transfers, address, limit = 12) {
  const me = normalizeAddress(address);
  const map = new Map();
  for (const t of transfers || []) {
    if (Number(t.amount) < 1) continue;
    const from = normalizeAddress(t.from);
    const to = normalizeAddress(t.to);
    const incoming = to === me;
    const other = incoming ? from : to;
    if (!other || other === me) continue;
    if (incoming ? t.fromTag : t.toTag) continue;
    const entry = map.get(other) || { address: other, in: 0, out: 0 };
    entry[incoming ? "in" : "out"] += 1;
    map.set(other, entry);
  }
  return [...map.values()].sort((a, b) => b.in + b.out - (a.in + a.out)).slice(0, limit);
}

module.exports = {
  STRONG,
  CLUSTERING,
  MAX_IP_PEOPLE,
  MIN_IP_DRAWS,
  MAX_CHAIN_PEOPLE,
  MAX_FPNET_PEOPLE,
  HUB_MIN_COUNTERPARTIES,
  classifyParty,
  collectLinkEvidence,
  buildClusters,
  summarizeCounterparties,
};
