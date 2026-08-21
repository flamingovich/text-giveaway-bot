const test = require("node:test");
const assert = require("node:assert");
const { parseJoinStartParam, buildJoinReferralDirectLink } = require("./join-referrals");

const DRAW = "draw_1787187336524_9431";
const INVITER = 8167143042;

// This is the failure as it reached production: two people, two live draws,
// both turned away because the id had a referral code welded onto it.
test("a link that lost its underscores still finds the draw", () => {
  assert.deepEqual(parseJoinStartParam(`${DRAW}ref${INVITER}`), {
    drawId: DRAW,
    referrerId: INVITER,
  });
});

test("links already in circulation keep working", () => {
  for (const sep of ["__ref__", "_ref_", "-ref-"]) {
    assert.deepEqual(
      parseJoinStartParam(`${DRAW}${sep}${INVITER}`),
      { drawId: DRAW, referrerId: INVITER },
      sep,
    );
  }
});

test("a plain draw link carries no inviter", () => {
  assert.deepEqual(parseJoinStartParam(DRAW), { drawId: DRAW, referrerId: null });
});

test("new links use a separator Telegram cannot read as formatting", () => {
  const link = buildJoinReferralDirectLink(DRAW, INVITER, "roller_official_bot", "join");
  assert.ok(!link.includes("__"), "double underscores are how Telegram writes underline");
  assert.match(link, /-ref-/);
  const startapp = decodeURIComponent(new URL(link).searchParams.get("startapp"));
  assert.deepEqual(parseJoinStartParam(startapp), { drawId: DRAW, referrerId: INVITER });
});

test("an inviter that is not a number is ignored rather than trusted", () => {
  assert.deepEqual(parseJoinStartParam(`${DRAW}-ref-абв`), { drawId: DRAW, referrerId: null });
  assert.deepEqual(parseJoinStartParam(`${DRAW}-ref-`), { drawId: DRAW, referrerId: null });
});

test("nothing in, nothing out", () => {
  assert.deepEqual(parseJoinStartParam(""), { drawId: "", referrerId: null });
  assert.deepEqual(parseJoinStartParam(null), { drawId: "", referrerId: null });
});

test("a draw id is never split by its own underscores", () => {
  assert.deepEqual(parseJoinStartParam("draw_1787271566549_1311"), {
    drawId: "draw_1787271566549_1311",
    referrerId: null,
  });
});
