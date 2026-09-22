const test = require("node:test");
const assert = require("node:assert/strict");

const {
  richHtmlFromEntities,
  padButtonLabel,
  buttonRowHtml,
  buildRichPostHtml,
  PAD_SPACE,
} = require("./rich-post");
const { buildDrawPostCaptionPayload, buildDrawPostFinishedPayload } = require("./draw-post-emojis");

// What a reader sees: tags gone, paragraphs and <br> back to line breaks.
function visibleText(html) {
  return html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>|<\/blockquote>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function withoutBlankLines(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}

test("plain lines become paragraphs, blank lines are just spacing", () => {
  assert.equal(richHtmlFromEntities("Первая\n\nВторая", []), "<p>Первая</p>\n<p>Вторая</p>");
  assert.equal(richHtmlFromEntities("", []), "");
  assert.equal(richHtmlFromEntities("\n\n", []), "");
});

test("bold, links and unknown styles", () => {
  const text = "Жми сюда";
  assert.equal(
    richHtmlFromEntities(text, [{ type: "bold", offset: 0, length: 3 }]),
    "<p><b>Жми</b> сюда</p>",
  );
  assert.equal(
    richHtmlFromEntities(text, [{ type: "text_link", offset: 4, length: 4, url: "https://t.me/x" }]),
    '<p>Жми <a href="https://t.me/x">сюда</a></p>',
  );
  assert.equal(
    richHtmlFromEntities(text, [{ type: "pre", offset: 0, length: 3 }]),
    "<p>Жми сюда</p>",
    "a style with no place in a rich post leaves the words alone",
  );
});

test("a blockquote keeps its own line breaks and the styles inside it", () => {
  const text = "Шапка\n👥 Мест: 1\n⏰ Итоги через 2 дня\nХвост";
  const entities = [
    { type: "blockquote", offset: 6, length: 30 },
    { type: "bold", offset: 15, length: 1 },
    { type: "bold", offset: 31, length: 5 },
  ];
  assert.equal(
    richHtmlFromEntities(text, entities),
    "<p>Шапка</p>\n<blockquote>👥 Мест: <b>1</b><br>⏰ Итоги через <b>2 дня</b></blockquote>\n<p>Хвост</p>",
  );
});

test("an expandable blockquote says so", () => {
  const html = richHtmlFromEntities("Правила тут", [{ type: "expandable_blockquote", offset: 0, length: 11 }]);
  assert.equal(html, "<blockquote expandable>Правила тут</blockquote>");
});

test("offsets are counted the way Telegram counts them, past emoji too", () => {
  const text = "🎁 РОЗЫГРЫШ НА 50$";
  // The gift takes two code units, so "РОЗЫГРЫШ" starts at 3.
  const html = richHtmlFromEntities(text, [{ type: "bold", offset: 3, length: 8 }]);
  assert.equal(html, "<p>🎁 <b>РОЗЫГРЫШ</b> НА 50$</p>");
  assert.equal(visibleText(html), text);
});

test("angle brackets and quotes in the text and in a link cannot break the markup", () => {
  const text = 'Приз <b>500</b> & "золото"';
  const html = richHtmlFromEntities(text, [
    { type: "text_link", offset: 0, length: 4, url: 'https://t.me/a?b=1&c="x"<y>' },
  ]);
  assert.equal(
    html,
    '<p><a href="https://t.me/a?b=1&amp;c=&quot;x&quot;&lt;y&gt;">Приз</a> &lt;b&gt;500&lt;/b&gt; &amp; &quot;золото&quot;</p>',
  );
  assert.equal(visibleText(html), text);
});

test("premium emoji: dropped for the channel, kept when asked for", () => {
  const entity = { type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "5368324170671202286" };
  assert.equal(richHtmlFromEntities("🎁 приз", [entity]), "<p>🎁 приз</p>");
  assert.equal(
    richHtmlFromEntities("🎁 приз", [entity], { keepCustomEmoji: true }),
    '<p><tg-emoji emoji-id="5368324170671202286">🎁</tg-emoji> приз</p>',
  );
});

test("entities in any order, nested to any depth", () => {
  const text = "Итоги через 2 дня";
  const html = richHtmlFromEntities(text, [
    { type: "italic", offset: 12, length: 1 },
    { type: "bold", offset: 12, length: 5 },
    { type: "blockquote", offset: 0, length: 17 },
  ]);
  assert.equal(html, "<blockquote>Итоги через <b><i>2</i> дня</b></blockquote>");
});

test("a style spanning several lines is applied line by line", () => {
  const html = richHtmlFromEntities("Первая\nВторая", [{ type: "bold", offset: 0, length: 13 }]);
  assert.equal(html, "<p><b>Первая</b></p>\n<p><b>Вторая</b></p>");
});

test("a style that runs out of the one around it is dropped, not mangled", () => {
  const html = richHtmlFromEntities("абвгде", [
    { type: "bold", offset: 0, length: 3 },
    { type: "italic", offset: 1, length: 4 },
  ]);
  assert.equal(html, "<p><b>абв</b>где</p>");
});

test("a style reaching past the end of the text is cut to it", () => {
  assert.equal(richHtmlFromEntities("абв", [{ type: "bold", offset: 0, length: 99 }]), "<p><b>абв</b></p>");
  assert.equal(richHtmlFromEntities("абв", [{ type: "bold", offset: 5, length: 3 }]), "<p>абв</p>");
});

test("button label is padded so the button fills the post", () => {
  assert.equal(padButtonLabel("🎁 Участвую (147)"), `${PAD_SPACE}${PAD_SPACE}🎁 Участвую (147)${PAD_SPACE}${PAD_SPACE}`);
  assert.equal(padButtonLabel("x", 0), "x");
  assert.equal(padButtonLabel("", 1), `${PAD_SPACE}${PAD_SPACE}`);
});

test("button row: style, escaping, several buttons, nothing to show", () => {
  assert.equal(
    buttonRowHtml([{ text: "🎁 Участвую (1)", url: "https://t.me/bot/join?startapp=a&b=1", style: "success" }]),
    '<tg-button-row><tg-button type="url" style="success" url="https://t.me/bot/join?startapp=a&amp;b=1">🎁 Участвую (1)</tg-button></tg-button-row>',
  );
  assert.equal(
    buttonRowHtml([{ text: "A", url: "https://a" }, { text: "B", url: "https://b" }], { align: "center" }),
    '<tg-button-row align="center"><tg-button type="url" url="https://a">A</tg-button><tg-button type="url" url="https://b">B</tg-button></tg-button-row>',
  );
  assert.equal(buttonRowHtml([]), "");
  assert.equal(buttonRowHtml([{ text: "Нет ссылки" }, null]), "", "a button that leads nowhere is not shown");
});

test("the whole post: cover, text, button", () => {
  const html = buildRichPostHtml({
    text: "Приз\nЖми",
    entities: [{ type: "bold", offset: 0, length: 4 }],
    coverMediaId: "cover",
    buttons: [{ text: "Участвую", url: "https://t.me/x", style: "success" }],
  });
  assert.equal(
    html,
    '<img src="tg://photo?id=cover"/>\n<p><b>Приз</b></p>\n<p>Жми</p>\n<tg-button-row><tg-button type="url" style="success" url="https://t.me/x">Участвую</tg-button></tg-button-row>',
  );
  assert.equal(
    buildRichPostHtml({ text: "Приз", entities: [] }),
    "<p>Приз</p>",
    "no cover and no button is still a post",
  );
});

test("the live draw post keeps every word it has today", () => {
  const payload = buildDrawPostCaptionPayload({
    usePremiumEmoji: false,
    prizeLabel: "50$",
    winnersCount: 1,
    durationLabel: "2 дня",
    endManual: false,
    postTitle: "Обмотки рук | Скотч",
    projectLine: null,
  });
  const html = richHtmlFromEntities(payload.caption, payload.caption_entities);
  assert.equal(visibleText(html), withoutBlankLines(payload.caption));
  assert.equal(
    html,
    [
      "<p><b>Обмотки рук | Скотч</b></p>",
      "<p><b>🎁 РОЗЫГРЫШ НА 50$</b></p>",
      "<blockquote>👥 Призовых мест: <b>1</b><br>⏰ Итоги через <b>2 дня</b></blockquote>",
      "<p><b>👇 Жми кнопку, для участия 👇</b></p>",
    ].join("\n"),
  );
});

test("the same post with premium emoji on keeps them out of the channel copy", () => {
  const payload = buildDrawPostCaptionPayload({
    usePremiumEmoji: true,
    prizeLabel: "50$",
    winnersCount: 1,
    durationLabel: "2 дня",
    endManual: false,
    postTitle: "",
    projectLine: null,
  });
  const html = richHtmlFromEntities(payload.caption, payload.caption_entities);
  assert.ok(!html.includes("tg-emoji"), "no premium emoji in a channel post");
  assert.equal(visibleText(html), withoutBlankLines(payload.caption));
});

test("the finished post keeps its winners, their links and its words", () => {
  const payload = buildDrawPostFinishedPayload({
    prizeLabel: "50$",
    winners: [
      { displayName: "Kiril", url: "https://t.me/Kirilcki" },
      { displayName: "Мария", url: "" },
    ],
    resultsUrl: "",
    postTitle: "Обмотки рук | Скотч",
    projectLine: null,
  });
  const html = richHtmlFromEntities(payload.caption, payload.caption_entities);
  assert.equal(visibleText(html), withoutBlankLines(payload.caption));
  assert.ok(html.includes('<a href="https://t.me/Kirilcki">Kiril</a>'));
  assert.ok(html.includes("Мария"));
  assert.ok(!html.includes("Проверить"), "the results link is a button now, not a line of text");
});

test("a draw with a project line and a manual finish converts too", () => {
  const payload = buildDrawPostCaptionPayload({
    usePremiumEmoji: false,
    prizeLabel: "10 000 ₽",
    winnersCount: 3,
    durationLabel: "",
    endManual: true,
    postTitle: "Розыгрыш недели",
    projectLine: { name: "Pokerdom", url: "https://example.com/ref", emoji: "🎰" },
  });
  const html = richHtmlFromEntities(payload.caption, payload.caption_entities);
  assert.equal(visibleText(html), withoutBlankLines(payload.caption));
  assert.ok(html.includes("Итоги по команде создателя"));
  assert.ok(html.includes('<a href="https://example.com/ref">'));
});

test("reading a post's buttons: under it, inside it, or both", () => {
  const { readMessageButtons } = require("./rich-post");
  const classic = {
    reply_markup: { inline_keyboard: [[{ text: "Участвовать (12)", url: "https://t.me/b/join?startapp=d1" }]] },
  };
  assert.deepEqual(readMessageButtons(classic), [
    { text: "Участвовать (12)", url: "https://t.me/b/join?startapp=d1" },
  ]);

  const rich = {
    rich_message: {
      blocks: [
        { type: "paragraph" },
        {
          type: "buttons",
          buttons: [{ text: "\u3000🎁 Участвую (12)\u3000", url: "https://t.me/b/join?startapp=d1" }],
        },
      ],
    },
  };
  assert.deepEqual(readMessageButtons(rich), [
    { text: "\u3000🎁 Участвую (12)\u3000", url: "https://t.me/b/join?startapp=d1" },
  ]);

  assert.equal(readMessageButtons({ ...classic, ...rich }).length, 2, "both kinds are read");
  assert.deepEqual(readMessageButtons({}), []);
  assert.deepEqual(readMessageButtons(undefined), []);
});

test("a button label made of styled pieces reads as its words", () => {
  const { richTextToPlain, readMessageButtons } = require("./rich-post");
  assert.equal(richTextToPlain("Участвую"), "Участвую");
  assert.equal(richTextToPlain(["🎁 ", { type: "bold", text: "Участвую" }, " (7)"]), "🎁 Участвую (7)");
  assert.equal(richTextToPlain({ type: "custom_emoji", text: "🎁" }), "🎁");
  assert.equal(richTextToPlain(null), "");
  assert.deepEqual(
    readMessageButtons({
      rich_message: { blocks: [{ type: "buttons", buttons: [{ text: ["Участвую", " (7)"], url: "https://t.me/x" }] }] },
    }),
    [{ text: "Участвую (7)", url: "https://t.me/x" }],
  );
});
