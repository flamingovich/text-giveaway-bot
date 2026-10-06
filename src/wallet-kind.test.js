const test = require("node:test");
const assert = require("node:assert");
const { judgeWallet, judgePayoutOutcome, exchangeOfTag, describeWalletVerdict } = require("./wallet-kind");

const ME = "TMeMeMeMeMeMeMeMeMeMeMeMeMeMeMeMe1";
const BYBIT_HOT = "TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa";
const POKERDOM_CASHIER = "TXvftBh4h2NoxBiVKuAdpaP6K2MeHsazMQ";
const DAY = 864e5;
const tin = (amount, ts, from = BYBIT_HOT, fromTag = "Bybit") => ({ from, to: ME, amount, ts, fromTag });
const tout = (amount, ts, to, toTag = null) => ({ from: ME, to, amount, ts, toTag });

test("a fresh address is accepted: a new cashier address looks the same", () => {
  const v = judgeWallet({ address: ME, transfers: [], complete: true });
  assert.equal(v.kind, "new");
  assert.equal(v.reject, false);
});

// Our own payouts come from a Bybit hot wallet: money coming FROM an exchange
// says nothing about whose address this is.
test("money that came and sits is accepted, whoever sent it", () => {
  const v = judgeWallet({ address: ME, transfers: [tin(10, 1)], complete: true });
  assert.equal(v.kind, "sitting");
  assert.equal(v.reject, false);
});

test("a sweep into a known casino cashier is the address we want", () => {
  const v = judgeWallet({ address: ME, transfers: [tin(10, 1), tout(10, 2, POKERDOM_CASHIER)], complete: true });
  assert.equal(v.kind, "cashier");
  assert.equal(v.platform, "Pokerdom");
  assert.equal(v.reject, false);
});

test("money swept straight into an exchange's hot wallet: an exchange deposit, refused", () => {
  const v = judgeWallet({ address: ME, transfers: [tin(10, 1), tout(10, 2, BYBIT_HOT, "Bybit")], complete: false });
  assert.equal(v.kind, "exchange");
  assert.equal(v.platform, "Bybit");
  assert.equal(v.reject, true);
});

// Cashiers rotate their collectors: full sweeps to ever new places are a
// deposit address, not a person (the spot check that overturned the old rule).
test("full sweeps to rotating collectors are a cashier, not a person", () => {
  const transfers = [tin(10, 1), tout(10, 2, "TCollectorAAAAAAAAAAAAAAAAAAAAAAAA"), tin(20, 3), tout(20, 4, "TCollectorBBBBBBBBBBBBBBBBBBBBBBBB"), tin(5, 5), tout(5, 6, "TCollectorCCCCCCCCCCCCCCCCCCCCCCCC")];
  const v = judgeWallet({ address: ME, transfers, complete: true });
  assert.equal(v.kind, "cashier");
  assert.equal(v.reject, false);
});

test("a person's own wallet - parts of the money to different places - is refused", () => {
  const transfers = [tin(100, 1), tout(30, 2, "TFriendAAAAAAAAAAAAAAAAAAAAAAAAAAA"), tout(20, 3, "TShopBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")];
  const v = judgeWallet({ address: ME, transfers, complete: true });
  assert.equal(v.kind, "personal");
  assert.equal(v.reject, true);
});

// Partial sends can only be told from sweeps when the whole history is read.
test("without the whole history a person is never refused", () => {
  const transfers = [tin(100, 1), tout(30, 2, "TFriendAAAAAAAAAAAAAAAAAAAAAAAAAAA"), tout(20, 3, "TShopBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")];
  assert.equal(judgeWallet({ address: ME, transfers, complete: false }).reject, false);
});

test("CryptoBot is never refused", () => {
  const cryptoBot = "TUeapnPqxRyQB2hePL2mSsm5HEZc7aSiwE";
  const v = judgeWallet({ address: ME, transfers: [tin(10, 1), tout(10, 2, cryptoBot)], complete: true });
  assert.equal(v.kind, "cryptobot");
  assert.equal(v.reject, false);
  assert.equal(exchangeOfTag("Telegram Wallet"), null);
  assert.equal(exchangeOfTag("CryptoBot"), null);
});

test("spam dust does not make a history", () => {
  const v = judgeWallet({ address: ME, transfers: [tin(0.01, 1, "TSpam111111111111111111111111111111")], complete: true });
  assert.equal(v.kind, "new");
});

test("exchange tags are read to the exchange's name", () => {
  assert.equal(exchangeOfTag("Binance-Hot 7"), "Binance");
  assert.equal(exchangeOfTag("OKX Hot Wallet_155"), "OKX");
  assert.equal(exchangeOfTag("MXC"), "MEXC");
  assert.equal(exchangeOfTag("FixedFloat"), null);
});

test("after a payout: untouched, into the cashier, or past the project", () => {
  const paidAt = 10 * DAY;
  const paid = tin(10, paidAt);
  assert.equal(judgePayoutOutcome({ address: ME, transfers: [paid], paidAt }).outcome, "waiting");
  assert.equal(judgePayoutOutcome({ address: ME, transfers: [paid, tout(10, paidAt + DAY, POKERDOM_CASHIER)], paidAt }).outcome, "ok");
  assert.equal(judgePayoutOutcome({ address: ME, transfers: [paid, tout(10, paidAt + DAY, BYBIT_HOT, "Bybit")], paidAt }).outcome, "exchange");
  const spent = [tin(100, 1), paid, tout(30, paidAt + 1, "TFriendAAAAAAAAAAAAAAAAAAAAAAAAAAA"), tout(40, paidAt + 2, "TShopBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")];
  assert.equal(judgePayoutOutcome({ address: ME, transfers: spent, complete: true, paidAt }).outcome, "personal");
});

test("the owner's labels, in his words", () => {
  const { describePastPayoutFlag } = require("./wallet-kind");
  const text = (verdict) => describeWalletVerdict(verdict).text;
  assert.equal(text({ kind: "cashier", platform: "Pokerdom?" }), "Pokerdom");
  assert.equal(text({ kind: "cashier", platform: "BEEF/IRIS?" }), "Роялы");
  assert.equal(text({ kind: "cashier", platform: "LuckyBear?" }), "LuckyBear");
  assert.equal(text({ kind: "cashier", platform: null }), "Наверное казино");
  assert.equal(text({ kind: "new" }), "Пустой кошелёк");
  assert.equal(text({ kind: "sitting" }), "Деньги лежат");
  assert.equal(text({ kind: "service", platform: "FixedFloat" }), "FixedFloat");
  assert.equal(text({ kind: "unclear" }), "Неизвестно");
  assert.equal(text({ kind: "exchange", platform: "Bybit" }), "Bybit");
  assert.equal(describeWalletVerdict({ kind: "exchange", platform: "Bybit" }).tone, "danger");
  assert.equal(text({ kind: "personal" }), "Личный кошелек");
  assert.equal(text({ kind: null, error: "429" }), "Не проверен");
  assert.equal(describeWalletVerdict(null), null);
  assert.equal(describePastPayoutFlag({ outcome: "exchange", platform: "Bybit" }), "Прошлый приз ушел на Bybit");
  assert.equal(describePastPayoutFlag({ outcome: "personal" }), "Прошлый приз ушел на Личный");
});
