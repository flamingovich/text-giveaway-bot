const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlannerTokens, getPlannerCanvas } = require("./planner-theme");

function declared(css, selector, property) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `нет блока ${selector}`);
  const block = css.slice(start, css.indexOf("}", start));
  const match = new RegExp(`${property.replace(/[-]/g, "\\-")}:\\s*([^;]+);`).exec(block);
  assert.ok(match, `${property} не задан в ${selector}`);
  return match[1].trim();
}

// Pulled past its end, the page shows the canvas behind it. The body's palette
// cannot reach up there, so its colours are named twice, and the two must not
// drift apart: a black band would show under a slate page.
test("the canvas past the page's end is the page's own colour in both themes", () => {
  const tokens = getPlannerTokens("body");
  const canvas = getPlannerCanvas("body");
  assert.equal(declared(canvas, "html", "background-color"), declared(tokens, "body", "--bg"));
  assert.equal(
    declared(canvas, 'html[data-app-theme="dark"]', "background-color"),
    declared(tokens, "body.app-theme-dark", "--bg"),
  );
});

test("the dark theme is Telegram's slate, not black", () => {
  const dark = (property) => declared(getPlannerTokens("body"), "body.app-theme-dark", property);
  assert.notEqual(dark("--bg").toUpperCase(), "#000000", "чёрный фон владелец отверг");
  assert.equal(dark("--bg").toUpperCase(), "#0E1621");
  assert.equal(dark("--bg-elevated").toUpperCase(), "#17212B");
});
