const test = require("node:test");
const assert = require("node:assert");
const { DateTime } = require("luxon");
const { buildMyDrawsList, describeMyDrawOutcome } = require("./participant-draws");

const TZ = "Europe/Moscow";
const NOW = DateTime.fromISO("2026-09-26T12:00:00", { zone: TZ });
const PROJECTS = [{ id: "brand_beef_1", name: "BEEF" }];
const ME = "7";

function draw(id, fields = {}) {
  return {
    id,
    status: "finished",
    projectId: "brand_beef_1",
    prize: "100$",
    participantIds: [7, 8, 9],
    winnerIds: [],
    finishedAt: "2026-09-20T18:00:00.000+03:00",
    ...fields,
  };
}

test("only the draws the person took part in are listed, newest first", () => {
  const list = buildMyDrawsList({
    draws: [
      draw("old", { finishedAt: "2026-08-01T18:00:00.000+03:00" }),
      draw("not-mine", { participantIds: [8, 9] }),
      draw("new", { finishedAt: "2026-09-20T18:00:00.000+03:00" }),
      draw("live", { status: "active", endAt: "2026-09-28T18:00:00.000+03:00" }),
    ],
    userId: ME,
    projects: PROJECTS,
    timezone: TZ,
    now: NOW,
  });
  assert.deepEqual(list.items.map((item) => item.drawId), ["live", "new", "old"]);
  assert.equal(list.total, 3);
});

test("a draw still going says when its results come", () => {
  const list = buildMyDrawsList({
    draws: [draw("live", { status: "active", endAt: "2026-09-28T18:00:00.000+03:00" })],
    userId: ME,
    projects: PROJECTS,
    timezone: TZ,
    now: NOW,
  });
  const [item] = list.items;
  assert.equal(item.outcome.label, "Идёт");
  assert.equal(item.dateLabel, "итоги 28 сен, 18:00");
  assert.equal(item.projectName, "BEEF");
});

test("a win shows where its payout stands, and what was actually paid", () => {
  const list = buildMyDrawsList({
    draws: [
      draw("paid", {
        winnerIds: [7],
        winnerNotifications: { 7: { status: "confirmed", paidAt: "2026-09-21T10:00:00Z", payoutPrize: "50$" } },
      }),
    ],
    userId: ME,
    projects: PROJECTS,
    timezone: TZ,
    now: NOW,
  });
  assert.equal(list.wins, 1);
  assert.equal(list.items[0].outcome.label, "Выплачено");
  assert.equal(list.items[0].prize, "50$", "половина приза не-рефералу — показываем то, что платят");
});

test("each payout state reads as what the person has to know", () => {
  const cases = [
    [{ status: "confirmed" }, "confirmed"],
    [{ status: "awaiting_address" }, "awaiting_address"],
    [{ status: "pending" }, "pending"],
    [{ status: "expired" }, "expired"],
    [{ status: "forfeited" }, "forfeited"],
    [{ status: "confirmed", antiFraudFlag: true }, "forfeited"],
    [{ status: "confirmed", paymentDeniedAt: "2026-09-21T10:00:00Z" }, "forfeited"],
    [{ status: "failed" }, "failed"],
    [null, "won"],
  ];
  for (const [notify, expected] of cases) {
    assert.equal(describeMyDrawOutcome({ status: "finished" }, notify, { isWinner: true }), expected, JSON.stringify(notify));
  }
});

test("a confirmation that ran out of time has expired before the bot marks it", () => {
  const outcome = describeMyDrawOutcome({ status: "finished" }, { status: "pending" }, {
    isWinner: true,
    isExpired: () => true,
  });
  assert.equal(outcome, "expired");
});

test("the actionable states tell the person what to do", () => {
  const list = buildMyDrawsList({
    draws: [draw("won", { winnerIds: [7], winnerNotifications: { 7: { status: "pending" } } })],
    userId: ME,
    projects: PROJECTS,
    timezone: TZ,
    now: NOW,
  });
  assert.match(list.items[0].outcome.hint, /чате с ботом/);
});

test("another year's draw carries its year", () => {
  const list = buildMyDrawsList({
    draws: [draw("last-year", { finishedAt: "2025-12-30T18:00:00.000+03:00" })],
    userId: ME,
    projects: PROJECTS,
    timezone: TZ,
    now: NOW,
  });
  assert.equal(list.items[0].dateLabel, "30 дек 2025");
});
