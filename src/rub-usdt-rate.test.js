const test = require("node:test");
const assert = require("node:assert");
const { parseCbrUsdRate } = require("./rub-usdt-rate");

// Shape of the bank's own feed: decimals written with a comma, many currencies,
// and the one we want sitting in the middle of them.
const FEED = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="20.08.2026" name="Foreign Currency Market">
  <Valute ID="R01010"><NumCode>036</NumCode><CharCode>AUD</CharCode><Nominal>1</Nominal><Name>Австралийский доллар</Name><Value>55,1234</Value></Valute>
  <Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>83,3550</Value></Valute>
  <Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Евро</Name><Value>97,1000</Value></Valute>
</ValCurs>`;

test("the dollar rate is read from the bank's own feed", () => {
  assert.equal(parseCbrUsdRate(FEED), 83.355);
});

// Some currencies are quoted per hundred or per thousand units; reading the
// value without the nominal would overstate the rate by that factor.
test("a rate quoted per many units is brought back to one", () => {
  const perHundred = FEED.replace(
    "<CharCode>USD</CharCode><Nominal>1</Nominal>",
    "<CharCode>USD</CharCode><Nominal>100</Nominal>",
  );
  assert.equal(parseCbrUsdRate(perHundred), 0.83355);
});

test("the dollar is not confused with the currency listed before it", () => {
  assert.notEqual(parseCbrUsdRate(FEED), 55.1234);
});

test("a feed without the dollar yields nothing rather than a wrong number", () => {
  const noUsd = FEED.replace(/<Valute ID="R01235">[\s\S]*?<\/Valute>/, "");
  assert.equal(parseCbrUsdRate(noUsd), null);
});

test("junk in place of a feed is refused", () => {
  assert.equal(parseCbrUsdRate(""), null);
  assert.equal(parseCbrUsdRate(null), null);
  assert.equal(parseCbrUsdRate("<html>503 Service Unavailable</html>"), null);
});

test("a nonsense value is refused rather than passed on as a rate", () => {
  assert.equal(parseCbrUsdRate(FEED.replace("83,3550", "0")), null);
  assert.equal(parseCbrUsdRate(FEED.replace("83,3550", "-5")), null);
  assert.equal(parseCbrUsdRate(FEED.replace("83,3550", "abc")), null);
});
