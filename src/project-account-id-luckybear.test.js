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
// LuckyBear's id is the numeric UID in the profile. The hex code printed above
// it (165ba529-04f5) is what the first guide asked for; people entered the UID
// anyway, and the owner confirmed the UID is the id.
const REAL_ID = "1771050325";

test("LuckyBear gets its own kind of id", () => {
  assert.equal(getProjectAccountIdKind(LUCKYBEAR), "luckybear");
  assert.equal(getProjectAccountIdKind(ROYAL), "royal");
  assert.equal(getProjectAccountIdKind(POKERDOM), "pokerdom");
});

test("a real UID survives being pasted however it was copied", () => {
  for (const raw of [REAL_ID, "  1771050325  ", "UID:1771050325", "uid: 1771050325", "#1771050325"]) {
    const result = validateProjectAccountIdFormat(raw, LUCKYBEAR);
    assert.equal(result.ok, true, raw);
    assert.equal(result.normalized, REAL_ID, raw);
  }
});

test("UIDs of other lengths seen in the base go through", () => {
  for (const raw of ["165456675", "17710503251"]) {
    assert.equal(validateProjectAccountIdFormat(raw, LUCKYBEAR).ok, true, raw);
  }
});

// What people actually typed into the LuckyBear step instead of a UID: the hex
// code, a Pokerdom id, a #XXXXX id, a name, an e-mail, a link to the bot.
test("anything with a letter in it is refused, never turned into digits", () => {
  for (const raw of [
    "165ba529-04f5",
    "6a41347e62d81bd019669ccd",
    "#SLAVA",
    "denchic15",
    "aleksejromanovic777@gmail.com",
    "https://t.me/roller_official_bot",
  ]) {
    assert.equal(validateProjectAccountIdFormat(raw, LUCKYBEAR).ok, false, raw);
  }
});

test("obvious rubbish is refused", () => {
  for (const raw of ["", "   ", "1", "12345", "привет", "-", "---", "11111111111"]) {
    assert.equal(validateProjectAccountIdFormat(raw, LUCKYBEAR).ok, false, JSON.stringify(raw));
  }
});

test("no # is bolted onto a LuckyBear id", () => {
  assert.ok(!normalizeProjectAccountId(REAL_ID, LUCKYBEAR).startsWith("#"));
});

test("a stored id is recognised later without the project to ask", () => {
  assert.equal(detectStoredProjectAccountIdKind(REAL_ID), "luckybear");
  // Saved before the UID rule, with its dash: still LuckyBear's.
  assert.equal(detectStoredProjectAccountIdKind("165ba529-04f5"), "luckybear");
  assert.equal(detectStoredProjectAccountIdKind("#FJ0UW"), "royal");
});

test("the input asks for the right thing, on a number pad, with room for a pasted label", () => {
  const config = buildProjectIdInputConfig(LUCKYBEAR);
  assert.equal(config.kind, "luckybear");
  assert.equal(config.showHashPrefix, false);
  assert.equal(config.inputMode, "numeric");
  assert.ok(config.maxlength >= "UID:1771050325".length, "вставка с «UID:» обрезалась бы полем");
  assert.equal(config.placeholder, "Введите свой ID с LuckyBear сюда");
});

// The "Мой ID" caption is gone from beside the field, so the placeholder is
// what says whose id goes in it - and it must still read without a project.
test("the placeholder names the project, and makes sense without one", () => {
  assert.equal(buildProjectIdInputConfig({ name: "BEEF", templateSlug: "beef" }).placeholder, "Введите свой ID с BEEF сюда");
  assert.equal(buildProjectIdInputConfig(null).placeholder, "Введите свой ID сюда");
  assert.equal(buildProjectIdInputConfig(LUCKYBEAR).label, "Мой ID");
});

test("the guide has both steps with pictures and asks for the UID", () => {
  const steps = buildProjectIdGuideSteps(LUCKYBEAR);
  assert.equal(steps.length, 2);
  for (const step of steps) {
    assert.ok(step.text, "шаг без текста");
    assert.match(step.imageUrl, /^\/assets\/lb_id_guide\//, "картинка не на месте");
  }
  assert.match(steps[1].text, /UID/);
  assert.match(steps[1].text, /1771050325/, "пример ID должен быть на виду");
});

test("the other brands are untouched", () => {
  assert.equal(validateProjectAccountIdFormat("#FJ0UW", ROYAL).ok, true);
  assert.equal(buildProjectIdInputConfig(ROYAL).showHashPrefix, true);
  assert.equal(validateProjectAccountIdFormat("165ba529-04f5", ROYAL).ok, false, "royal не принимает hex");
});

// #SLAVA was typed to get past the step: LuckyBear never issues an id in that
// shape.
test("an id shaped for another brand is spotted", () => {
  const { isProjectAccountIdShapeMismatched } = require("./project-account-id");
  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, "#SLAVA"), true);
  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, REAL_ID), false);
  assert.equal(isProjectAccountIdShapeMismatched(ROYAL, REAL_ID), true);
  assert.equal(isProjectAccountIdShapeMismatched(ROYAL, "#FJ0UW"), false);
  assert.equal(isProjectAccountIdShapeMismatched(POKERDOM, "#FJ0UW"), true);
});

test("an empty id is missing, not mismatched", () => {
  const { isProjectAccountIdShapeMismatched } = require("./project-account-id");
  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, ""), false);
  assert.equal(isProjectAccountIdShapeMismatched(LUCKYBEAR, null), false);
  assert.equal(isProjectAccountIdShapeMismatched(null, REAL_ID), false);
});
