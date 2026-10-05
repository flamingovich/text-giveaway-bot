// What a join says about the device and the network behind it, for the links
// between people (link-graph.js) and the anti-fraud. Taken from the owner's
// other bot (crypto-guide), October 2026:
//
//   - a device id: a random id the join page keeps in Telegram's DeviceStorage
//     and in localStorage. DeviceStorage outlives a cleared WebView cache, so
//     a second Telegram account on the same phone gets the same id;
//   - a fingerprint: screen, cores, memory, languages, time zone, the video
//     card, a drawn canvas - hashed on the phone. Identical iPhones share it,
//     so it only links together with the same network;
//   - the network's type, looked up by its /24 (/48) in the public registry
//     (RDAP): a mobile carrier or a hosting/VPN puts unrelated people behind
//     one address, so a shared IP there is no link.
//
// Only hashes are kept (HMAC with a server secret): a device id or a network
// cannot be read back from the base. The client sends what it likes - a
// missing or random value only loses a link, it cannot make one with someone
// else, whose id lives only on their phone.
const crypto = require("crypto");

const DEVICE_ID = /^[a-z0-9-]{8,64}$/i;
const FINGERPRINT = /^[a-f0-9]{64}$/i;

function createSignalHasher(secret) {
  const key = String(secret || "");
  return (value) => {
    const text = String(value || "").trim().toLowerCase();
    if (!text || !key) return "";
    return crypto.createHmac("sha256", key).update(text).digest("hex").slice(0, 24);
  };
}

/** The device id and fingerprint a join request carries, if they look right. */
function readClientSignals(body) {
  const deviceId = String(body?.dev || "").trim();
  const fingerprint = String(body?.fp || "").trim();
  return {
    deviceId: DEVICE_ID.test(deviceId) ? deviceId : "",
    fingerprint: FINGERPRINT.test(fingerprint) ? fingerprint : "",
  };
}

/** "203.0.113.57" -> "203.0.113.0"; IPv6 -> its /48. The registry is asked about the network, not the person. */
function networkOf(ip) {
  const text = String(ip || "").trim().replace(/^::ffff:/i, "");
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(text);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (text.includes(":")) {
    const parts = text.split("::")[0].split(":").filter(Boolean).slice(0, 3);
    while (parts.length < 3) parts.push("0");
    return `${parts.join(":")}::`;
  }
  return "";
}

const MOBILE = /\b(mts|mobile ?telesystems|beeline|vimpelcom|megafon|tele2|t2 mobile|yota|scartel|motiv|tinkoff mobile|kyivstar|vodafone|lifecell|astelit|kcell|kar-tel|activ|ucell|uzmobile|mobiuz|beltelecom mobile|a1 belarus|life:\)|velcom|azercell|bakcell|geocell|magticom|silknet mobile|ucom mobile|mobile|cellular|gsm|lte|4g|5g|wireless)\b/i;
const HOSTING = /\b(hetzner|ovh|digitalocean|amazon|aws|google cloud|google llc|microsoft|azure|linode|akamai|vultr|choopa|m247|datacamp|cdn77|leaseweb|contabo|scaleway|online s\.a\.s|aeza|timeweb|selectel|reg\.ru|beget|firstbyte|ihor|serverius|hostinger|ionos|oracle|alibaba|tencent|cloudflare|fastly|g-core|gcore|stark industries|pq hosting|vpn|proxy|tor|hosting|cloud|datacenter|data center|colo|server|vps|dedicated|starlink)\b/i;
// Outside these countries an unknown network is almost always a VPN: people
// there reach Telegram through one (the rule crypto-guide settled on).
const HOME_COUNTRIES = new Set(["RU", "UA", "BY", "KZ", "UZ", "KG", "TJ", "AM", "AZ", "GE", "MD"]);

/** Registry text -> "mobile" | "hosting" | "home". */
function classifyNetwork({ text = "", country = "" } = {}) {
  if (HOSTING.test(text)) return "hosting";
  if (MOBILE.test(text)) return "mobile";
  if (country && !HOME_COUNTRIES.has(String(country).toUpperCase())) return "hosting";
  return "home";
}

// Every name, remark and contact in an RDAP answer, as one text.
function rdapText(answer) {
  const out = [answer?.name, answer?.handle, answer?.type];
  for (const remark of answer?.remarks || []) out.push(...(remark.description || []), remark.title);
  const walk = (entities) => {
    for (const entity of entities || []) {
      for (const item of entity.vcardArray?.[1] || []) {
        if (item[0] === "fn" || item[0] === "org") out.push(item[3]);
      }
      walk(entity.entities);
    }
  };
  walk(answer?.entities);
  return out.filter(Boolean).join(" ");
}

/**
 * Network types by hashed network, in their own table: one RDAP question per
 * network ever, asked in the background, one at a time.
 */
function createNetworkTypes(db, { hash, fetchImpl = fetch, now = () => Date.now(), logger = console } = {}) {
  if (!db) {
    return { keyOf: () => "", note() {}, typeOf: () => null, allTypes: () => new Map() };
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS net_types (
      net_key TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT,
      country TEXT,
      checked_at INTEGER NOT NULL
    ) WITHOUT ROWID;
  `);
  const select = db.prepare("SELECT type FROM net_types WHERE net_key = ?");
  const selectAll = db.prepare("SELECT net_key AS key, type FROM net_types");
  const upsert = db.prepare(
    "INSERT INTO net_types (net_key, type, name, country, checked_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (net_key) DO UPDATE SET type = excluded.type, name = excluded.name, country = excluded.country, checked_at = excluded.checked_at",
  );
  const queue = new Map();
  let running = false;

  const keyOf = (ip) => {
    const network = networkOf(ip);
    return network ? hash(network) : "";
  };

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.size) {
        const [key, network] = queue.entries().next().value;
        queue.delete(key);
        if (select.get(key)) continue;
        try {
          // RIPE answers for the other registries' networks too; rdap.org turned
          // away requests with no browser-like User-Agent (403).
          const res = await fetchImpl(`https://rdap.db.ripe.net/ip/${network}`, {
            headers: { accept: "application/rdap+json, application/json", "user-agent": "RollerBot/1.0 (+https://rollerbot.pro)" },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`rdap ${res.status}`);
          const answer = await res.json();
          const country = String(answer?.country || "").toUpperCase();
          const type = classifyNetwork({ text: rdapText(answer), country });
          upsert.run(key, type, String(answer?.name || "").slice(0, 80), country, now());
        } catch (error) {
          logger.warn(`[net] тип сети не определён: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } finally {
      running = false;
    }
  }

  // Asked for once, in the background: the join never waits for the registry.
  function note(ip) {
    const network = networkOf(ip);
    if (!network) return;
    const key = hash(network);
    if (!key || queue.has(key) || select.get(key) || queue.size > 500) return;
    queue.set(key, network);
    drain().catch(() => {});
  }

  return {
    keyOf,
    note,
    typeOf: (key) => (key ? select.get(key)?.type || null : null),
    allTypes: () => new Map(selectAll.all().map((row) => [row.key, row.type])),
  };
}

module.exports = {
  createSignalHasher,
  readClientSignals,
  networkOf,
  classifyNetwork,
  rdapText,
  createNetworkTypes,
};
