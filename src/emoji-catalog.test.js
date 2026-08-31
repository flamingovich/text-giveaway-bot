const test = require("node:test");
const assert = require("node:assert");
const { CATEGORIES, searchEmojis, allEmojis } = require("./emoji-catalog");

test("the catalog is worth opening", () => {
  assert.ok(allEmojis().length > 300, "several hundred, not a token handful");
  assert.ok(CATEGORIES.length >= 8);
  for (const category of CATEGORIES) {
    assert.ok(category.emojis.length > 0, `${category.label} пустая`);
    assert.ok(category.icon, `${category.label} без иконки`);
  }
});

// The organizer is Russian-speaking and will type "подарок", never "gift".
test("search speaks Russian", () => {
  assert.deepEqual(searchEmojis("подарок"), ["🎁"]);
  assert.ok(searchEmojis("огонь").includes("🔥"));
  assert.ok(searchEmojis("деньги").includes("💰"));
  assert.ok(searchEmojis("победа").includes("🏆"));
  assert.ok(searchEmojis("сердце").includes("❤️"));
});

test("a half-typed word already finds things", () => {
  assert.ok(searchEmojis("подар").includes("🎁"));
  assert.ok(searchEmojis("ракет").includes("🚀"));
  assert.ok(searchEmojis("кубо").includes("🏆"));
});

test("case does not matter", () => {
  assert.deepEqual(searchEmojis("ОГОНЬ"), searchEmojis("огонь"));
});

test("pasting the emoji itself finds it", () => {
  assert.ok(searchEmojis("🎁").includes("🎁"));
});

test("an empty query is not a search", () => {
  assert.deepEqual(searchEmojis(""), []);
  assert.deepEqual(searchEmojis("   "), []);
  assert.deepEqual(searchEmojis(null), []);
});

test("nonsense finds nothing rather than everything", () => {
  assert.deepEqual(searchEmojis("щщщхыв"), []);
});

test("the giveaway ones come first, because that is what the field is for", () => {
  assert.equal(CATEGORIES[0].id, "giveaway");
  const first = CATEGORIES[0].emojis.map(([emoji]) => emoji);
  for (const must of ["🎁", "🏆", "💎", "🔥", "🎉"]) {
    assert.ok(first.includes(must), `${must} должен быть в первой категории`);
  }
});

test("no emoji is listed twice in one category", () => {
  for (const category of CATEGORIES) {
    const seen = new Set();
    for (const [emoji] of category.emojis) {
      assert.ok(!seen.has(emoji), `${emoji} дублируется в «${category.label}»`);
      seen.add(emoji);
    }
  }
});

test("every entry has real keywords", () => {
  for (const category of CATEGORIES) {
    for (const [emoji, keywords] of category.emojis) {
      assert.ok(emoji && emoji.length <= 8, `странный символ: ${JSON.stringify(emoji)}`);
      assert.ok(String(keywords).trim().length > 2, `${emoji} без ключевых слов`);
      assert.ok(/^[а-яёa-z0-9 +-]+$/i.test(keywords), `${emoji}: посторонние символы в «${keywords}»`);
    }
  }
});
