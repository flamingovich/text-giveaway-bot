// Raw values are what made the panel read like a database dump: Telegram ids
// printed under every name, draw ids like draw_1787183733127_9327 shown as if
// they meant something, timestamps in full even when the event was an hour ago.
// Everything user facing goes through here and comes out as something a person
// would say.

const { DateTime } = require("luxon");

const MONTHS = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function toDateTime(iso, timezone) {
  if (!iso) {
    return null;
  }
  const dt = DateTime.fromISO(String(iso), { zone: timezone });
  return dt.isValid ? dt : null;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

// "3 минуты назад", "вчера, 02:54", "17 авг" - the precision people actually use.
function formatRelative(iso, timezone) {
  const dt = toDateTime(iso, timezone);
  if (!dt) {
    return "—";
  }
  const now = DateTime.now().setZone(timezone);
  const minutes = Math.round(now.diff(dt, "minutes").minutes);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;

  const hours = Math.round(minutes / 60);
  if (hours < 12) return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;

  const startOfToday = now.startOf("day");
  if (dt >= startOfToday) return `сегодня, ${dt.toFormat("HH:mm")}`;
  if (dt >= startOfToday.minus({ days: 1 })) return `вчера, ${dt.toFormat("HH:mm")}`;

  const sameYear = dt.year === now.year;
  const day = `${dt.day} ${MONTHS[dt.month - 1]}`;
  return sameYear ? day : `${day} ${dt.year}`;
}

function formatDateTime(iso, timezone) {
  const dt = toDateTime(iso, timezone);
  if (!dt) {
    return "—";
  }
  const now = DateTime.now().setZone(timezone);
  const day = `${dt.day} ${MONTHS[dt.month - 1]}${dt.year === now.year ? "" : ` ${dt.year}`}`;
  return `${day}, ${dt.toFormat("HH:mm")}`;
}

// A draw is "100$ · BEEF · 21 авг", never its generated id.
function drawTitle(draw, projectName, timezone) {
  const prize = String(draw?.prize || "").trim() || "без приза";
  const when = toDateTime(draw?.finishedAt || draw?.endAt || draw?.publishAt || draw?.createdAt, timezone);
  const parts = [prize];
  if (projectName && projectName !== "Без проекта") {
    parts.push(projectName);
  }
  if (when) {
    parts.push(`${when.day} ${MONTHS[when.month - 1]}`);
  }
  return parts.join(" · ");
}

function initialsOf(name, fallback = "?") {
  const clean = String(name || "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!clean) {
    return fallback;
  }
  const words = clean.split(/\s+/).slice(0, 2);
  return words.map((word) => word[0].toUpperCase()).join("");
}

// One place decides how a person is named, so the same human never appears as
// "ID 7643612914" on one screen and "Maksim (@Allevent1985)" on another.
function identityOf(userId, meta = {}) {
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  const handle = meta.username ? `@${meta.username}` : "";
  const title = name || handle || `Аноним ${String(userId).slice(-4)}`;
  return {
    userId: String(userId),
    title,
    handle: handle && handle !== title ? handle : "",
    initials: initialsOf(name || meta.username || "", "?"),
    hasAvatar: Boolean(meta.avatarFileId),
    avatarUrl: meta.avatarFileId ? `/admin/avatar/${encodeURIComponent(String(userId))}` : "",
  };
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

// "+18%" against the previous window of the same length, or nothing when there
// is no honest comparison to make.
function computeDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  const change = ((current - previous) / previous) * 100;
  if (!Number.isFinite(change)) {
    return null;
  }
  const rounded = Math.round(change);
  return { percent: rounded, direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat" };
}

module.exports = {
  formatRelative,
  formatDateTime,
  drawTitle,
  identityOf,
  initialsOf,
  formatCount,
  computeDelta,
  plural,
};
