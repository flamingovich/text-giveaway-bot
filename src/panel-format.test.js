const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatUsdStat,
  formatCountdownClock,
  formatCardDateShort,
  normalizePanelHistoryFilter,
  filterPanelHistoryDraws,
  countDepositNetworks,
} = require("./panel-format");

test("formatUsdStat: dollars with spaced thousands, cents only when present", () => {
  assert.equal(formatUsdStat(428), "$428");
  assert.equal(formatUsdStat(1277), "$1 277");
  assert.equal(formatUsdStat(9916.54), "$9 916.54");
  assert.equal(formatUsdStat("3735.05"), "$3 735.05");
  assert.equal(formatUsdStat(12.5), "$12.50");
});

test("formatUsdStat: rounds to the cent before splitting", () => {
  assert.equal(formatUsdStat(9916.999), "$9 917");
  assert.equal(formatUsdStat(0.004), "$0");
});

test("formatUsdStat: nothing, negative or garbage reads as $0", () => {
  assert.equal(formatUsdStat(0), "$0");
  assert.equal(formatUsdStat(-5), "$0");
  assert.equal(formatUsdStat(undefined), "$0");
  assert.equal(formatUsdStat("abc"), "$0");
});

test("formatCountdownClock: hours keep counting past a day", () => {
  assert.equal(formatCountdownClock(3661000), "01:01:01");
  assert.equal(formatCountdownClock(54 * 3600 * 1000), "54:00:00");
  assert.equal(formatCountdownClock(59999), "00:00:59");
});

test("formatCountdownClock: nothing left is null for the caller to label", () => {
  assert.equal(formatCountdownClock(0), null);
  assert.equal(formatCountdownClock(-1000), null);
  assert.equal(formatCountdownClock(NaN), null);
});

test("formatCountdownClock and formatUsdStat survive being sent as source text", () => {
  // panel-look.js ships them to the browser with toString(); a reference to
  // anything outside the function would throw there.
  const clock = new Function(`return (${formatCountdownClock.toString()})`)();
  const usd = new Function(`return (${formatUsdStat.toString()})`)();
  assert.equal(clock(3661000), "01:01:01");
  assert.equal(usd(9916.54), "$9 916.54");
});

test("formatCardDateShort: day, month without the dot, Moscow time", () => {
  assert.equal(formatCardDateShort("2026-09-14T00:28:00.000Z", "Europe/Moscow"), "14 сент, 03:28");
  assert.equal(formatCardDateShort("2026-05-01T09:00:00.000Z", "Europe/Moscow"), "1 мая, 12:00");
});

test("formatCardDateShort: no end is manual, a broken date says so", () => {
  assert.equal(formatCardDateShort(null, "Europe/Moscow"), "вручную");
  assert.equal(formatCardDateShort("not a date", "Europe/Moscow"), "не задано");
});

test("normalizePanelHistoryFilter: unknown values fall back to all", () => {
  assert.equal(normalizePanelHistoryFilter("due"), "due");
  assert.equal(normalizePanelHistoryFilter(" ACTIVE "), "active");
  assert.equal(normalizePanelHistoryFilter("finished"), "all");
  assert.equal(normalizePanelHistoryFilter(undefined), "all");
});

test("filterPanelHistoryDraws: active is running draws only, due asks the caller", () => {
  const draws = [
    { id: "a", status: "active" },
    { id: "s", status: "scheduled" },
    { id: "f1", status: "finished" },
    { id: "f2", status: "finished" },
  ];
  const isDue = (draw) => draw.id === "f2";
  assert.deepEqual(filterPanelHistoryDraws(draws, "all", { isDue }).map((d) => d.id), ["a", "s", "f1", "f2"]);
  assert.deepEqual(filterPanelHistoryDraws(draws, "active", { isDue }).map((d) => d.id), ["a"]);
  assert.deepEqual(filterPanelHistoryDraws(draws, "due", { isDue }).map((d) => d.id), ["f2"]);
});

test("countDepositNetworks: unknown networks count only towards all", () => {
  assert.deepEqual(countDepositNetworks(["trc20", "erc20", null, "trc20", "bep20"]), {
    all: 5,
    trc20: 2,
    erc20: 1,
    bep20: 1,
  });
  assert.deepEqual(countDepositNetworks([]), { all: 0, trc20: 0, erc20: 0, bep20: 0 });
});
