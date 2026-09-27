const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./admin-charts");

test("the axis top is a round number just above the peak", () => {
  assert.equal(C.niceMax(347), 400);
  assert.equal(C.niceMax(12606), 16000);
  assert.equal(C.niceMax(0), 4, "пустой график всё равно получает шкалу");
  assert.equal(C.niceMax(-3), 4);
});

// A count cannot dip below zero between two days: the curve must not overshoot.
test("the smooth line passes through every point and never overshoots a flat run", () => {
  const path = C.monotonePath([[0, 100], [500, 100], [1000, 20]]);
  assert.match(path, /^M0,100 /);
  assert.match(path, / 500,100 /);
  assert.match(path, / 1000,20$/);
  // Between two equal points the controls stay on the same level.
  const flat = path.split(" C")[1];
  assert.ok(flat.split(" ").every((pair) => Number(pair.split(",")[1]) === 100), flat);
});

test("labels reach the page as text, never as markup", () => {
  const html = C.areaChart({
    labels: ["<script>alert(1)</script>", "2"],
    series: [{ name: "<b>x</b>", values: [1, 2] }],
  });
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(!html.includes("<b>x</b>"));
  const cols = C.columns([{ label: "<img src=x>", value: 3 }]);
  assert.ok(!cols.includes("<img src=x>"));
});

test("empty data draws a calm placeholder, not a broken chart", () => {
  assert.match(C.areaChart({ labels: ["a", "b"], series: [{ name: "n", values: [0, 0] }] }), /Данных пока нет/);
  assert.match(C.columns([]), /Данных пока нет/);
  assert.match(C.shareBar([{ label: "x", value: 0 }]), /Данных пока нет/);
  assert.match(C.hbars([]), /Данных пока нет/);
});

test("a ring never draws past a full circle", () => {
  const over = C.ring(180);
  assert.match(over, /100%/);
  const offset = Number(/stroke-dashoffset:([\d.]+)/.exec(over)[1]);
  assert.equal(offset, 0);
});

test("the running total gets an axis of its own on the right", () => {
  const html = C.areaChart({
    labels: ["1", "2", "3"],
    series: [
      { name: "за день", values: [3, 5, 2] },
      { name: "всего", values: [700, 705, 707], axis: "right", dashed: true },
    ],
  });
  assert.match(html, /has-right/);
  assert.match(html, /ac-yr/);
});
