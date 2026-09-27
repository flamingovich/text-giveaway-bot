#!/usr/bin/env node
// Builds assets/emoji/emoji-data.json, every emoji the post-title picker offers,
// from emojibase-data (MIT, https://emojibase.dev) - its Russian and English
// names and tags - plus the giveaway words of src/emoji-catalog.js.
//
// emojibase-data is fifty megabytes of every locale, so it is not a dependency
// of the project; the output is small and committed. To rebuild:
//
//   npm install --prefix /tmp/emojibase emojibase-data@17
//   node scripts/build-emoji-data.js /tmp/emojibase/node_modules/emojibase-data
//
// Emoji newer than Unicode 15.0 are left out on purpose: the picker draws them
// with the phone's own font, and on a phone a year or two old they come out as
// empty boxes.

const fs = require("fs");
const path = require("path");
const { CATEGORIES } = require("../src/emoji-catalog");
const { normalizeEmojiText } = require("../src/emoji-search");

const MAX_VERSION = 15;

// emojibase's groups in the order iOS shows them, with our own names: its
// Russian ones are machine-made ("варианты досуга").
const GROUPS = [
  { source: 0, id: "smileys", label: "Смайлики", icon: "😀" },
  { source: 1, id: "people", label: "Люди и жесты", icon: "👋" },
  { source: 3, id: "nature", label: "Животные и природа", icon: "🐻" },
  { source: 4, id: "food", label: "Еда и напитки", icon: "🍔" },
  { source: 6, id: "activity", label: "Занятия и спорт", icon: "⚽" },
  { source: 5, id: "travel", label: "Путешествия", icon: "✈️" },
  { source: 7, id: "objects", label: "Предметы", icon: "💡" },
  { source: 8, id: "symbols", label: "Символы", icon: "💯" },
  { source: 9, id: "flags", label: "Флаги", icon: "🏁" },
];

// The variation selector is part of some emojibase strings and none of ours.
const VARIATION_SELECTOR = String.fromCharCode(0xfe0f);
const bare = (emoji) => String(emoji).split(VARIATION_SELECTOR).join("");

// emojibase puts the variation selector after every emoji that also has a text
// form, even where the emoji form is already the default (type 1): "💰" comes
// as "💰" plus an invisible character that would then sit in the post title.
// Its hexcode is the sequence without the redundant selectors.
function canonical(entry) {
  if (entry.type !== 1) return entry.emoji;
  return String.fromCodePoint(...entry.hexcode.split("-").map((hex) => parseInt(hex, 16)));
}

// A country flag is two regional letters, which spell its ISO code: people type
// "ru" or "us" as often as the country's name.
const REGIONAL_A = 0x1f1e6;
function flagCode(entry) {
  const points = entry.hexcode.split("-").map((hex) => parseInt(hex, 16));
  if (points.length !== 2 || points.some((point) => point < REGIONAL_A || point > REGIONAL_A + 25)) return "";
  return points.map((point) => String.fromCharCode(point - REGIONAL_A + 97)).join("");
}

// The names the countries go by in conversation, where the official one is
// not what anybody types.
const FLAG_WORDS = {
  us: "сша usa америка штаты",
  gb: "англия британия uk",
  ru: "рф",
  ae: "оаэ эмираты дубай",
};

function main() {
  const dir = process.argv[2] || path.join(__dirname, "..", "node_modules", "emojibase-data");
  const ru = JSON.parse(fs.readFileSync(path.join(dir, "ru", "data.json"), "utf8"));
  const en = JSON.parse(fs.readFileSync(path.join(dir, "en", "data.json"), "utf8"));
  const english = new Map(en.map((entry) => [entry.hexcode, entry]));

  const ours = new Map();
  for (const category of CATEGORIES) {
    for (const [emoji, words] of category.emojis) {
      const key = bare(emoji);
      ours.set(key, `${ours.get(key) || ""} ${words}`.trim());
    }
  }

  const groupIndex = new Map(GROUPS.map((group, index) => [group.source, index]));
  const items = ru
    .filter((entry) => groupIndex.has(entry.group) && Number(entry.version) <= MAX_VERSION)
    .sort((a, b) => GROUPS.findIndex((g) => g.source === a.group) - GROUPS.findIndex((g) => g.source === b.group) || a.order - b.order)
    .map((entry) => {
      const other = english.get(entry.hexcode) || {};
      const code = flagCode(entry);
      // What a name says in brackets only clarifies it, so it searches as a
      // tag; the everyday names count as the name itself. Both for one reason:
      // "сша" has to put the United States ahead of "Внешние малые острова
      // (США)" and "Виргинские о-ва (США)".
      const bracketed = (entry.label.match(/\(([^)]*)\)/g) || []).join(" ");
      const label = normalizeEmojiText(`${entry.label.replace(/\([^)]*\)/g, " ")} ${FLAG_WORDS[code] || ""}`);
      const labelWords = new Set(label.split(" "));
      const words = new Set();
      for (const text of [...(entry.tags || []), bracketed, other.label || "", ...(other.tags || []), ours.get(bare(entry.emoji)) || "", code]) {
        for (const word of normalizeEmojiText(text).split(" ")) {
          if (word && !labelWords.has(word)) words.add(word);
        }
      }
      return [canonical(entry), groupIndex.get(entry.group), label, [...words].join(" ")];
    });

  const out = {
    source: "emojibase-data 17 (MIT) + src/emoji-catalog.js",
    groups: GROUPS.map(({ id, label, icon }) => ({ id, label, icon })),
    items,
  };
  const target = path.join(__dirname, "..", "assets", "emoji", "emoji-data.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out));
  console.log(`${items.length} эмодзи → ${path.relative(process.cwd(), target)} (${Math.round(fs.statSync(target).size / 1024)} КБ)`);
}

main();
