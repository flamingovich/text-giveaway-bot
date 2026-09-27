const test = require("node:test");
const assert = require("node:assert");
const {
  isFillerProjectAccountId,
  validateProjectAccountIdFormat,
} = require("./project-account-id");

const POKERDOM = { templateSlug: "pokerdom", name: "Pokerdom" };
const LUCKYBEAR = { templateSlug: "luckybear", name: "LuckyBear" };
const FUGU = { templateSlug: "fugu", name: "FUGU" };

// A Pokerdom id is a 24-character ObjectId; its first eight characters are the
// second the account was made (see project-account-id.js).
function pokerdomIdCreatedAt(iso, tail = "e81e6a8743d0d7e2") {
  return Math.floor(Date.parse(iso) / 1000).toString(16).padStart(8, "0") + tail;
}

test("Pokerdom no longer takes a row of ones for an id", () => {
  for (const raw of ["111111111111111111111111", "000000000000000000000000", "123456789012345678901234"]) {
    const result = validateProjectAccountIdFormat(raw, POKERDOM);
    assert.equal(result.ok, false, raw);
    assert.match(result.error, /не похож на настоящий/);
  }
});

test("a Pokerdom id of the wrong length is refused", () => {
  for (const raw of ["918273645501234", pokerdomIdCreatedAt("2026-07-01").slice(0, 23), pokerdomIdCreatedAt("2026-07-01") + "00000000"]) {
    assert.equal(validateProjectAccountIdFormat(raw, POKERDOM).ok, false, raw);
  }
});

test("a real-looking Pokerdom id still goes through", () => {
  for (const raw of [pokerdomIdCreatedAt("2026-07-01"), pokerdomIdCreatedAt("2015-05-12", "9dc97bddfe3a04ab"), pokerdomIdCreatedAt("2026-07-01").toUpperCase()]) {
    assert.equal(validateProjectAccountIdFormat(raw, POKERDOM).ok, true, raw);
  }
});

test("a Pokerdom id whose date is not a real one is refused", () => {
  assert.equal(validateProjectAccountIdFormat("ffffffff" + "e81e6a8743d0d7e2", POKERDOM).ok, false, "дата из будущего");
  assert.equal(validateProjectAccountIdFormat("0000abcd" + "e81e6a8743d0d7e2", POKERDOM).ok, false, "1970 год");
});

test("LuckyBear refuses filler, dashes or not", () => {
  for (const raw of ["1111", "aaaa", "1111-1111", "0000-0000", "abcd", "dcba", "12345678", "1234-5678"]) {
    assert.equal(validateProjectAccountIdFormat(raw, LUCKYBEAR).ok, false, raw);
  }
});

// These are the cases the LuckyBear tests exist to protect: real UIDs, of the
// lengths seen in the base. Filler detection must not reach them.
test("real LuckyBear ids are untouched by the filler check", () => {
  for (const raw of ["1771050325", "165456675", "17710503251"]) {
    assert.equal(validateProjectAccountIdFormat(raw, LUCKYBEAR).ok, true, raw);
  }
});

test("FUGU-style ids behave exactly as before", () => {
  assert.equal(validateProjectAccountIdFormat("#FJ0UW", FUGU).ok, true);
  assert.equal(validateProjectAccountIdFormat("11111", FUGU).ok, false);
  assert.equal(validateProjectAccountIdFormat("12345", FUGU).ok, false);
});

test("digit runs wrap past nine, letter runs do not wrap", () => {
  assert.equal(isFillerProjectAccountId("7890123"), true);
  assert.equal(isFillerProjectAccountId("3210987"), true);
  assert.equal(isFillerProjectAccountId("xyza"), false);
});

test("short or mixed strings are not called filler", () => {
  // Too short to judge, and a mix of letters and digits is how real ids look.
  assert.equal(isFillerProjectAccountId("111"), false);
  assert.equal(isFillerProjectAccountId("a1a1"), false);
  assert.equal(isFillerProjectAccountId("1a2b3c"), false);
  assert.equal(isFillerProjectAccountId(""), false);
});
