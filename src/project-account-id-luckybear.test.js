const test = require("node:test");
const assert = require("node:assert");
const {
  getProjectAccountIdKind,
  normalizeProjectAccountId,
  validateProjectAccountIdFormat,
  buildProjectIdInputConfig,
  buildProjectIdGuideSteps,
  detectStoredProjectAccountIdKind,
} = require("./project-account-id");

const LUCKYBEAR = { templateSlug: "luckybear", name: "LuckyBear" };
const ROYAL = { templateSlug: "beef", name: "BEEF" };
const POKERDOM = { templateSlug: "pokerdom", name: "Pokerdom" };
const REAL_ID = "165ba529-04f5";

test("LuckyBear gets its own kind of id", () => {
  assert.equal(getProjectAccountIdKind(LUCKYBEAR), "luckybear");
  assert.equal(getProjectAccountIdKind(ROYAL), "royal");
  assert.equal(getProjectAccountIdKind(POKERDOM), "pokerdom");
});

test("a real id survives being pasted however it was copied", () => {
  for (const raw of [REAL_ID, "  165ba529-04f5  ", "165BA529-04F5", "#165ba529-04f5"]) {
    const result = validateProjectAccountIdFormat(raw, LUCKYBEAR);
    assert.equal(result.ok, true, raw);
    assert.equal(result.normalized, REAL_ID, raw);
  }
});

// The dash is part of the id. The #XXXXX branch strips every non-alphanumeric
// character, which would have turned this into an id the project never issued.
test("the dash is kept, not stripped", () => {
  assert.equal(normalizeProjectAccountId(REAL_ID, LUCKYBEAR), REAL_ID);
  assert.ok(normalizeProjectAccountId(REAL_ID, LUCKYBEAR).includes("-"));
});

test("no # is bolted onto a LuckyBear id", () => {
  assert.ok(!normalizeProjectAccountId(REAL_ID, LUCKYBEAR).startsWith("#"));
});

// The numeric UID sits directly under the id on the same screen, so it is the
// thing people will copy by mistake.
test("the UID from the line below is refused by name", () => {
  const result = validateProjectAccountIdFormat("1771050325", LUCKYBEAR);
  assert.equal(result.ok, false);
  assert.match(result.error, /UID/);
});

test("obvious rubbish is refused", () => {
  for (const raw of ["", "   ", "12345", "привет", "-", "---"]) {
    assert.equal(validateProjectAccountIdFormat(raw, LUCKYBEAR).ok, false, JSON.stringify(raw));
  }
});

test("an id pasted without its dash still goes through", () => {
  const result = validateProjectAccountIdFormat("165ba52904f5", LUCKYBEAR);
  assert.equal(result.ok, true, "отказ здесь не пустил бы живого человека в розыгрыш");
});

test("a stored id is recognised later without the project to ask", () => {
  assert.equal(detectStoredProjectAccountIdKind(REAL_ID), "luckybear");
  assert.equal(detectStoredProjectAccountIdKind("#FJ0UW"), "royal");
});

test("the input asks for the right thing and does not show a #", () => {
  const config = buildProjectIdInputConfig(LUCKYBEAR);
  assert.equal(config.kind, "luckybear");
  assert.equal(config.showHashPrefix, false);
  assert.equal(config.placeholder, REAL_ID);
});

test("the guide has both steps with pictures", () => {
  const steps = buildProjectIdGuideSteps(LUCKYBEAR);
  assert.equal(steps.length, 2);
  for (const step of steps) {
    assert.ok(step.text, "шаг без текста");
    assert.match(step.imageUrl, /^\/assets\/lb_id_guide\//, "картинка не на месте");
  }
  assert.match(steps[1].text, /165ba529-04f5/, "пример ID должен быть на виду");
});

test("the other brands are untouched", () => {
  assert.equal(validateProjectAccountIdFormat("#FJ0UW", ROYAL).ok, true);
  assert.equal(buildProjectIdInputConfig(ROYAL).showHashPrefix, true);
  assert.equal(validateProjectAccountIdFormat(REAL_ID, ROYAL).ok, false, "royal не принимает hex");
});
