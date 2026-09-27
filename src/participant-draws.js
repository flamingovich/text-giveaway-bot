// «Мои розыгрыши» in a participant's own profile: every draw they took part
// in, newest first, and what came of it.
//
// The profile page itself is public - /user/:id opens for anyone with the id -
// and this list includes the draws where the person chose to stay anonymous.
// So it is never part of the page: the page asks for it only when the viewer
// is the profile's owner, and the server answers for the Telegram user the
// signed initData names, never for an id taken from the url.

const { DateTime } = require("luxon");
const { resolveProjectId } = require("./project-identity");

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// What the person sees on the right of a row. tone picks the colour.
const MY_DRAW_OUTCOMES = {
  active: { label: "Идёт", tone: "tint" },
  finished: { label: "Без выигрыша", tone: "muted" },
  won: { label: "Победа", tone: "green" },
  paid: { label: "Выплачено", tone: "green" },
  confirmed: { label: "Ждёт выплаты", tone: "orange" },
  // A win still waiting on the winner: the chip says they won, the line under
  // it says what to do.
  awaiting_address: { label: "Победа", tone: "green", hint: "Отправьте боту адрес кошелька для выплаты" },
  pending: { label: "Победа", tone: "green", hint: "Подтвердите победу в чате с ботом" },
  expired: { label: "Время вышло", tone: "muted" },
  forfeited: { label: "Аннулирован", tone: "red" },
  failed: { label: "Не доставлено", tone: "red" },
};

// Mirrors the winner's record the bot keeps (winnerNotifications): a payout is
// final, a prize taken away or refused beats any waiting state, and a pending
// confirmation whose time ran out has expired even before the bot marks it so.
function describeMyDrawOutcome(draw, notify, { isWinner = false, isExpired = null } = {}) {
  if (draw?.status === "active") {
    return "active";
  }
  if (!isWinner) {
    return "finished";
  }
  if (!notify) {
    return "won";
  }
  if (notify.paidAt) {
    return "paid";
  }
  if (notify.paymentDeniedAt || notify.status === "forfeited" || notify.antiFraudFlag) {
    return "forfeited";
  }
  if (notify.status === "expired" || (typeof isExpired === "function" && isExpired(notify, draw))) {
    return "expired";
  }
  if (notify.status === "confirmed" || notify.verifiedAt) {
    return "confirmed";
  }
  if (notify.status === "awaiting_address") {
    return "awaiting_address";
  }
  if (notify.status === "failed") {
    return "failed";
  }
  if (notify.status === "pending") {
    return "pending";
  }
  return "won";
}

function toDateTime(iso, timezone) {
  if (!iso) {
    return null;
  }
  const dt = DateTime.fromISO(String(iso), { zone: timezone });
  return dt.isValid ? dt : null;
}

function formatDay(dt, now) {
  const day = `${dt.day} ${MONTHS[dt.month - 1]}`;
  return dt.year === now.year ? day : `${day} ${dt.year}`;
}

function drawMoment(draw) {
  return draw.finishedAt || draw.endAt || draw.publishAt || draw.createdAt || "";
}

function includesId(list, key) {
  return (Array.isArray(list) ? list : []).some((id) => String(id) === key);
}

// draws: the live ones and the archive together. Rows lead nowhere: the join
// and results pages have no way back to the profile, and the archive's draws
// have no results page at all.
function buildMyDrawsList({
  draws = [],
  userId,
  projects = [],
  timezone = "Europe/Moscow",
  isExpired = null,
  now = DateTime.now(),
} = {}) {
  const userKey = String(userId);
  const nowInZone = DateTime.fromMillis(Number(now.toMillis ? now.toMillis() : now)).setZone(timezone);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const items = [];
  let wins = 0;

  for (const draw of draws) {
    const isParticipant = includesId(draw?.participantIds, userKey);
    const isWinner = includesId(draw?.winnerIds, userKey);
    if (!isParticipant && !isWinner) {
      continue;
    }
    if (draw.status !== "active" && draw.status !== "finished") {
      continue;
    }

    const notify = draw.winnerNotifications?.[userKey] || null;
    const key = describeMyDrawOutcome(draw, notify, { isWinner, isExpired });
    const outcome = MY_DRAW_OUTCOMES[key];
    if (isWinner) {
      wins += 1;
    }

    const isActive = draw.status === "active";
    const when = toDateTime(isActive ? draw.endAt : drawMoment(draw), timezone);
    const dateLabel = when
      ? isActive
        ? `итоги ${formatDay(when, nowInZone)}, ${when.toFormat("HH:mm")}`
        : formatDay(when, nowInZone)
      : "";
    items.push({
      drawId: String(draw.id),
      prize: String((isWinner && notify?.payoutPrize) || draw.prize || "Розыгрыш").trim(),
      projectName: projectNameById.get(resolveProjectId(draw.projectId)) || "",
      dateLabel,
      at: String(isActive ? draw.endAt || "" : drawMoment(draw)),
      outcome: { key, label: outcome.label, tone: outcome.tone, hint: outcome.hint || "" },
    });
  }

  items.sort((left, right) => right.at.localeCompare(left.at));
  return { total: items.length, wins, items };
}

module.exports = {
  MY_DRAW_OUTCOMES,
  describeMyDrawOutcome,
  buildMyDrawsList,
};
