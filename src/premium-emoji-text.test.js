const test = require("node:test");
const assert = require("node:assert");
const {
  DM_EMOJI,
  DIGIT_EMOJI,
  emoji,
  digits,
  stripPremiumEmoji,
  hasPremiumEmoji,
} = require("./premium-emoji-text");

test("an emoji renders as the tag Telegram expects", () => {
  assert.strictEqual(emoji("check"), '<tg-emoji emoji-id="5980930633298350051">✅</tg-emoji>');
});

test("an unknown name renders as nothing rather than a broken tag", () => {
  assert.strictEqual(emoji("nope"), "");
});

test("the captcha can print every digit it is able to generate", () => {
  // buildCaptchaTask picks a in 2..9 and b in 1..8, so a missing id anywhere in
  // that range would show up as a hole in the win message.
  for (let n = 0; n <= 9; n += 1) {
    assert.match(digits(n), /^<tg-emoji emoji-id="\d+">/, `нет эмодзи для ${n}`);
  }
  assert.strictEqual(DIGIT_EMOJI.length, 10);
});

test("a multi-digit number becomes one keycap per digit", () => {
  const rendered = digits(12);
  assert.strictEqual((rendered.match(/<tg-emoji/g) || []).length, 2);
  assert.ok(rendered.includes(DIGIT_EMOJI[1].id));
  assert.ok(rendered.includes(DIGIT_EMOJI[2].id));
});

test("stripping leaves the plain emoji, so the text still reads the same", () => {
  const html = `${emoji("party")} <b>Вы выиграли</b>`;
  assert.strictEqual(stripPremiumEmoji(html), "🎉 <b>Вы выиграли</b>");
});

test("stripping handles several tags and the surrounding markup", () => {
  const html = `${emoji("down")}<b>Нажмите кнопку ниже </b>${emoji("down")}`;
  assert.strictEqual(stripPremiumEmoji(html), "⬇️<b>Нажмите кнопку ниже </b>⬇️");
});

test("stripping a captcha line keeps every digit", () => {
  const line = `${digits(8)}${emoji("plus")}${digits(3)}${emoji("equals")}${emoji("question")}`;
  assert.strictEqual(stripPremiumEmoji(line), "8️⃣➕3️⃣🟰🔤");
  assert.strictEqual(hasPremiumEmoji(stripPremiumEmoji(line)), false);
});

test("text with nothing premium in it is left exactly as it was", () => {
  const html = "<b>Вы уже участвуете</b>";
  assert.strictEqual(stripPremiumEmoji(html), html);
  assert.strictEqual(hasPremiumEmoji(html), false);
});

test("every id is a plain number and every entry has a fallback character", () => {
  // A malformed id makes Telegram reject the whole message, and an empty
  // fallback would leave a gap once the tag is stripped.
  for (const [name, entry] of Object.entries(DM_EMOJI)) {
    assert.match(entry.id, /^\d+$/, `${name}: id`);
    assert.ok(entry.char.length > 0, `${name}: char`);
  }
  for (const entry of DIGIT_EMOJI) {
    assert.match(entry.id, /^\d+$/);
    assert.ok(entry.char.length > 0);
  }
});
