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
// This used to be refused as "похоже на UID". Written from one screenshot, that
// guess turned out to block real participants - fifteen rejections in a row -
// so a digits-only id goes through now. Guessing which of two identifiers a
// project prints is not worth keeping people out of a draw.
test("an all-digits id goes through", () => {
  assert.equal(validateProjectAccountIdFormat("1771050325", LUCKYBEAR).ok, true);
});

test("letters outside a-f survive normalisation", () => {
  const result = validateProjectAccountIdFormat("abz123xy", LUCKYBEAR);
  assert.equal(result.ok, true);
  assert.equal(result.normalized, "abz123xy", "hex-фильтр молча переписывал чужой ID");
});

test("obvious rubbish is refused", () => {
  for (const raw of ["", "   ", "1", "привет", "-", "---"]) {
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

// #SLAVA was typed to get past the step: LuckyBear never issues an id in that
// shape. Within the right shape a made-up id cannot be told from a real one, so
// this is the strongest signal there is without asking the project itself.
test("an id shaped for another brand is spotted", () => {
  const BEEF = { templateSlug: "beef", name: "BEEF" };
  const POKERDOM_P = { templateSlug: "pokerdom", name: "Pokerdom" };
  const { isProjectAccountIdShapeMismatched } = require("./project-account-id");

  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, "#SLAVA"), true);
  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, REAL_ID), false);
  assert.equal(isProjectAccountIdShapeMismatched(BEEF, REAL_ID), true);
  assert.equal(isProjectAccountIdShapeMismatched(BEEF, "#FJ0UW"), false);
  assert.equal(isProjectAccountIdShapeMismatched(POKERDOM_P, "#FJ0UW"), true);
});

test("an empty id is missing, not mismatched", () => {
  const { isProjectAccountIdShapeMismatched } = require("./project-account-id");
  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, ""), false);
  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, null), false);
  assert.equal(isProjectAccountIdShapeMismatched(null, REAL_ID), false);
});
