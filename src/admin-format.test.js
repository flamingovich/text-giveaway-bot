const test = require("node:test");
const assert = require("node:assert/strict");
const { DateTime } = require("luxon");
const {
  formatRelative,
  drawTitle,
  identityOf,
  initialsOf,
  computeDelta,
} = require("./admin-format");

const TZ = "Europe/Moscow";
const ago = (opts) => DateTime.now().setZone(TZ).minus(opts).toISO();

test("recent events are said, not timestamped", () => {
  assert.equal(formatRelative(ago({ seconds: 20 }), TZ), "только что");
  assert.equal(formatRelative(ago({ minutes: 3 }), TZ), "3 минуты назад");
  assert.equal(formatRelative(ago({ minutes: 40 }), TZ), "40 минут назад");
  assert.equal(formatRelative(ago({ hours: 2 }), TZ), "2 часа назад");
});

test("older events fall back to a day, not a machine timestamp", () => {
  assert.match(formatRelative("2026-03-14T10:00:00.000Z", TZ), /^14 мар/);
  assert.equal(formatRelative("", TZ), "—");
  assert.equal(formatRelative("не дата", TZ), "—");
});

test("a draw is named by its prize and brand, never by its id", () => {
  const title = drawTitle(
    { prize: "100$", createdAt: "2026-08-21T00:00:00.000Z" },
    "BEEF",
    TZ,
  );

  assert.match(title, /100\$/);
  assert.match(title, /BEEF/);
  assert.ok(!/draw_/.test(title));
});

test("a draw with no project does not print an empty separator", () => {
  const title = drawTitle({ prize: "50$", createdAt: "2026-08-21T00:00:00.000Z" }, "Без проекта", TZ);
  assert.ok(!title.includes("Без проекта"));
});

test("a person is named, with the id kept out of the label", () => {
  const withBoth = identityOf(7643612914, { first_name: "Maksim", last_name: "Protassov", username: "Allevent1985" });
  assert.equal(withBoth.title, "Maksim Protassov");
  assert.equal(withBoth.handle, "@Allevent1985");
  assert.ok(!withBoth.title.includes("7643612914"));

  const handleOnly = identityOf(1, { username: "solo" });
  assert.equal(handleOnly.title, "@solo");
  assert.equal(handleOnly.handle, "", "the handle is not repeated as its own line");
});

test("someone with no name at all still gets a readable label", () => {
  const anon = identityOf(1234567890, {});
  assert.equal(anon.title, "Аноним 7890");
  assert.equal(anon.initials, "?");
});

test("an avatar is only linked when one exists", () => {
  assert.equal(identityOf(5, {}).avatarUrl, "");
  assert.equal(identityOf(5, { avatarFileId: "abc" }).avatarUrl, "/admin/avatar/5");
});

test("initials come from the name", () => {
  assert.equal(initialsOf("Дмитрий Ковтун"), "ДК");
  assert.equal(initialsOf("✨Sanya✨"), "S");
  assert.equal(initialsOf(""), "?");
});

test("a delta is only claimed when there is something to compare with", () => {
  assert.deepEqual(computeDelta(120, 100), { percent: 20, direction: "up" });
  assert.deepEqual(computeDelta(80, 100), { percent: -20, direction: "down" });
  assert.equal(computeDelta(10, 0), null, "growth from nothing is not a percentage");
  assert.equal(computeDelta(10, undefined), null);
});
