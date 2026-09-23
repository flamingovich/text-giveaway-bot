const test = require("node:test");
const assert = require("node:assert/strict");

const { buildActiveDrawsDigestRichHtml, buildProjectsBlock } = require("./draw-digest-rich");
const { PAD_SPACE } = require("./rich-post");

const PROJECTS = [
  { name: "Pokerdom", emoji: "🍀", refLink: "https://depman.vip/pokerdom" },
  { name: "BEEF", emoji: "🔥", refLink: "https://depman.vip/beef" },
];

test("the reminder the owner approved: heading, a button per draw, projects", () => {
  const html = buildActiveDrawsDigestRichHtml({
    headerPrizeLabel: "4О$",
    items: [
      { prizeLabel: "3О$", url: "https://t.me/bot/join?startapp=a" },
      { prizeLabel: "1О$", url: "https://t.me/bot/join?startapp=b" },
    ],
    projects: PROJECTS,
  });
  assert.equal(
    html,
    [
      "<p><b>🎁 РОЗЫГРЫШИ НА 4О$ 🎁</b></p>",
      `<tg-button-row><tg-button type="url" style="primary" url="https://t.me/bot/join?startapp=a">${PAD_SPACE}${PAD_SPACE}🎁 РОЗЫГРЫШ НА 3О$ 🎁${PAD_SPACE}${PAD_SPACE}</tg-button></tg-button-row>`,
      `<tg-button-row><tg-button type="url" style="primary" url="https://t.me/bot/join?startapp=b">${PAD_SPACE}${PAD_SPACE}🎁 РОЗЫГРЫШ НА 1О$ 🎁${PAD_SPACE}${PAD_SPACE}</tg-button></tg-button-row>`,
      "<p><b>🎰 ТОП ПРОЕКТЫ 👇</b></p>",
      '<blockquote>🍀 <a href="https://depman.vip/pokerdom"><b>Pokerdom</b></a> » <a href="https://depman.vip/pokerdom"><b>depman.vip/pokerdom</b></a><br>🔥 <a href="https://depman.vip/beef"><b>BEEF</b></a> » <a href="https://depman.vip/beef"><b>depman.vip/beef</b></a></blockquote>',
    ].join("\n"),
  );
});

test("one draw is spoken of in the singular", () => {
  const html = buildActiveDrawsDigestRichHtml({
    headerPrizeLabel: "5О$",
    items: [{ prizeLabel: "5О$", url: "https://t.me/x" }],
  });
  assert.ok(html.startsWith("<p><b>🎁 РОЗЫГРЫШ НА 5О$ 🎁</b></p>"));
  assert.ok(!html.includes("РОЗЫГРЫШИ"));
});

test("the buttons are blue and padded to fill the post", () => {
  const html = buildActiveDrawsDigestRichHtml({
    headerPrizeLabel: "1О$",
    items: [{ prizeLabel: "1О$", url: "https://t.me/x" }],
  });
  assert.ok(html.includes('style="primary"'));
  assert.ok(html.includes(`>${PAD_SPACE}${PAD_SPACE}🎁 РОЗЫГРЫШ НА 1О$ 🎁${PAD_SPACE}${PAD_SPACE}<`));
});

test("a draw with no link left to give stays a line of text", () => {
  const html = buildActiveDrawsDigestRichHtml({ headerPrizeLabel: "2О$", items: [{ prizeLabel: "2О$", url: "" }] });
  assert.ok(html.includes("<p><b>🎁 РОЗЫГРЫШ НА 2О$ 🎁</b></p>"));
  assert.ok(!html.includes("tg-button"));
});

test("no draws, no projects: the heading still stands on its own", () => {
  assert.equal(buildActiveDrawsDigestRichHtml(), "<p><b>🎁 РОЗЫГРЫШИ НА 0$ 🎁</b></p>");
  assert.equal(
    buildActiveDrawsDigestRichHtml({ headerPrizeLabel: "3О$", items: [{ prizeLabel: "3О$", url: "https://t.me/x" }], projects: [] }),
    [
      "<p><b>🎁 РОЗЫГРЫШ НА 3О$ 🎁</b></p>",
      `<tg-button-row><tg-button type="url" style="primary" url="https://t.me/x">${PAD_SPACE}${PAD_SPACE}🎁 РОЗЫГРЫШ НА 3О$ 🎁${PAD_SPACE}${PAD_SPACE}</tg-button></tg-button-row>`,
    ].join("\n"),
  );
});

test("a project without a referral link keeps its name and nothing else", () => {
  assert.equal(buildProjectsBlock([{ name: "IRIS", emoji: "🍭" }]).includes("<a href"), false);
  assert.ok(buildProjectsBlock([{ name: "IRIS", emoji: "🍭" }]).includes("🍭 <b>IRIS</b>"));
  assert.equal(buildProjectsBlock([]), "");
  assert.equal(buildProjectsBlock(undefined), "");
});

test("a project with no emoji gets a bullet", () => {
  assert.ok(buildProjectsBlock([{ name: "IRIS", refLink: "https://a.b/c" }]).includes("• <a href"));
  assert.ok(buildProjectsBlock([{ name: "IRIS", emoji: "   ", refLink: "https://a.b/c" }]).includes("• <a href"));
});

test("nothing in a name, a link or a prize can break the markup", () => {
  const html = buildActiveDrawsDigestRichHtml({
    headerPrizeLabel: "<b>10</b>$",
    items: [{ prizeLabel: '5$ & "приз"', url: "https://t.me/x?a=1&b=2" }],
    projects: [{ name: "<Проект>", emoji: "🍀", refLink: "https://a.b/c?d=1&e=2" }],
  });
  assert.ok(html.includes("🎁 РОЗЫГРЫШ НА &lt;b&gt;10&lt;/b&gt;$ 🎁"), "heading");
  assert.ok(html.includes("🎁 РОЗЫГРЫШ НА 5$ &amp; &quot;приз&quot; 🎁"), "button label");
  assert.ok(html.includes('url="https://t.me/x?a=1&amp;b=2"'));
  assert.ok(html.includes("5$ &amp; &quot;приз&quot;"));
  assert.ok(html.includes("<b>&lt;Проект&gt;</b>"));
  assert.ok(html.includes('href="https://a.b/c?d=1&amp;e=2"'));
});
