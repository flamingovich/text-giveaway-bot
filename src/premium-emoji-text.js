// Premium (custom) emoji for the messages the bot writes to people.
//
// Two things live here. The ids, so a wording change never means hunting for a
// number in the middle of a template. And a way to take them back out again.
//
// The second part is not decoration. A custom emoji is an entity Telegram may
// refuse, and these are the messages that tell somebody they won money: a
// refused message is a winner who is never told. Everywhere they are sent, the
// send is retried without them rather than allowed to fail - see
// sendHtmlWithEmojiFallback in index.js. The draw post has no such fallback and
// CLAUDE.md records that as an open hole; this is the same hole, closed, for
// direct messages.

const DM_EMOJI = {
  check: { id: "5980930633298350051", char: "✅" },
  red: { id: "5226494081290490824", char: "🔴" },
  cross: { id: "5454023122007115879", char: "❌" },
  down: { id: "5771449161123631882", char: "⬇️" },
  party: { id: "5208541126583136130", char: "🎉" },
  trophy: { id: "5188344996356448758", char: "🏆" },
  brokenHeart: { id: "5273842895978251304", char: "💔" },
  shield: { id: "5384173854123903815", char: "🛡" },
  phone: { id: "5307746710682869587", char: "📞" },
  coffin: { id: "5463186335948878489", char: "⚰️" },
  alarm: { id: "5269337080147748373", char: "⏰" },
  sadFace: { id: "5454086459889821382", char: "☹️" },
  hourglass: { id: "5386367538735104399", char: "⌛" },
  plus: { id: "5253652327734192243", char: "➕" },
  equals: { id: "5256211853364701972", char: "🟰" },
  question: { id: "5210880311801423356", char: "🔤" },
};

// The captcha prints two random digits, so the whole run of them is needed.
// Resolved from the same pack the owner's own draft used (CyrillicFont), via
// getCustomEmojiStickers on one of their ids - guessing would have produced
// keycaps in a different style next to theirs.
const DIGIT_EMOJI = [
  { id: "5238055991517390123", char: "0️⃣" },
  { id: "5235776368905562305", char: "1️⃣" },
  { id: "5237704680372447424", char: "2️⃣" },
  { id: "5238044171767393675", char: "3️⃣" },
  { id: "5235533321001250232", char: "4️⃣" },
  { id: "5238171599152097811", char: "5️⃣" },
  { id: "5235500881113263583", char: "6️⃣" },
  { id: "5237875542761417785", char: "7️⃣" },
  { id: "5238067300166281132", char: "8️⃣" },
  { id: "5237872922831367023", char: "9️⃣" },
];

function tgEmoji(entry) {
  if (!entry?.id) {
    return "";
  }
  return `<tg-emoji emoji-id="${entry.id}">${entry.char}</tg-emoji>`;
}

function emoji(name) {
  return tgEmoji(DM_EMOJI[name]);
}

// A number as premium keycaps. Anything that is not a digit is dropped rather
// than passed through: only the captcha uses this, and it only ever has digits.
function digits(value) {
  return String(value)
    .split("")
    .filter((ch) => ch >= "0" && ch <= "9")
    .map((ch) => tgEmoji(DIGIT_EMOJI[Number(ch)]))
    .join("");
}

const TG_EMOJI_TAG = /<tg-emoji\s+emoji-id="[^"]*"\s*>([\s\S]*?)<\/tg-emoji>/g;

// Leaves the ordinary emoji that sat inside the tag, so the message still reads
// the same - it just stops being premium.
function stripPremiumEmoji(html) {
  return String(html || "").replace(TG_EMOJI_TAG, "$1");
}

function hasPremiumEmoji(html) {
  return /<tg-emoji\s/.test(String(html || ""));
}

module.exports = {
  DM_EMOJI,
  DIGIT_EMOJI,
  emoji,
  digits,
  tgEmoji,
  stripPremiumEmoji,
  hasPremiumEmoji,
};
