const test = require("node:test");
const assert = require("node:assert/strict");
const { renderLandingPage } = require("./landing-page");

// A page that throws or prints "undefined" passes every unit test around it
// and still greets people with a broken first screen.
test("the landing renders whole, with its sections and no holes", () => {
  const html = renderLandingPage({ botUsername: "roller_official_bot" });
  for (const part of ["Розыгрыши, которые приводят рефералов.", "20+ казино-проектами", "Пять шагов", "Один доступ", "Вопросы и ответы", "18+"]) {
    assert.ok(html.includes(part), part);
  }
  assert.ok(!/undefined|NaN|\[object Object\]/.test(html));
  assert.match(html, /href="https:\/\/t\.me\/rollerbot_support_bot"/);
  assert.match(html, /href="https:\/\/t\.me\/roller_official_bot"/);
});

test("the bot's name reaches the page as text", () => {
  const html = renderLandingPage({ botUsername: '"><script>x</script>' });
  assert.ok(!html.includes("<script>x</script>"));
});
