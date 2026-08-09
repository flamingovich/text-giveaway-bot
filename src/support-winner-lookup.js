const { DateTime } = require("luxon");
const { readData, readArchivedDraws } = require("./storage");

const WINNER_DEPOSIT_ADDRESS_MINUTES = 20;
const MAX_WIN_ENTRIES = 8;

function formatMsk(iso) {
  if (!iso) {
    return "—";
  }
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone("Europe/Moscow");
  if (!dt.isValid) {
    return String(iso);
  }
  return dt.toFormat("dd.MM.yyyy HH:mm") + " МСК";
}

function getConfirmWindowLabel(draw) {
  const value = Number.isFinite(draw?.winnerConfirmValue) && draw.winnerConfirmValue > 0
    ? Math.floor(draw.winnerConfirmValue)
    : 30;
  const unit = draw?.winnerConfirmUnit === "hours" ? "ч" : "мин";
  return `${value} ${unit} после итогов`;
}

function isAntifraudForfeiture(notify) {
  if (!notify?.antiFraudFlag) {
    return false;
  }
  const reason = String(notify.forfeitureReason || "");
  if (reason === "unsubscribed" || reason === "account_unavailable" || reason === "address_timeout") {
    return false;
  }
  if (notify.addressExpired) {
    return false;
  }
  return notify.status === "forfeited" || notify.status === "failed" || reason === "antifraud" || Boolean(reason);
}

function describeWinnerStatus(draw, notify) {
  if (!notify) {
    return {
      summary: "Победитель, но уведомление в основной бот не отправлялось или нет записи.",
      details: [],
    };
  }

  const details = [];
  const confirmDeadline = notify.expiresAt ? formatMsk(notify.expiresAt) : null;
  const finishedAt = formatMsk(draw.finishedAt || notify.sentAt);
  const sentAt = formatMsk(notify.sentAt);

  if (notify.paidAt) {
    return {
      summary: "Приз выплачен.",
      details: [
        sentAt !== "—" ? `Уведомление о победе: ${sentAt}` : null,
        `Выплата: ${formatMsk(notify.paidAt)}`,
        notify.payoutPrize ? `Сумма: ${notify.payoutPrize}` : null,
      ].filter(Boolean),
    };
  }

  if (notify.paymentDeniedAt) {
    return {
      summary: "Организатор отметил отказ в выплате.",
      details: [confirmDeadline ? `Срок подтверждения был до: ${confirmDeadline}` : null].filter(Boolean),
    };
  }

  if (notify.status === "expired" || (notify.expiredAt && !notify.verifiedAt)) {
    return {
      summary: "Не отметился в срок — капча в @roller_official_bot не пройдена, приз сгорел.",
      details: [
        `Итоги розыгрыша: ${finishedAt}`,
        sentAt !== "—" ? `Уведомление отправлено: ${sentAt}` : null,
        confirmDeadline ? `Дедлайн подтверждения: ${confirmDeadline}` : `Срок: ${getConfirmWindowLabel(draw)}`,
        notify.expiredAt ? `Истекло: ${formatMsk(notify.expiredAt)}` : null,
        "Адрес депозита в основной бот не получен (до капчи дело не дошло или не успел).",
      ].filter(Boolean),
    };
  }

  if (notify.forfeitureReason === "address_timeout" || notify.addressExpired) {
    return {
      summary: "Капчу прошёл, но адрес депозита не отправил вовремя — приз сгорел.",
      details: [
        notify.verifiedAt ? `Капча пройдена: ${formatMsk(notify.verifiedAt)}` : null,
        notify.addressExpiresAt ? `Дедлайн адреса: ${formatMsk(notify.addressExpiresAt)}` : null,
        notify.forfeitedAt ? `Истекло: ${formatMsk(notify.forfeitedAt)}` : null,
      ].filter(Boolean),
    };
  }

  if (notify.forfeitureReason === "unsubscribed") {
    return {
      summary: "Отписался от канала розыгрыша — приз сгорел.",
      details: [notify.forfeitedAt ? `Зафиксировано: ${formatMsk(notify.forfeitedAt)}` : null].filter(Boolean),
    };
  }

  if (notify.forfeitureReason === "account_unavailable") {
    return {
      summary: "Аккаунт недоступен в Telegram — приз сгорел.",
      details: [notify.forfeitedAt ? `Зафиксировано: ${formatMsk(notify.forfeitedAt)}` : null].filter(Boolean),
    };
  }

  if (isAntifraudForfeiture(notify)) {
    return {
      summary: "Сработала автоматическая антифрод-проверка — приз сгорел. Конкретные причины не разглашаются.",
      details: [notify.forfeitedAt ? `Зафиксировано: ${formatMsk(notify.forfeitedAt)}` : null].filter(Boolean),
    };
  }

  if (notify.status === "failed") {
    return {
      summary: "Уведомление о победе не доставлено в личку основного бота.",
      details: [
        notify.error ? `Ошибка доставки: ${String(notify.error).slice(0, 120)}` : null,
        "Пусть напишет /start основному боту и попросит организатора переотправить уведомление.",
      ].filter(Boolean),
    };
  }

  if (notify.status === "awaiting_address") {
    const addressDeadline = notify.addressExpiresAt ? formatMsk(notify.addressExpiresAt) : null;
    return {
      summary: "Капчу прошёл, ждёт адрес депозита в @roller_official_bot.",
      details: [
        notify.verifiedAt ? `Капча пройдена: ${formatMsk(notify.verifiedAt)}` : null,
        addressDeadline
          ? `Отправить адрес до: ${addressDeadline}`
          : `На адрес даётся ${WINNER_DEPOSIT_ADDRESS_MINUTES} минут после капчи.`,
      ].filter(Boolean),
    };
  }

  if (notify.status === "confirmed" || notify.verifiedAt) {
    return {
      summary: "Подтверждение пройдено — ожидает выплату от организатора.",
      details: [
        notify.verifiedAt ? `Подтверждён: ${formatMsk(notify.verifiedAt)}` : null,
        notify.addressReceivedAt ? `Адрес получен: ${formatMsk(notify.addressReceivedAt)}` : null,
      ].filter(Boolean),
    };
  }

  if (notify.status === "pending") {
    return {
      summary: "Уведомление отправлено — ждёт подтверждения капчи в @roller_official_bot.",
      details: [
        sentAt !== "—" ? `Отправлено: ${sentAt}` : null,
        confirmDeadline ? `Подтвердить до: ${confirmDeadline}` : `Срок: ${getConfirmWindowLabel(draw)}`,
      ].filter(Boolean),
    };
  }

  return {
    summary: `Статус: ${notify.status || "неизвестен"}.`,
    details: [],
  };
}

function collectWinnerDraws(userId) {
  const numericId = Number(userId);
  if (!Number.isInteger(numericId)) {
    return [];
  }

  let active = [];
  let archived = [];
  try {
    active = readData()?.draws || [];
  } catch {
    active = [];
  }
  try {
    archived = readArchivedDraws()?.draws || [];
  } catch {
    archived = [];
  }

  const hits = [];
  for (const draw of [...active, ...archived]) {
    if (!draw?.winnerIds?.includes(numericId)) {
      continue;
    }
    hits.push(draw);
  }

  hits.sort((a, b) => String(b.finishedAt || b.createdAt || "").localeCompare(String(a.finishedAt || a.createdAt || "")));
  return hits.slice(0, MAX_WIN_ENTRIES);
}

function buildSupportWinnerContext(userId, options = {}) {
  const draws = collectWinnerDraws(userId);
  if (draws.length === 0) {
    return [
      "=== ДАННЫЕ ИЗ БАЗЫ ROLLERBOT (этот пользователь) ===",
      `Telegram ID: ${userId}`,
      "Выигрышей в базе не найдено (или розыгрыш ещё не завершён с этим ID победителя).",
      "",
      "Если человек спрашивает про приз — уточни канал/дату. Опирайся на эти данные, не говори что базы нет.",
    ].join("\n");
  }

  const lines = [
    "=== ДАННЫЕ ИЗ БАЗЫ ROLLERBOT (этот пользователь) ===",
    `Telegram ID: ${userId}`,
    `Найдено выигрышей: ${draws.length} (показаны последние).`,
    "",
    "Правила для ответа:",
    "- Опирайся на эти факты: отметился или нет, адрес, выплата.",
    "- Можно точно сказать «не отметился», «не скинул адрес», «выплачено», «ждёт капчу».",
    "- Антифрод: только «автоматическая проверка, детали не разглашаются» — без IP, мультиакка, кошельков.",
    "",
    "Выигрыши:",
  ];

  draws.forEach((draw, index) => {
    const notify = draw.winnerNotifications?.[String(userId)] || null;
    const channel = String(draw.channelId || "канал").replace(/^@/, "@");
    const prize = notify?.payoutPrize || draw.prize || "—";
    const { summary, details } = describeWinnerStatus(draw, notify);

    lines.push(`${index + 1}) ${draw.id}`);
    lines.push(`   Канал: ${channel} · приз победителю: ${prize} · итоги: ${formatMsk(draw.finishedAt)}`);
    lines.push(`   ${summary}`);
    for (const detail of details) {
      lines.push(`   - ${detail}`);
    }
    lines.push("");
  });

  return lines.join("\n").trim();
}

module.exports = {
  buildSupportWinnerContext,
  describeWinnerStatus,
  collectWinnerDraws,
};
