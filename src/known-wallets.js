// Wallets we know by name: the casinos' cashiers and payout wallets, CryptoBot,
// exchanges' hot wallets, exchangers. Learned from the October 2026 analysis
// of every address in the base (agents followed the money hop by hop); the
// casinos' wallets carry no public tag, so their brand is an inference - the
// owner's word for them is used in the panel all the same.
//
// What they are for:
//   - wallet-kind.js: money swept into a cashier means the address is a
//     deposit address of that casino; into an exchange's hot wallet, an
//     exchange deposit address;
//   - link-graph.js: a cashier or an exchange is infrastructure, not a person.
//     Every player who withdrew from Pokerdom got money from its payout wallet,
//     and that ties nobody to anybody.
//
// badge - the owner's short label in the payout queue; title - the long one.

const POKERDOM = { brand: "pokerdom", badge: "Pokerdom" };
const ROYALS = { brand: "royals", badge: "Роялы" };
const LUCKYBEAR = { brand: "luckybear", badge: "LuckyBear" };

const cashier = (brand, title) => ({ kind: "cashier", ...brand, title });
const exchange = (name, title = `Биржа ${name}`) => ({ kind: "exchange", brand: null, badge: name, title });
const service = (name, title = name) => ({ kind: "service", brand: null, badge: name, title });

const KNOWN_WALLETS = {
  // Pokerdom: collectors, hot wallets, treasury, activator, payouts.
  TXvftBh4h2NoxBiVKuAdpaP6K2MeHsazMQ: cashier(POKERDOM, "Касса Pokerdom"),
  TBr9A9JRVh1bXYeCi5SNC87TBHnsiQTdin: cashier(POKERDOM, "Касса Pokerdom"),
  TV3txq6WdbGaf3e6DAUWXcBGwdCEK3oLuS: cashier(POKERDOM, "Касса Pokerdom"),
  TX5AGp9n84MDQCmogacMMYebkm4TafwwJi: cashier(POKERDOM, "Касса Pokerdom"),
  TRKZWuxZ5pPBoK3ei1nQDnjAo4YyUFUMKB: cashier(POKERDOM, "Касса Pokerdom"),
  TFoarQdvuN8mnaz5HyLWsyzt7EfSJmaDQf: cashier(POKERDOM, "Касса Pokerdom"),
  TDNPkg4YAxdWy46Zmtjd8RPQZNJht4FWn1: cashier(POKERDOM, "Касса Pokerdom"),
  TYsQqVyppXjpB9HxFLp9PY3GwLkAHDgH7R: cashier(POKERDOM, "Касса Pokerdom"),
  TD7Sbh2jbf4NuJEaeyMfXKAo1GdEEfSfS2: cashier(POKERDOM, "Касса Pokerdom"),
  TS98H6jSx6uv1gG1vx6CJZMeYGkMZXgQ7K: cashier(POKERDOM, "Касса Pokerdom"),
  TU1fPDTH4B1izHGaEpJhWwxedMRp3aBKYW: cashier(POKERDOM, "Казна Pokerdom"),
  TQ8VaoimTCjK8gr8ePgweckpDTdQJwMoLV: cashier(POKERDOM, "Казна Pokerdom"),
  TVgCxF5LfNJMdnsXc25ArBbPQ4zBvatVpC: cashier(POKERDOM, "Касса Pokerdom"),
  TQguVRm3tDmZG7AeZ47Mk6qi6GTF1ZDqkZ: cashier(POKERDOM, "Выплаты Pokerdom"),
  TSU4TTBrQhmJaWNHz2jzvHx3CyJecoQGd4: { kind: "cashier", brand: null, badge: "Касса", title: "Касса казино" },
  // CryptoBot (one third-party label; agents also tied it to Pokerdom).
  TUeapnPqxRyQB2hePL2mSsm5HEZc7aSiwE: { kind: "cryptobot", brand: null, badge: "CryptoBot", title: "CryptoBot" },
  TNRuJQFaqQPjWbTmU3RNd3BtaoN7Exhxun: { kind: "cryptobot", brand: null, badge: "CryptoBot", title: "CryptoBot" },
  TXeLzi1AV2XKaa3fRrT4vt7jEsg7ZJeWAU: { kind: "cryptobot", brand: null, badge: "CryptoBot", title: "CryptoBot" },
  // Роялы - the cashier BEEF, FUGU and IRIS share (Galaktika N.V.).
  TQJM5JE9JpfZcZRMCgzF9Vqpa7Gs4M4FUS: cashier(ROYALS, "Касса Роялов"),
  TGCqYvfzeBe38DitusTenFeb7M9kvwR4xL: cashier(ROYALS, "Касса Роялов"),
  "0x033ac5e1279cd953925224640d7856bab89c852c": cashier(ROYALS, "Касса Роялов"),
  "0xadcd5ae004fde617b37a1380731050a1a25b3f36": cashier(ROYALS, "Касса Роялов"),
  // LuckyBear: collectors, processor hubs, activators.
  TA3JXKJPcGF32QwWTr6s5fgQT1brefK9iT: cashier(LUCKYBEAR, "Касса LuckyBear"),
  TGU9wpXWBg17r3VznWmHLpNJH4bzopQtDp: cashier(LUCKYBEAR, "Касса LuckyBear"),
  TYUFzQu7sdWhnY4J3oW5ZaqyWi6swmxiAC: cashier(LUCKYBEAR, "Касса LuckyBear"),
  TDE9gC8KHCFQPJDvLC9tiYR3ehadrRGaWu: cashier(LUCKYBEAR, "Касса LuckyBear"),
  TFoLt5ZaHVysvhrkLEQ9fGW3T9WLjSAsYF: cashier(LUCKYBEAR, "Касса LuckyBear"),
  TTR1Fiyv8AsR6NXAvUBfiLwAsNDAhg3vwS: cashier(LUCKYBEAR, "Касса LuckyBear"),
  "0xf379a3d1ab6625eef34347d054cfaeafdf8f24a7": cashier(LUCKYBEAR, "Касса LuckyBear"),
  "0xc467f68a1fd7093d3f240fa194924b74b2622760": cashier(LUCKYBEAR, "Касса LuckyBear"),
  // Exchanges' hot wallets (public tags on Tronscan, BscScan, Etherscan).
  TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa: exchange("Bybit"),
  TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf: exchange("Binance"),
  TJqwA7SoZnERE4zW5uDEiPkbz4B66h9TFj: exchange("Binance"),
  TG2CMGxnTPgQ6V58kiKd7wbyN8ewtAmY76: exchange("Kraken"),
  TTd9qHyjqiUkfTxe3gotbuTMpjU8LEbpkN: exchange("Kraken"),
  TFTWNgDBkQ5wQoP8RXpRznnHvAVV8x5jLu: exchange("HTX"),
  TYyriWzf7AW75hwiVB4oDBrJGThidZuRTd: exchange("HTX"),
  TT5iK8oqGEyRKJAnRwrLSZ4fM5y77F2LNT: exchange("HTX"),
  TNqRhiZMcvQ2iWTFTsA6QktZiu48ExWsau: exchange("HTX"),
  TERCwHRnW3TsMgWVY7CHboiir2irTdZgEg: exchange("HTX"),
  TCdCNPrmZbu9K9U1w9zgYJ7WnGKZDYNb1g: exchange("HTX"),
  TCBhZ1hg4nruNyegN9rcxgHNpPy4bV7EKb: exchange("HTX"),
  TBeS4HncDEc5GGAdq1mweSVCqQHhLP3tDt: exchange("HTX"),
  TAzEohqrUxiV5fXiGRzM2AgMFGYPHYKkEz: exchange("HTX"),
  THwyeoCMSXQq2aGDpXpSqo89VnTtFktGGp: exchange("OKX"),
  TLaGjwhvA8XQYSxFAcAXy7Dvuue9eGYitv: exchange("OKX"),
  "0xeb2d2f1b8c558a40207669291fda468e50c8a0bb": exchange("Binance"),
  "0x161ba15a5f335c9f06bb5bbb0a9ce14076fbb645": exchange("Binance"),
  "0x515b72ed8a97f42c568d6a143232775018f133c8": exchange("Binance"),
  "0xbd612a3f30dca67bf60a39fd0d35e39b7ab80774": exchange("Binance"),
  "0x8894e0a0c962cb723c1976a4421c95949be2d4e3": exchange("Binance"),
  "0x28c6c06298d514db089934071355e5743bf21d60": exchange("Binance"),
  "0x9430801ebaf509ad49202aabc5f5bc6fd8a3daf8": exchange("Binance"),
  "0xf89d7b9c864f589bbf53a82105107622b35eaa40": exchange("Bybit"),
  "0xef3aeff9a5f61c6dda33069c58c1434006e13b20": exchange("Bybit"),
  "0x18e296053cbdf986196903e889b7dca7a73882f6": exchange("Bybit"),
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": exchange("Gate"),
  // Exchangers and processors: services, never a person.
  TDoXUNZ6PajKuiUkcYg3EDSV9bnqGqsbcf: service("FixedFloat", "Обменник FixedFloat"),
  TKfz7Pu3jtxWrfHzVeozQjXsb3RfuUHGE2: service("ChangeHero", "Обменник ChangeHero"),
  TS7EgdtaK4v7289C2TVpenzpmQCmWf1Hi5: service("ChangeNOW", "Обменник ChangeNOW"),
  TSBHPFbPUUntP8d3mZ4KzdCNJnFJDsDGCq: service("ChangeNOW", "Обменник ChangeNOW"),
  TWS1onJnNTg8tJHomceqxBxTsUB1DHh7PV: service("ChangeNOW", "Обменник ChangeNOW"),
  TNuh5GEwFr8otMBTDmWfhC5AwyDZeq3ZrH: service("ChangeNOW", "Обменник ChangeNOW"),
  TMzxCvdt9rhdPvBNCVunD5VbafgSV7PkQG: service("Breet", "Обменник Breet"),
  "0x15501846abdb7d182bc5d451095cc39d6b5b157a": service("Breet", "Обменник Breet"),
};

function normalizeAddress(address) {
  const text = String(address || "").trim();
  return /^0x/i.test(text) ? text.toLowerCase() : text;
}

/** The known wallet at this address, or null. */
function knownWallet(address) {
  return KNOWN_WALLETS[normalizeAddress(address)] || null;
}

module.exports = { KNOWN_WALLETS, knownWallet, normalizeAddress };
