// What kind of wallet a deposit address is, read from where its money goes.
//
// The join and the winner's step ask for the deposit address of the project
// (the casino's cashier). People also send their exchange deposit address or
// a personal wallet, and the prize then never reaches the project. The owner's
// rule: such an address is never accepted - but only when it is certain.
// Everything else is accepted and only labelled for the owner:
//
//   - a new address (nothing ever came) is fine: a fresh cashier address looks
//     exactly like that;
//   - money that came and sits is fine: the Pokerdom cashier leaves small sums
//     for months and sweeps them from about 60 USDT;
//   - a sweep into a known casino cashier is the address we want;
//   - CryptoBot is never refused (one label says CryptoBot, others Pokerdom).
//
// Certain means: the address sends its money straight into a wallet publicly
// tagged as an exchange's (only the exchange itself sweeps its deposit
// addresses there), or it behaves like a person's own wallet by strict signs -
// several partial sends to different places, never the full-balance sweeps a
// cashier makes. "Sends to many places" alone is not enough: cashiers with
// rotating collectors look the same (checked on 848 real addresses).
//
// Only the first hop counts. Casino treasuries cash out to exchanges a hop or
// two later, so following the money further would call a casino an exchange.

// The casinos' cashiers, exchanges' hot wallets and exchangers we know by name
// live in known-wallets.js; the brand of a cashier is an inference.
const { KNOWN_WALLETS, knownWallet } = require("./known-wallets");

const EXCHANGE_WORDS = [
  "binance", "bybit", "okx", "okex", "htx", "huobi", "kucoin", "gate", "mexc", "mxc", "bitget", "kraken", "coinbase",
  "poloniex", "whitebit", "bitfinex", "bingx", "bitmart", "coinex", "crypto.com", "lbank", "hitbtc", "exmo", "garantex",
  "upbit", "bithumb", "bitstamp", "bitvavo", "gemini", "ascendex", "xt.com", "phemex", "toobit", "weex", "bitunix",
  "blofin", "btse", "deepcoin", "hashkey", "zoomex", "coinw", "tapbit", "rapira", "abcex", "bitpapa",
];
// Custodial Telegram wallets are not refused: some casinos take deposits through them.
const NEVER_EXCHANGE = /cryptobot|crypto bot|telegram|@wallet|wallet in/i;

/** "Binance-Hot 7" -> "Binance"; not an exchange -> null. */
function exchangeOfTag(tag) {
  const text = String(tag || "");
  if (!text || NEVER_EXCHANGE.test(text)) {
    return null;
  }
  const lower = text.toLowerCase();
  if (!EXCHANGE_WORDS.some((word) => lower.includes(word))) {
    return null;
  }
  const name = text.replace(/[-_: ]?(hot|cold|deposit|wallet|user|\d+).*$/i, "").trim() || text;
  return name === "MXC" ? "MEXC" : name;
}

function normalizeAddress(address) {
  const text = String(address || "").trim();
  return /^0x/i.test(text) ? text.toLowerCase() : text;
}

// Who a counterparty is: the learned list first, then its public tag.
function identify(address, tag) {
  const known = knownWallet(address);
  if (known) {
    // The owner's short word is what the payout queue shows ("Pokerdom", "Роялы").
    return { kind: known.kind, name: known.badge, title: known.title };
  }
  const exchange = exchangeOfTag(tag);
  if (exchange) {
    return { kind: "exchange", name: exchange };
  }
  if (tag && /cryptobot/i.test(tag)) {
    return { kind: "cryptobot", name: "CryptoBot" };
  }
  return tag ? { kind: "service", name: String(tag) } : null;
}

const SWEEP_TOLERANCE = 0.03;

/**
 * The money flow of an address: transfers [{ from, to, amount, ts, toTag?, fromTag? }].
 * Dust below 1 USDT is address-poisoning spam and does not count.
 */
function readFlow(transfers, me) {
  const self = normalizeAddress(me);
  const list = (transfers || [])
    .map((t) => ({ ...t, from: normalizeAddress(t.from), to: normalizeAddress(t.to) }))
    .filter((t) => Number(t.amount) >= 1 && (t.from === self || t.to === self))
    .sort((a, b) => a.ts - b.ts);
  let balance = 0;
  const outs = [];
  let ins = 0;
  for (const t of list) {
    if (t.to === self) {
      balance += t.amount;
      ins += 1;
      continue;
    }
    const full = balance > 0 && Math.abs(t.amount - balance) <= SWEEP_TOLERANCE * balance;
    const partial = balance > 0 && t.amount < (1 - SWEEP_TOLERANCE) * balance;
    outs.push({ ...t, full, partial });
    balance = Math.max(0, balance - t.amount);
  }
  return { ins, outs, transfers: list.length };
}

/**
 * The verdict for one address.
 * → { kind, platform, reject, reason }
 *   kind: new | sitting | cashier | cryptobot | exchange | personal | service | unclear
 * `complete` - the whole history was read; partial sends are only judged on a whole history.
 */
function judgeWallet({ address, transfers = [], complete = false, selfTag = null }) {
  const own = identify(address, selfTag);
  if (own && own.kind === "exchange") {
    return { kind: "exchange", platform: own.name, reject: true, reason: `адрес помечен «${selfTag || own.name}»` };
  }
  if (own && own.kind === "cryptobot") {
    return { kind: "cryptobot", platform: "CryptoBot", reject: false, reason: "адрес CryptoBot" };
  }
  const flow = readFlow(transfers, address);
  if (!flow.transfers) {
    return { kind: "new", platform: null, reject: false, reason: "на адрес ещё ничего не приходило" };
  }
  if (!flow.outs.length) {
    return { kind: "sitting", platform: null, reject: false, reason: "деньги пришли и лежат" };
  }
  const outs = flow.outs.map((t) => ({ ...t, who: identify(t.to, t.toTag) }));
  const cashier = outs.find((t) => t.who && (t.who.kind === "cashier" || t.who.kind === "cryptobot"));
  if (cashier) {
    return {
      kind: cashier.who.kind,
      platform: cashier.who.name,
      reject: false,
      reason: `деньги уходят в кассу${cashier.who.name ? ` (${cashier.who.name})` : ""}`,
    };
  }
  const toExchange = outs.filter((t) => t.who && t.who.kind === "exchange");
  if (toExchange.length && toExchange.length * 2 >= outs.length) {
    return {
      kind: "exchange",
      platform: toExchange[0].who.name,
      reject: true,
      reason: `деньги уходят прямо в кошелёк биржи «${toExchange[0].toTag || toExchange[0].who.name}»`,
    };
  }
  const fullShare = outs.filter((t) => t.full).length / outs.length;
  const partial = outs.filter((t) => t.partial);
  const partialPlaces = new Set(partial.map((t) => t.to)).size;
  if (complete && partial.length >= 2 && partialPlaces >= 2 && fullShare < 0.5) {
    return {
      kind: "personal",
      platform: null,
      reject: true,
      reason: `сам отправляет части денег в разные места (${partial.length} раз, ${partialPlaces} адреса)`,
    };
  }
  const tagged = outs.find((t) => t.who && t.who.kind === "service");
  if (tagged) {
    return { kind: "service", platform: tagged.who.name, reject: false, reason: `деньги уходят на «${tagged.who.name}»` };
  }
  if (fullShare >= 0.6) {
    return { kind: "cashier", platform: null, reject: false, reason: "деньги целиком забирает сборщик — похоже на кассу" };
  }
  return { kind: "unclear", platform: null, reject: false, reason: "история смешанная" };
}

/**
 * After a payout: did the money go where it should? → { outcome, platform }
 *   outcome: waiting (nothing moved yet) | ok | exchange | personal | unclear
 */
function judgePayoutOutcome({ address, transfers = [], complete = false, selfTag = null, paidAt }) {
  const self = normalizeAddress(address);
  const movedSince = (transfers || []).some(
    (t) => normalizeAddress(t.from) === self && Number(t.amount) >= 1 && t.ts >= paidAt,
  );
  const verdict = judgeWallet({ address, transfers, complete, selfTag });
  if (verdict.kind === "exchange") {
    return { outcome: "exchange", platform: verdict.platform };
  }
  if (!movedSince) {
    return { outcome: "waiting", platform: null };
  }
  if (verdict.kind === "personal") {
    return { outcome: "personal", platform: null };
  }
  if (verdict.kind === "cashier" || verdict.kind === "cryptobot") {
    return { outcome: "ok", platform: verdict.platform };
  }
  return { outcome: "unclear", platform: verdict.platform };
}

// Verdicts saved before known-wallets.js named the cashiers carry the old guesses.
const CASHIER_LABELS = { "Pokerdom?": "Pokerdom", "BEEF/IRIS?": "Роялы", "LuckyBear?": "LuckyBear" };

/** The owner's label in the payout queue (his wording). → { text, tone: ok | warn | danger | muted, title } */
function describeWalletVerdict(verdict) {
  if (!verdict) {
    return null;
  }
  if (verdict.error && !verdict.kind) {
    return { text: "Не проверен", tone: "muted", title: "сервис проверки не ответил — проверю позже" };
  }
  const title = verdict.reason || "";
  switch (verdict.kind) {
    case "new":
      return { text: "Пустой кошелёк", tone: "muted", title };
    case "sitting":
      return { text: "Деньги лежат", tone: "muted", title };
    case "cashier":
      return { text: CASHIER_LABELS[verdict.platform] || verdict.platform || "Наверное казино", tone: "ok", title };
    case "cryptobot":
      return { text: "CryptoBot", tone: "muted", title };
    case "exchange":
      return { text: verdict.platform || "Биржа", tone: "danger", title };
    case "personal":
      return { text: "Личный кошелек", tone: "danger", title };
    case "service":
      return { text: verdict.platform || "Сервис", tone: "warn", title };
    default:
      return { text: "Неизвестно", tone: "muted", title };
  }
}

/** The badge for a person whose past prize left the project. */
function describePastPayoutFlag(flag) {
  if (!flag) {
    return null;
  }
  return flag.outcome === "exchange"
    ? `Прошлый приз ушел на ${flag.platform || "биржу"}`
    : "Прошлый приз ушел на Личный";
}

module.exports = {
  KNOWN_WALLETS,
  exchangeOfTag,
  normalizeAddress,
  identify,
  readFlow,
  judgeWallet,
  judgePayoutOutcome,
  describeWalletVerdict,
  describePastPayoutFlag,
};
