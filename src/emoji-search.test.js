const test = require("node:test");
const assert = require("node:assert");
const data = require("../assets/emoji/emoji-data.json");
const { CATEGORIES } = require("./emoji-catalog");
const {
  createEmojiSearch,
  prepareEmojiIndex,
  searchEmoji,
  bareEmoji,
  swapKeyboardLayout,
} = require("./emoji-search");

const index = prepareEmojiIndex(data.items);
const giveaway = CATEGORIES.find((category) => category.id === "giveaway").emojis.map(([emoji]) => emoji);
const favored = Object.fromEntries(giveaway.map((emoji) => [bareEmoji(emoji), 1]));
const find = (query, limit = 12) => searchEmoji(index, query, { favored, limit });

test("the picker offers the whole set, not a curated handful", () => {
  assert.ok(data.items.length > 1800, `всего ${data.items.length}`);
  assert.equal(data.groups.length, 9);
  for (let group = 0; group < data.groups.length; group++) {
    assert.ok(data.items.some((item) => item[1] === group), `раздел «${data.groups[group].label}» пустой`);
  }
  const seen = new Set();
  for (const [emoji] of data.items) {
    assert.ok(!seen.has(bareEmoji(emoji)), `${emoji} дважды`);
    seen.add(bareEmoji(emoji));
  }
});

// The giveaway row and the search boost both rely on these being in the set.
test("every giveaway emoji is in the full set", () => {
  const all = new Set(data.items.map(([emoji]) => bareEmoji(emoji)));
  for (const emoji of giveaway) assert.ok(all.has(bareEmoji(emoji)), `${emoji} нет в наборе`);
});

// emojibase adds the variation selector even where it changes nothing, and it
// would sit in the post title as an invisible character.
test("an emoji carries a variation selector only when it needs one", () => {
  const byBare = new Map(data.items.map(([emoji]) => [bareEmoji(emoji), emoji]));
  assert.equal(byBare.get("💰"), "💰");
  assert.equal(byBare.get("🔥"), "🔥");
  assert.equal(byBare.get("❤"), "❤" + String.fromCharCode(0xfe0f), "у текстового сердца селектор нужен");
});

test("Russian words find the emoji first", () => {
  assert.equal(find("подарок")[0], "🎁");
  assert.equal(find("огонь")[0], "🔥");
  assert.equal(find("кубок")[0], "🏆");
  assert.equal(find("казино")[0], "🎰");
  assert.equal(find("флаг россии")[0], "🇷🇺");
});

test("the giveaway words an organiser types are there", () => {
  assert.ok(find("розыгрыш").includes("🎁"));
  assert.ok(find("джекпот").includes("🎰"));
  assert.ok(find("покер").includes("🃏"));
  assert.deepEqual(find("бабки"), ["💰"]);
});

test("English works too", () => {
  assert.equal(find("fire")[0], "🔥");
  assert.equal(find("gift")[0], "🎁");
});

test("other forms of a word find it", () => {
  assert.ok(find("ракеты").includes("🚀"));
  assert.ok(find("подарки").includes("🎁"));
  assert.ok(find("денег").includes("💰"));
});

// A three-letter root on every query drowned the answer: "огонь" brought the
// frowning faces of "огорчение" along with the fire.
test("a short root is a fallback, not noise on every query", () => {
  const fire = find("огонь", 200);
  assert.ok(!fire.includes("😕"), fire.join(""));
});

test("the wrong keyboard layout is understood", () => {
  assert.equal(swapKeyboardLayout("gjlfhjr"), "подарок");
  assert.equal(swapKeyboardLayout("ашку"), "fire");
  assert.equal(find("gjlfhjr")[0], "🎁");
  assert.equal(find("ашку")[0], "🔥");
});

test("one typo is forgiven", () => {
  assert.equal(find("подорок")[0], "🎁");
  assert.ok(find("сердцэ").length > 0);
});

test("a flag is found by its country code and everyday name", () => {
  assert.equal(find("ru")[0], "🇷🇺");
  assert.equal(find("usa")[0], "🇺🇸");
  // Not the outlying islands, whose name ends in "(США)".
  assert.equal(find("сша")[0], "🇺🇸");
});

test("a pasted emoji finds itself", () => {
  assert.deepEqual(find("🎁"), ["🎁"]);
});

test("an empty query is not a search, nonsense finds nothing", () => {
  assert.deepEqual(find(""), []);
  assert.deepEqual(find("   "), []);
  assert.deepEqual(find(null), []);
  assert.deepEqual(find("щщщхыв"), []);
});

test("the giveaway set wins a tie", () => {
  const tie = prepareEmojiIndex([
    ["🅰", 0, "звезда", ""],
    ["🅱", 0, "звезда", ""],
  ]);
  assert.deepEqual(searchEmoji(tie, "звезда"), ["🅰", "🅱"]);
  assert.deepEqual(searchEmoji(tie, "звезда", { favored: { "🅱": 1 } }), ["🅱", "🅰"]);
});

// The browser gets the function's source and nothing else (emoji-picker.js):
// anything it reached for outside itself would be missing there.
test("the search runs from its own source alone", () => {
  const standalone = new Function(`return (${createEmojiSearch.toString()})();`)();
  const again = standalone.prepare(data.items);
  for (const query of ["подарок", "gjlfhjr", "подорок", "флаг россии"]) {
    assert.deepEqual(standalone.search(again, query, { favored }), searchEmoji(index, query, { favored }));
  }
});
