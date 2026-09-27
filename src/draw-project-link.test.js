const test = require("node:test");
const assert = require("node:assert/strict");
const { describeMissingProjectLink } = require("./draw-project-link");

// On the test bot a draw went out on BEEF with no referral link: "Перейти на
// BEEF" pointed at nothing and Telegram offered to open the Mini App itself.
test("a draw on a brand without a referral link is refused, with where to add it", () => {
  const message = describeMissingProjectLink({ id: "brand_beef_1", name: "BEEF", refLink: "" });
  assert.match(message, /реф-ссылку BEEF/);
  assert.match(message, /Настройках/);
  assert.ok(describeMissingProjectLink({ name: "FUGU", refLink: "   " }), "одни пробелы — тоже нет ссылки");
});

test("a brand with a link, or no brand at all, goes ahead", () => {
  assert.equal(describeMissingProjectLink({ name: "BEEF", refLink: "https://beef.example/ref/1" }), null);
  assert.equal(describeMissingProjectLink(null), null);
});
