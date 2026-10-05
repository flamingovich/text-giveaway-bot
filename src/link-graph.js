// Who is linked to whom: the web admin's «Связи», drawn the way Arkham draws
// wallets - people, the evidence they share, and the clusters it makes.
//
// A link is a piece of evidence two or more people share. Three kinds settle
// it alone and are the ones the anti-fraud already zeroes a prize for:
//
//   wallet  - the same payout address;
//   account - the same ID on a brand's project;
//   shot    - the same profile screenshot, byte for byte.
//
// Two more make a cluster but zero nothing (the owner's decision: shown, not
// punished - a wrong IP must not cost an honest winner the prize):
//
//   ip      - the same network in at least two draws together. One draw is not
//             enough (a flat, a café), and a network shared by more than five
//             people is a mobile carrier's or a public Wi-Fi, not a person;
//   chain   - money on the blockchain: one wallet funding the deposit
//             addresses of a few of ours, or one of ours paying into another's.
//
// Referrals only draw a line inside a cluster: inviting a friend is what the
// mini app asks for, and on its own it says nothing.

const STRONG = new Set(["wallet", "account", "shot"]);
const CLUSTERING = new Set(["wallet", "account", "shot", "ip", "chain"]);
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
function collectLinkEvidence({ draws = [], userProfiles = {}, projects = [], counterparties = [], normalizeAccountId = (v) => String(v || "").trim().toUpperCase() }) {
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
      const accountId = normalizeAccountId(data?.projectAccountId);
      if (accountId) {
        const brand = brandSlugOf(projectId, projectsById);
        add(`account:${brand}:${accountId}`, "account", `${brand} ${accountId}`, userId);
      }
      const sha = data?.profileShot?.sha256;
      if (sha) add(`shot:${sha}`, "shot", `скрин ${sha.slice(0, 8)}`, userId);
    }
  }

  // Same network: counted per draw, so a pair is linked only after two draws together.
  const ipDraws = new Map();
  for (const draw of draws) {
    for (const [userId, notify] of Object.entries(draw.winnerNotifications || {})) {
      ownAddress(notify?.trc20Address, userId);
    }
    for (const [userId, meta] of Object.entries(draw.participantMeta || {})) {
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
  for (const [ipHash, users] of ipDraws) {
    if (users.size < 2 || users.size > MAX_IP_PEOPLE) continue;
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
    for (const link of row.links || []) {
      const other = normalizeAddress(link.address);
      const otherOwners = ownersOfAddress.get(other);
      if (otherOwners) {
        const pair = [normalizeAddress(row.address), other].sort().join("~");
        for (const u of [...owners, ...otherOwners]) add(`transfer:${pair}`, "chain", "перевод между адресами", u, { kind: "transfer" });
        continue;
      }
      const set = chainUsers.get(other) || new Set();
      owners.forEach((u) => set.add(u));
      chainUsers.set(other, set);
    }
  }
  for (const [address, users] of chainUsers) {
    if (users.size < 2 || users.size > MAX_CHAIN_PEOPLE) continue;
    users.forEach((u) => add(`chain:${address}`, "chain", address, u, { kind: "counterparty" }));
  }

  for (const [key, entry] of evidence) {
    if (entry.users.size < 2) evidence.delete(key);
  }
  return evidence;
}

/** Clusters of people linked by clustering evidence. → [{ id, users:[], evidence:[] , strong }] */
function buildClusters(evidence) {
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
    if (!CLUSTERING.has(entry.kind)) continue;
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
  collectLinkEvidence,
  buildClusters,
  summarizeCounterparties,
};
