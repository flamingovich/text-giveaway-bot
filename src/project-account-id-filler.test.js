const test = require("node:test");
const assert = require("node:assert");
const {
  isFillerProjectAccountId,
  validateProjectAccountIdFormat,
} = require("./project-account-id");

const POKERDOM = { templateSlug: "pokerdom", name: "Pokerdom" };
const LUCKYBEAR = { templateSlug: "luckybear", name: "LuckyBear" };
const FUGU = { templateSlug: "fugu", name: "FUGU" };

test("Pokerdom no longer takes a row of ones for an id", () => {
  for (const raw of ["111111111111111", "000000000000000", "123456789012345", "987654321098765"]) {
    const result = validateProjectAccountIdFormat(raw, POKERDOM);
    assert.equal(result.ok, false, raw);
    assert.match(result.error, /не похож на настоящий/);
  }
});

test("a real-looking Pokerdom id still goes through", () => {
  for (const raw of ["918273645501234", "406172839501726"]) {
    assert.equal(validateProjectAccountIdFormat(raw, POKERDOM).ok, true, raw);
  }
});

test("LuckyBear refuses filler, dashes or not", () => {
  for (const raw of ["1111", "aaaa", "1111-1111", "0000-0000", "abcd", "dcba", "12345678", "1234-5678"]) {
    assert.equal(validateProjectAccountIdFormat(raw, LUCKYBEAR).ok, false, raw);
  }
});

// These are the cases the LuckyBear tests exist to protect: every one of them
// was, or looks like, a real person's id. Filler detection must not reach them.
test("real LuckyBear ids are untouched by the filler check", () => {
  for (const raw of ["165ba529-04f5", "165ba52904f5", "1771050325", "abz123xy"]) {
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
