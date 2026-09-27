const test = require("node:test");
const assert = require("node:assert");
const {
  validateProjectAccountIdFormat,
  isProjectAccountIdOwnName,
  getPokerdomAccountCreatedAt,
  isPokerdomAccountBeforeReferrals,
} = require("./project-account-id");

const BEEF = { templateSlug: "beef", name: "BEEF" };

// #SLAVA got into a draw: five letters pass the #XXXXX shape. Letters alone
// prove nothing - 44% of the real #XXXXX ids are all letters - so what is
// refused is what no project would issue.
test("ids made of one or two characters are refused", () => {
  for (const raw of ["#AAAAB", "#ABABA", "#AABBB", "#5555E", "#JDJDJ"]) {
    assert.equal(validateProjectAccountIdFormat(raw, BEEF).ok, false, raw);
  }
});

test("keyboard rows are refused, either way along the row", () => {
  for (const raw of ["#QWERT", "#ASDFG", "#ZXCVB", "#TREWQ", "#GFDSA"]) {
    assert.equal(validateProjectAccountIdFormat(raw, BEEF).ok, false, raw);
  }
});

test("common names and words are refused", () => {
  for (const raw of ["#SLAVA", "#ALMIR", "#SASHA", "#MAXIM", "#ADMIN", "#HELLO"]) {
    assert.equal(validateProjectAccountIdFormat(raw, BEEF).ok, false, raw);
  }
});

// Ids from the base that look odd but are real-shaped: none of the new rules
// may touch them.
test("real ids, letters-only ones included, still go through", () => {
  for (const raw of ["#FJ0UW", "#WCJVO", "#MS9FF", "#194WW", "#GDOZE", "#JUMYK", "#L32GR"]) {
    assert.equal(validateProjectAccountIdFormat(raw, BEEF).ok, true, raw);
  }
});

test("an id that is the person's own name, in Latin letters, is spotted", () => {
  assert.equal(isProjectAccountIdOwnName("#SLAVA", { first_name: "Слава" }), true);
  assert.equal(isProjectAccountIdOwnName("#ALMIR", { username: "almir_777" }), true);
  assert.equal(isProjectAccountIdOwnName("#IVANO", { last_name: "Иванов" }), true);
  assert.equal(isProjectAccountIdOwnName("#OLGA7", { first_name: "Olga" }), true);
});

test("a real id is not mistaken for the person's name", () => {
  assert.equal(isProjectAccountIdOwnName("#FJ0UW", { first_name: "Фёдор", username: "fedor" }), false);
  // A name part shorter than four letters says nothing.
  assert.equal(isProjectAccountIdOwnName("#ANAFK", { first_name: "Ана" }), false);
  assert.equal(isProjectAccountIdOwnName("#FJ0UW", null), false);
});

function pokerdomId(iso) {
  return Math.floor(Date.parse(iso) / 1000).toString(16).padStart(8, "0") + "e81e6a8743d0d7e2";
}

test("the account's creation date is read from a Pokerdom id", () => {
  const created = getPokerdomAccountCreatedAt(pokerdomId("2026-07-01T12:00:00Z"));
  assert.equal(created.toISOString(), "2026-07-01T12:00:00.000Z");
  assert.equal(getPokerdomAccountCreatedAt("not an id"), null);
});

// The owner started taking Pokerdom referrals on 1 June 2026 (Moscow).
test("an account made before 1 June 2026 cannot be a referral; one made after can", () => {
  assert.equal(isPokerdomAccountBeforeReferrals(pokerdomId("2025-12-01T00:00:00Z")), true);
  assert.equal(isPokerdomAccountBeforeReferrals(pokerdomId("2026-05-31T20:59:59Z")), true, "31 мая 23:59 по Москве");
  assert.equal(isPokerdomAccountBeforeReferrals(pokerdomId("2026-05-31T21:00:00Z")), false, "1 июня 00:00 по Москве");
  assert.equal(isPokerdomAccountBeforeReferrals(pokerdomId("2026-08-17T00:00:00Z")), false);
});
