const test = require("node:test");
const assert = require("node:assert");
const { keepLayout, splitDeclarations } = require("./css-layout-filter");

test("where things sit survives", () => {
  const out = keepLayout(".a { position: absolute; top: 0; display: grid; gap: 8px; margin: 4px; padding: 12px; width: 100%; }");
  for (const kept of ["position: absolute", "top: 0", "display: grid", "gap: 8px", "margin: 4px", "padding: 12px", "width: 100%"]) {
    assert.ok(out.includes(kept), `пропало: ${kept}`);
  }
});

test("what things look like is removed", () => {
  const out = keepLayout(".a { color: red; background: blue; border: 1px solid; border-radius: 8px; box-shadow: 0 0 1px; font-size: 12px; font-weight: 700; letter-spacing: 1px; }");
  assert.equal(out.trim(), "", "визуального не должно остаться ничего");
});

// Hiding a step, showing the active one, a modal that is closed - these are
// the logic of the flow, and losing them breaks it rather than restyling it.
test("state and visibility survive", () => {
  const out = keepLayout(".card { visibility: hidden; opacity: 0; pointer-events: none; } .card.is-active { visibility: visible; opacity: 1; }");
  assert.ok(out.includes("visibility: hidden"));
  assert.ok(out.includes("opacity: 0"));
  assert.ok(out.includes("pointer-events: none"));
  assert.ok(out.includes(".card.is-active{visibility: visible"));
});

test("decorative motion goes, meaningful motion stays", () => {
  const out = keepLayout(
    ".shine { animation: shimmer 3s infinite; } .join-btn-spinner { animation: join-btn-spin .75s linear infinite; }",
  );
  assert.ok(!out.includes("shimmer 3s"), "декоративная анимация должна уйти");
  assert.ok(out.includes("join-btn-spin"), "спиннер обязан остаться — он говорит «подождите»");
});

// The organiser gate went blank: its card starts at opacity 0 and only a
// one-shot entrance brings it in. Losing that animation hid the whole screen.
test("a one-shot entrance survives, so what it reveals is not left invisible", () => {
  const out = keepLayout(".shell { opacity: 0; transform: translateY(8px); animation: page-in .32s ease forwards; }");
  assert.ok(out.includes("page-in .32s"), "разовая анимация появления обязана остаться");
});

test("a loop split across longhands is still a loop", () => {
  const out = keepLayout(".halo { animation-name: glow; animation-duration: 3s; animation-iteration-count: infinite; width: 10px; }");
  assert.ok(!out.includes("glow"), "бесконечный цикл, записанный по частям, тоже декоративный");
  assert.ok(out.includes("width: 10px"), "размер при этом остаётся");
});

test("an @import in front does not swallow the rule after it", () => {
  const out = keepLayout("@import url('https://fonts.example/inter.css');\n:root { --pad: 12px; --bg: #fff; }\n.a { padding: var(--pad); }");
  assert.ok(out.includes(":root{--pad: 12px"), "переменные :root обязаны остаться");
  assert.ok(!out.includes("@import"), "подключение старого шрифта уходит");
});

test("keyframes are kept whole", () => {
  const out = keepLayout("@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }");
  assert.ok(out.includes("@keyframes spin"));
  assert.ok(out.includes("rotate(360deg)"));
});

test("media queries are filtered inside, not dropped", () => {
  const out = keepLayout("@media (max-width: 400px) { .a { color: red; display: none; } }");
  assert.ok(out.includes("@media (max-width: 400px)"));
  assert.ok(out.includes("display: none"));
  assert.ok(!out.includes("color: red"));
});

test("a rule left with nothing is dropped entirely", () => {
  assert.equal(keepLayout(".only-paint { color: red; background: blue; }").trim(), "");
});

// url() and var() fallbacks carry colons and semicolons of their own.
test("declarations are split without breaking url() or var()", () => {
  const parts = splitDeclarations("background: url('a;b:c.png'); width: var(--w, calc(100% - 2px)); top: 0");
  assert.deepEqual(parts, ["background: url('a;b:c.png')", "width: var(--w, calc(100% - 2px))", "top: 0"]);
});

test("comments do not leak through", () => {
  assert.ok(!keepLayout("/* note: { } */ .a { top: 0; }").includes("note"));
});

test("border-collapse is layout, not paint", () => {
  assert.ok(keepLayout(".t { border-collapse: collapse; }").includes("border-collapse"));
});

test("the real join stylesheet keeps its mechanics", () => {
  const { getJoinFlowStyles } = require("./miniapp-ui");
  const out = keepLayout(getJoinFlowStyles());
  assert.ok(out.includes(".join-step-card.is-active"), "активный шаг");
  assert.ok(out.includes("visibility: hidden"), "скрытые шаги");
  assert.ok(!/background:\s*linear-gradient\(\s*90deg,\s*#ff6b9d/.test(out), "радуга должна уйти");
  assert.ok(!/\bcolor:\s*#/.test(out), "ни одного старого цвета");
});
