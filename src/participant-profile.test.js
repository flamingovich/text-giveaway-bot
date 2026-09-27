const test = require("node:test");
const assert = require("node:assert");
const {
  isTelegramUserId,
  sanitizeProfileBackUrl,
  renderParticipantProfilePage,
} = require("./participant-profile");

const HOSTILE = "</script><script>alert(1)</script>";

function profile(fields = {}) {
  return {
    id: "1003",
    displayName: "Дмитрий",
    username: "@dmitry_k",
    usernameLine: "@dmitry_k",
    initial: "Д",
    avatarUrl: "",
    fallbackStyle: "",
    telegramProfileUrl: "https://t.me/dmitry_k",
    level: 4,
    participations: 9,
    wins: 1,
    winningsParen: "",
    boosts: 0,
    registeredAt: "13 мар 2025 г.",
    ...fields,
  };
}

// /user/<anything> used to print that anything into the page's script.
test("only a Telegram id opens a profile", () => {
  assert.equal(isTelegramUserId("7643612914"), true);
  assert.equal(isTelegramUserId(HOSTILE), false);
  assert.equal(isTelegramUserId("12a"), false);
  assert.equal(isTelegramUserId(""), false);
});

test("«Назад» leads only to a page of this site", () => {
  assert.equal(sanitizeProfileBackUrl("/join/draw_1"), "/join/draw_1");
  assert.equal(sanitizeProfileBackUrl("/winners/draw_1?x=1"), "/winners/draw_1?x=1");
  for (const hostile of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "https://evil.example/", ""]) {
    assert.equal(sanitizeProfileBackUrl(hostile), "", hostile);
  }
});

test("nothing from the url can close the page's script", () => {
  const html = renderParticipantProfilePage(profile({ telegramProfileUrl: `tg://user?id=${HOSTILE}` }), {
    backUrl: `/x${HOSTILE}`,
  });
  assert.ok(!html.includes("<script>alert(1)"), "чужой скрипт попал на страницу");
});

// The list is someone's own; the page renders for anyone with the link.
test("the page carries no draws of its own - the owner's list is fetched apart", () => {
  const html = renderParticipantProfilePage(profile());
  assert.match(html, /id="profileDraws"/);
  assert.match(html, /const PREVIEW_DRAWS = null;/);
  assert.match(html, /\/api\/me\/draws/);
});
