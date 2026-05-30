const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const express = require("express");
const multer = require("multer");
const QRCode = require("qrcode");
const { Telegraf, Markup } = require("telegraf");
const { DateTime } = require("luxon");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter(Number.isFinite);
const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 30_000);
const WEB_PORT = Number(process.env.WEB_PORT || 3000);
const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL || "").replace(/\/$/, "");
let BOT_USERNAME = (process.env.BOT_USERNAME || "").replace("@", "");
const TRC20_GUIDE_IMAGES = [
  path.join(__dirname, "..", "assets", "trc20-guide", "step-1.png"),
  path.join(__dirname, "..", "assets", "trc20-guide", "step-2.png"),
  path.join(__dirname, "..", "assets", "trc20-guide", "step-3.png"),
];

if (!BOT_TOKEN || BOT_TOKEN === "your_telegram_bot_token") {
  throw new Error(
    "Укажите BOT_TOKEN в .env (скопируйте из @BotFather). Файл: " +
      path.join(__dirname, "..", ".env"),
  );
}

if (ADMIN_IDS.length === 0 || ADMIN_IDS.every((id) => id === 123456789)) {
  throw new Error(
    "Укажите ваш Telegram ID в ADMIN_IDS в .env (узнать: @userinfobot). Файл: " +
      path.join(__dirname, "..", ".env"),
  );
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const DATA_DIR = path.join(__dirname, "..", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DRAWS_FILE = path.join(DATA_DIR, "draws.json");
const KNOWN_CHANNELS_FILE = path.join(DATA_DIR, "known-channels.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const USER_PROJECT_PROFILES_FILE = path.join(DATA_DIR, "user-project-profiles.json");

const DRAW_STATUS = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  FINISHED: "finished",
};

const sessions = new Map();
const joinSessions = new Map();
const winnerVerificationSessions = new Map();

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DRAWS_FILE)) {
    fs.writeFileSync(DRAWS_FILE, JSON.stringify({ draws: [] }, null, 2), "utf8");
  }
  if (!fs.existsSync(KNOWN_CHANNELS_FILE)) {
    fs.writeFileSync(KNOWN_CHANNELS_FILE, JSON.stringify({ channels: [] }, null, 2), "utf8");
  }
  if (!fs.existsSync(PROJECTS_FILE)) {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify({ projects: [] }, null, 2), "utf8");
  }
  if (!fs.existsSync(USER_PROJECT_PROFILES_FILE)) {
    fs.writeFileSync(USER_PROJECT_PROFILES_FILE, JSON.stringify({ users: {} }, null, 2), "utf8");
  }
}

function readData() {
  ensureStorage();
  const content = fs.readFileSync(DRAWS_FILE, "utf8");
  return JSON.parse(content);
}

function writeData(data) {
  fs.writeFileSync(DRAWS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function readKnownChannels() {
  ensureStorage();
  const content = fs.readFileSync(KNOWN_CHANNELS_FILE, "utf8");
  return JSON.parse(content);
}

function writeKnownChannels(data) {
  fs.writeFileSync(KNOWN_CHANNELS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function readProjects() {
  ensureStorage();
  const content = fs.readFileSync(PROJECTS_FILE, "utf8");
  return JSON.parse(content);
}

function writeProjects(data) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function readUserProjectProfiles() {
  ensureStorage();
  const content = fs.readFileSync(USER_PROJECT_PROFILES_FILE, "utf8");
  return JSON.parse(content);
}

function writeUserProjectProfiles(data) {
  fs.writeFileSync(USER_PROJECT_PROFILES_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getProjectById(projectId) {
  if (!projectId) {
    return null;
  }
  const data = readProjects();
  return data.projects.find((project) => project.id === projectId) || null;
}

function upsertKnownChannel(chat) {
  if (!chat || chat.type !== "channel") {
    return;
  }

  const data = readKnownChannels();
  const id = String(chat.id);
  const existing = data.channels.find((item) => item.id === id);
  const payload = {
    id,
    title: chat.title || "",
    username: chat.username || "",
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    data.channels.push({
      ...payload,
      addedAt: new Date().toISOString(),
    });
  }

  writeKnownChannels(data);
}

function saveClipboardImage(dataUrl, prefix) {
  if (!dataUrl || typeof dataUrl !== "string") {
    return "";
  }

  const match = dataUrl.match(/^data:(image\/png|image\/jpeg|image\/webp|image\/gif);base64,(.+)$/);
  if (!match) {
    return "";
  }

  const mime = match[1];
  const base64Data = match[2];
  const extByMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const ext = extByMime[mime] || ".png";
  const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

function parseDateTimeFromBot(input) {
  const dt = DateTime.fromFormat(input.trim(), "yyyy-MM-dd HH:mm", { zone: TIMEZONE });
  return dt.isValid ? dt : null;
}

function parseDateTimeFromWeb(input) {
  const dt = DateTime.fromFormat(input.trim(), "yyyy-MM-dd'T'HH:mm", { zone: TIMEZONE });
  return dt.isValid ? dt : null;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return "вручную";
  }
  const dt = DateTime.fromISO(isoString, { zone: TIMEZONE });
  if (!dt.isValid) {
    return "не задано";
  }
  return dt.toFormat("dd.MM.yyyy HH:mm");
}

function formatDateTimeForInput(isoString) {
  if (!isoString) {
    return "";
  }
  const dt = DateTime.fromISO(isoString, { zone: TIMEZONE });
  if (!dt.isValid) {
    return "";
  }
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

function isAdmin(ctx) {
  return ADMIN_IDS.includes(ctx.from?.id);
}

function parseStartPayload(ctx) {
  const text = ctx.message?.text || "";
  const parts = text.split(" ");
  if (parts.length < 2) {
    return "";
  }
  return parts.slice(1).join(" ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRubAmount(value) {
  const amount = Math.floor(Number(value));
  const formatted = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted}₽`;
}

function parseRubAmountFromText(text) {
  const digits = String(text || "").replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }
  return Number(digits);
}

function getPerWinnerPrizeText(draw) {
  if (draw.prizeType !== "money_rub") {
    return draw.prize;
  }

  const total = Number.isFinite(draw.prizeAmountRub)
    ? Number(draw.prizeAmountRub)
    : parseRubAmountFromText(draw.prize);
  if (!Number.isFinite(total) || total <= 0) {
    return draw.prize;
  }

  const winnerCount = Math.max(1, (draw.winnerIds || []).length || Number(draw.winnersCount) || 1);
  const perWinner = Math.floor(total / winnerCount);
  return formatRubAmount(perWinner);
}

function getWinnerPayoutText(draw, projectData) {
  const base = getPerWinnerPrizeText(draw);
  if (!projectData?.selfReportedNonReferral || draw.prizeType !== "money_rub") {
    return base;
  }

  const amount = parseRubAmountFromText(base);
  if (!Number.isFinite(amount) || amount <= 0) {
    return base;
  }
  return formatRubAmount(Math.floor(amount / 2));
}

function getWinnerConfirmWindow(draw) {
  const value = Number.isFinite(draw.winnerConfirmValue) && draw.winnerConfirmValue > 0
    ? Math.floor(draw.winnerConfirmValue)
    : 30;
  const unit = ["minutes", "hours"].includes(draw.winnerConfirmUnit) ? draw.winnerConfirmUnit : "minutes";
  return { value, unit };
}

function winnerVerificationSessionKey(userId, drawId) {
  return `${userId}:${drawId}`;
}

function getWinnerConfirmTimeoutMinutes(draw) {
  const cfg = getWinnerConfirmWindow(draw);
  if (cfg.unit === "hours") {
    return cfg.value * 60;
  }
  return cfg.value;
}

function buildWinnerExpiredText(draw) {
  const timeoutMinutes = getWinnerConfirmTimeoutMinutes(draw);
  return [
    "🎉 Вы выиграли в розыгрыше.",
    `😞 Но Вы не отметились вовремя... (${timeoutMinutes} минут после победы)`,
  ].join("\n");
}

function buildDrawPostLink(draw) {
  if (!draw?.messageId || !draw?.channelId) {
    return "";
  }

  const channelId = String(draw.channelId).trim();
  if (channelId.startsWith("@")) {
    return `https://t.me/${channelId.slice(1)}/${draw.messageId}`;
  }
  if (/^-100\d+$/.test(channelId)) {
    return `https://t.me/c/${channelId.replace("-100", "")}/${draw.messageId}`;
  }
  return "";
}

function buildParticipationSuccessMessage(draw) {
  const postLink = buildDrawPostLink(draw);
  const giveawayWord = postLink
    ? `<a href="${escapeHtml(postLink)}">розыгрыше</a>`
    : "розыгрыше";

  return [
    `<b>Вы участвуете в ${giveawayWord} 🎉</b>`,
    "Если выиграете, бот отправит вам уведомление в личные сообщения.",
  ].join("\n");
}

function buildProjectLinkHtml(projectId) {
  const project = getProjectById(projectId);
  if (!project) {
    return "<b>проекте</b>";
  }
  return `<a href="${escapeHtml(project.refLink)}"><b>${escapeHtml(project.name)}</b></a>`;
}

function formatDurationRu(value, unit) {
  const n = Math.max(1, Math.floor(Number(value)));
  const mod10 = n % 10;
  const mod100 = n % 100;

  function plural(one, few, many) {
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
    return many;
  }

  if (unit === "hours") {
    return `${n} ${plural("час", "часа", "часов")}`;
  }
  if (unit === "days") {
    return `${n} ${plural("день", "дня", "дней")}`;
  }
  return `${n} ${plural("минуту", "минуты", "минут")}`;
}

function getDrawDurationLabel(draw) {
  if (Number.isFinite(draw.endAfterValue) && draw.endAfterValue > 0 && draw.endAfterUnit) {
    return formatDurationRu(draw.endAfterValue, draw.endAfterUnit);
  }
  if (draw.endAt && draw.publishAt) {
    const start = DateTime.fromISO(draw.publishAt, { zone: TIMEZONE });
    const end = DateTime.fromISO(draw.endAt, { zone: TIMEZONE });
    if (start.isValid && end.isValid && end > start) {
      const totalMinutes = Math.max(1, Math.round(end.diff(start, "minutes").minutes));
      if (totalMinutes % 1440 === 0) {
        return formatDurationRu(totalMinutes / 1440, "days");
      }
      if (totalMinutes % 60 === 0) {
        return formatDurationRu(totalMinutes / 60, "hours");
      }
      return formatDurationRu(totalMinutes, "minutes");
    }
  }
  return "по команде администратора";
}

function buildDrawMessage(draw, options = {}) {
  const { includeWinners = false, forCaption = false } = options;
  const project = getProjectById(draw.projectId);
  const projectLink =
    project && project.refLink
      ? `<a href="${escapeHtml(project.refLink)}"><b>${escapeHtml(project.name)}</b></a>`
      : escapeHtml(project?.name || "");
  const durationLabel = getDrawDurationLabel(draw);

  const base = [
    `<b>🎁 РОЗЫГРЫШ НА ${escapeHtml(draw.prize)}</b>`,
    "",
    "<b>📌 Условия участия</b>",
    `• Быть рефералом на ${projectLink}`,
    "• Подтвердить статус реферала",
    "",
    `👥 Призовых мест: ${draw.winnersCount}`,
    `⏰ Итоги через ${escapeHtml(durationLabel)}`,
  ].filter((line) => line !== null && line !== undefined);

  if (includeWinners) {
    const userProfiles = readUserProjectProfiles();
    const winnerLinks = (draw.winnerIds || []).map((winnerId) => {
      return getWinnerMentionHtml(userProfiles, winnerId);
    });
    const botMention = BOT_USERNAME
      ? `<a href="https://t.me/${escapeHtml(BOT_USERNAME)}">@${escapeHtml(BOT_USERNAME)}</a>`
      : "@roller_official_bot";
    base.push(
      "",
      winnerLinks.length > 0
        ? `<b>🥳 Победители:</b> ${winnerLinks.join(", ")}`
        : "<b>🥳 Победители:</b> не определены"
    );
    base.push(
      "",
      `<b>⚠️ ПОБЕДИТЕЛИ, ЗАЙДИТЕ В БОТА И ОТМЕТЬТЕСЬ ${botMention}</b>`
    );
  } else {
    base.push("", "<b>Жми кнопку ниже, для участия 👇</b>");
  }

  const text = base.join("\n");
  if (forCaption && text.length > 1000) {
    return `${text.slice(0, 997)}...`;
  }
  return text;
}

function createDrawId() {
  return `draw_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function createProjectId() {
  return `project_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function createSession(userId) {
  sessions.set(userId, {
    step: "channelId",
    draft: {
      id: createDrawId(),
      status: DRAW_STATUS.DRAFT,
      channelId: "",
      prize: "",
      imagePath: "",
      publishAt: "",
      endAt: "",
      winnersCount: 1,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      messageId: null,
      messageType: "text",
      participantIds: [],
      winnerIds: [],
      winnerNotifications: {},
    },
  });
}

function removeSession(userId) {
  sessions.delete(userId);
}

function getKeyboard(drawId, count) {
  const text = `Участвовать (${count})`;
  if (BOT_USERNAME) {
    const deepLink = getJoinDeepLink(drawId);
    return Markup.inlineKeyboard([Markup.button.url(text, deepLink)]);
  }
  return Markup.inlineKeyboard([Markup.button.callback(text, `join:${drawId}`)]);
}

async function ensureBotUsername() {
  if (BOT_USERNAME) {
    return BOT_USERNAME;
  }
  const me = await bot.telegram.getMe();
  BOT_USERNAME = (me.username || "").replace("@", "");
  if (!BOT_USERNAME) {
    throw new Error("Не удалось определить username бота. Добавьте BOT_USERNAME в .env");
  }
  return BOT_USERNAME;
}

function getJoinDeepLink(drawId) {
  if (!BOT_USERNAME) {
    return "";
  }
  return `https://t.me/${BOT_USERNAME}?start=join_${drawId}`;
}

function getFinishedKeyboard(draw) {
  const prizeText = String(draw?.prize || "").trim();
  const shortPrize = prizeText.length > 24 ? `${prizeText.slice(0, 24)}...` : prizeText;
  return Markup.inlineKeyboard([
    Markup.button.callback(`Розыгрыш на ${shortPrize || "приз"} завершен`, "draw_finished"),
  ]);
}

async function publishDraw(draw) {
  if (draw.imagePath) {
    const message = await bot.telegram.sendPhoto(
      draw.channelId,
      { source: fs.createReadStream(draw.imagePath) },
      {
        caption: buildDrawMessage(draw, { forCaption: true }),
        parse_mode: "HTML",
        ...getKeyboard(draw.id, draw.participantIds.length),
      }
    );
    draw.messageType = "photo";
    draw.messageId = message.message_id;
  } else {
    const message = await bot.telegram.sendMessage(
      draw.channelId,
      buildDrawMessage(draw),
      {
        parse_mode: "HTML",
        ...getKeyboard(draw.id, draw.participantIds.length),
      }
    );
    draw.messageType = "text";
    draw.messageId = message.message_id;
  }

  draw.status = DRAW_STATUS.ACTIVE;
}

async function updateDrawPost(draw, includeWinners) {
  const keyboard = includeWinners ? getFinishedKeyboard(draw) : getKeyboard(draw.id, draw.participantIds.length);

  if (draw.messageType === "photo") {
    await bot.telegram.editMessageCaption(
      draw.channelId,
      draw.messageId,
      undefined,
      buildDrawMessage(draw, { includeWinners, forCaption: true }),
      {
        parse_mode: "HTML",
        ...keyboard,
      }
    );
    return;
  }

  await bot.telegram.editMessageText(
    draw.channelId,
    draw.messageId,
    undefined,
    buildDrawMessage(draw, { includeWinners }),
    {
      parse_mode: "HTML",
      ...keyboard,
    }
  );
}

function pickWinners(draw) {
  const participants = [...draw.participantIds];
  if (participants.length === 0) {
    return [];
  }

  for (let i = participants.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }

  return participants.slice(0, Math.min(draw.winnersCount, participants.length));
}

async function finishDraw(draw) {
  draw.winnerIds = pickWinners(draw);
  draw.winnerNotifications = {};
  draw.status = DRAW_STATUS.FINISHED;
  await updateDrawPost(draw, true);
  await notifyWinnersOnFinish(draw);
}

async function sendWinnerVerificationNotification(draw, userId, sentBy) {
  const userProfiles = readUserProjectProfiles();
  const { projectData } = getUserProfileBundle(userProfiles, userId, draw.projectId);
  const trc = projectData.trc20Address || "не указан";
  const payoutPrize = getWinnerPayoutText(draw, projectData);
  const task = buildCaptchaTask();
  const windowCfg = getWinnerConfirmWindow(draw);
  const expiresAt = DateTime.now().setZone(TIMEZONE).plus({ [windowCfg.unit]: windowCfg.value }).toISO();

  const message = await bot.telegram.sendMessage(
    userId,
    [
      "<b>🎉 Поздравляем! Вы выиграли в розыгрыше.</b>",
      `🏆 Приз: <b>${escapeHtml(payoutPrize)}</b>`,
      "",
      "Пройди проверку для подтверждения и получения приза 👇",
      `${task.a} + ${task.b} = ?`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(
        task.options.map((value) =>
          Markup.button.callback(String(value), `wp:cap:${draw.id}:${value}`)
        )
      ),
    }
  );

  if (!draw.winnerNotifications) {
    draw.winnerNotifications = {};
  }
  draw.winnerNotifications[String(userId)] = {
    sentAt: new Date().toISOString(),
    sentBy,
    verifiedAt: null,
    expiresAt,
    status: "pending",
    payoutPrize,
    trc20Address: trc,
    lastMessageId: message.message_id,
    captchaAnswer: task.correct,
  };

  winnerVerificationSessions.set(winnerVerificationSessionKey(userId, draw.id), {
    userId,
    drawId: draw.id,
    correct: task.correct,
    expiresAt,
  });
}

async function notifyWinnersOnFinish(draw) {
  for (const winnerId of draw.winnerIds || []) {
    try {
      await enrichUserAvatar(winnerId);
      await sendWinnerVerificationNotification(draw, winnerId, "auto_finish");
    } catch (error) {
      if (!draw.winnerNotifications) {
        draw.winnerNotifications = {};
      }
      draw.winnerNotifications[String(winnerId)] = {
        sentAt: new Date().toISOString(),
        sentBy: "auto_finish",
        verifiedAt: null,
        status: "failed",
        error: error.message,
      };
    }
  }
}

async function markWinnerNotificationExpired(draw, userId) {
  if (!draw.winnerNotifications) {
    draw.winnerNotifications = {};
  }
  if (!draw.winnerNotifications[String(userId)]) {
    draw.winnerNotifications[String(userId)] = {};
  }

  const notify = draw.winnerNotifications[String(userId)];
  if (notify.status === "expired") {
    return false;
  }

  notify.status = "expired";
  notify.expiredAt = new Date().toISOString();

  winnerVerificationSessions.delete(winnerVerificationSessionKey(userId, draw.id));

  if (notify.lastMessageId) {
    try {
      await bot.telegram.editMessageText(
        userId,
        notify.lastMessageId,
        undefined,
        buildWinnerExpiredText(draw)
      );
    } catch (error) {
      // Не критично, если не получилось отредактировать старое сообщение.
    }
  }

  return true;
}

async function processWinnerConfirmTimeouts(data) {
  const now = DateTime.now().setZone(TIMEZONE);
  let hasChanges = false;

  for (const draw of data.draws) {
    if (draw.status !== DRAW_STATUS.FINISHED || !draw.winnerNotifications) {
      continue;
    }

    for (const [userIdRaw, notify] of Object.entries(draw.winnerNotifications)) {
      const userId = Number(userIdRaw);
      if (!Number.isInteger(userId)) {
        continue;
      }

      if (notify.status === "confirmed" || notify.status === "expired") {
        continue;
      }

      const expiresAt = notify.expiresAt
        ? DateTime.fromISO(notify.expiresAt, { zone: TIMEZONE })
        : null;
      if (!expiresAt || !expiresAt.isValid || expiresAt > now) {
        continue;
      }

      const changed = await markWinnerNotificationExpired(draw, userId);
      if (changed) {
        hasChanges = true;
      }
    }
  }

  return hasChanges;
}

async function syncActiveDrawKeyboards() {
  const data = readData();
  let hasErrors = false;
  for (const draw of data.draws) {
    if (draw.status !== DRAW_STATUS.ACTIVE || !draw.messageId) {
      continue;
    }
    try {
      await updateDrawPost(draw, false);
    } catch (error) {
      hasErrors = true;
      console.error(`Не удалось обновить кнопки для ${draw.id}:`, error.message);
    }
  }
  if (!hasErrors) {
    writeData(data);
  }
}

function getUserProjectProfile(userId, projectId) {
  if (!projectId) {
    return null;
  }
  const data = readUserProjectProfiles();
  const userNode = data.users[String(userId)];
  if (!userNode || !userNode.projects) {
    return null;
  }
  return userNode.projects[projectId] || null;
}

function setUserProjectProfile(userId, projectId, payload) {
  if (!projectId) {
    return;
  }
  const data = readUserProjectProfiles();
  const userKey = String(userId);
  if (!data.users[userKey]) {
    data.users[userKey] = { projects: {} };
  }
  if (!data.users[userKey].projects) {
    data.users[userKey].projects = {};
  }

  const current = data.users[userKey].projects[projectId] || {};
  data.users[userKey].projects[projectId] = {
    ...current,
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  writeUserProjectProfiles(data);
}

function upsertUserMeta(user) {
  if (!user || !user.id) {
    return;
  }
  const data = readUserProjectProfiles();
  const userKey = String(user.id);
  if (!data.users[userKey]) {
    data.users[userKey] = { projects: {} };
  }

  data.users[userKey].meta = {
    id: user.id,
    username: user.username || "",
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    updatedAt: new Date().toISOString(),
  };
  writeUserProjectProfiles(data);
}

function getUserProfileBundle(userProfiles, userId, projectId) {
  const userNode = userProfiles.users?.[String(userId)] || {};
  const meta = userNode.meta || {};
  const projectData = userNode.projects?.[projectId] || {};
  return { meta, projectData };
}

function getWinnerDisplayName(meta, userId) {
  if (meta.username) {
    return `@${meta.username}`;
  }
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  return `ID ${userId}`;
}

function getWinnerMentionHtml(userProfiles, winnerId) {
  const userNode = userProfiles.users?.[String(winnerId)] || {};
  const meta = userNode.meta || {};
  const fallbackName = getWinnerDisplayName(meta, winnerId);
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() || fallbackName;
  if (meta.username) {
    return `<a href="https://t.me/${escapeHtml(meta.username)}">${escapeHtml(fullName)}</a>`;
  }
  return `<a href="tg://user?id=${winnerId}">${escapeHtml(fullName)}</a>`;
}

async function enrichUserAvatar(userId) {
  const userProfiles = readUserProjectProfiles();
  const userKey = String(userId);
  if (!userProfiles.users[userKey]) {
    userProfiles.users[userKey] = { projects: {}, meta: {} };
  }
  if (!userProfiles.users[userKey].meta) {
    userProfiles.users[userKey].meta = {};
  }

  try {
    const photos = await bot.telegram.getUserProfilePhotos(userId, 0, 1);
    if (photos && photos.total_count > 0 && photos.photos?.[0]?.length) {
      const best = photos.photos[0][photos.photos[0].length - 1];
      userProfiles.users[userKey].meta.avatarFileId = best.file_id;
      userProfiles.users[userKey].meta.avatarUpdatedAt = new Date().toISOString();
      writeUserProjectProfiles(userProfiles);
    }
  } catch (error) {
    // Игнорируем, если Telegram не вернул фото профиля.
  }
}

function buildCaptchaTask() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 1;
  const correct = a + b;
  const options = [
    correct,
    correct + (Math.random() > 0.5 ? 1 : -1),
    correct + (Math.random() > 0.5 ? 2 : -2),
  ];
  const unique = [...new Set(options)].slice(0, 3);
  while (unique.length < 3) {
    unique.push(correct + unique.length + 3);
  }
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return { a, b, correct, options: unique };
}

function setJoinSession(userId, session) {
  joinSessions.set(String(userId), session);
}

function getJoinSession(userId) {
  return joinSessions.get(String(userId));
}

function clearJoinSession(userId) {
  joinSessions.delete(String(userId));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trackJoinBotMessage(session, message) {
  if (!session || !message?.message_id) {
    return;
  }
  if (!Array.isArray(session.botMessageIds)) {
    session.botMessageIds = [];
  }
  session.botMessageIds.push(message.message_id);
}

function trackJoinBotMessageIds(session, messageIds) {
  if (!session || !Array.isArray(messageIds)) {
    return;
  }
  if (!Array.isArray(session.botMessageIds)) {
    session.botMessageIds = [];
  }
  session.botMessageIds.push(...messageIds.filter(Boolean));
}

async function safeDeleteMessage(chatId, messageId) {
  if (!chatId || !messageId) {
    return;
  }
  try {
    await bot.telegram.deleteMessage(chatId, messageId);
  } catch (error) {
    // Пропускаем ошибки удаления (старое сообщение/нет прав/уже удалено).
  }
}

async function cleanupJoinStage(ctx, session, extraMessageIds = []) {
  if (!session || !ctx.chat?.id) {
    return;
  }
  const ids = [...(session.botMessageIds || []), ...extraMessageIds]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  for (const messageId of ids) {
    await safeDeleteMessage(ctx.chat.id, messageId);
  }

  session.botMessageIds = [];
  setJoinSession(ctx.from.id, session);
}

async function addUserToDraw(drawId, userId) {
  const data = readData();
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw) {
    return { ok: false, cbMessage: "Розыгрыш не найден." };
  }
  if (draw.status !== DRAW_STATUS.ACTIVE) {
    return { ok: false, cbMessage: "Розыгрыш не активен." };
  }
  if (draw.participantIds.includes(userId)) {
    return { ok: true, cbMessage: "Вы уже участвуете ✅", already: true };
  }

  draw.participantIds.push(userId);
  writeData(data);

  try {
    await updateDrawPost(draw, false);
  } catch (error) {
    console.error("Не удалось обновить пост после участия:", error.message);
  }

  return {
    ok: true,
    cbMessage: "Вы участвуете ✅",
    messageHtml: buildParticipationSuccessMessage(draw),
    already: false,
  };
}

async function sendCaptchaStep(ctx, session) {
  const task = buildCaptchaTask();
  session.step = "captcha";
  session.captchaCorrect = task.correct;
  setJoinSession(ctx.from.id, session);

  const message = await ctx.reply(
    [
      "<b>Этап 1/4 · Проверка на робота</b>",
      "",
      `Решите пример: <b>${task.a} + ${task.b}</b>`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(
        task.options.map((value) => Markup.button.callback(String(value), `jp:cap:${value}`))
      ),
    }
  );
  trackJoinBotMessage(session, message);
}

async function sendTrc20Guide(ctx) {
  const stepTexts = [
    "Шаг 1/3: откройте проект и нажмите кнопку депозита.",
    "Шаг 2/3: выберите криптовалюту и сеть Tether TRC-20.",
    "Шаг 3/3: скопируйте адрес кошелька кнопкой «Копировать».",
  ];

  const sentMessageIds = [];

  for (let i = 0; i < TRC20_GUIDE_IMAGES.length; i += 1) {
    const imagePath = TRC20_GUIDE_IMAGES[i];
    if (!fs.existsSync(imagePath)) {
      continue;
    }
    const photoMessage = await ctx.replyWithPhoto({ source: imagePath }, { caption: stepTexts[i] });
    sentMessageIds.push(photoMessage.message_id);
  }

  const noteMessage = await ctx.reply(
    [
      "Важно:",
      "• принимается только TRC-20 адрес (обычно начинается с T);",
      "• отправьте адрес одним сообщением в этот чат.",
    ].join("\n")
  );
  sentMessageIds.push(noteMessage.message_id);

  return sentMessageIds;
}

async function sendRegistrationStep(ctx, session) {
  const message = await ctx.reply(
    [
      "<b>Этап 2/4 · Регистрация на проекте</b>",
      "",
      "Нажмите «Перейти на проект».",
    ].join("\n"),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[Markup.button.callback("Перейти на проект", "jp:reg:open")]]),
    }
  );
  session.step = "registration";
  session.registrationOpened = false;
  session.registrationPromptMessageId = message.message_id;
  trackJoinBotMessage(session, message);
  setJoinSession(ctx.from.id, session);
}

async function sendTrc20Step(ctx, session) {
  const projectLink = buildProjectLinkHtml(session.projectId);
  session.step = "await_trc20";
  setJoinSession(ctx.from.id, session);

  const introMessage = await ctx.reply(
    [
      "<b>Этап 4/4 · Адрес TRC-20</b>",
      "",
      `Отправьте TRC-20 адрес с ${projectLink} одним сообщением.`,
      "Если не знаете, где его взять — инструкция ниже.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
  trackJoinBotMessage(session, introMessage);

  const guideMessageIds = await sendTrc20Guide(ctx);
  trackJoinBotMessageIds(session, guideMessageIds);
  setJoinSession(ctx.from.id, session);
}

async function startJoinFlow(ctx, drawId) {
  upsertUserMeta(ctx.from);

  if (ctx.chat?.type !== "private") {
    await ctx.reply("Для участия откройте личный чат с ботом.");
    return;
  }

  const data = readData();
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw || draw.status !== DRAW_STATUS.ACTIVE) {
    await ctx.reply("Этот розыгрыш недоступен.");
    return;
  }

  if (draw.participantIds.includes(ctx.from.id)) {
    await ctx.reply("Вы уже участвуете ✅");
    return;
  }

  if (!draw.projectId) {
    const result = await addUserToDraw(draw.id, ctx.from.id);
    if (result.messageHtml) {
      await ctx.reply(result.messageHtml, { parse_mode: "HTML" });
    } else {
      await ctx.reply(result.cbMessage || "Вы участвуете ✅");
    }
    return;
  }

  const profile = getUserProjectProfile(ctx.from.id, draw.projectId);
  const canSkipVerification = profile?.referralVerified || profile?.selfReportedNonReferral;
  if (canSkipVerification && profile?.trc20Address) {
    const result = await addUserToDraw(draw.id, ctx.from.id);
    if (result.messageHtml) {
      await ctx.reply(result.messageHtml, { parse_mode: "HTML" });
    } else {
      await ctx.reply(result.cbMessage || "Вы участвуете ✅");
    }
    return;
  }

  const session = {
    userId: ctx.from.id,
    drawId,
    projectId: draw.projectId,
    step: "captcha",
    captchaCorrect: null,
    registrationOpened: false,
    registrationPromptMessageId: null,
    botMessageIds: [],
  };
  setJoinSession(ctx.from.id, session);

  const intro = await ctx.reply(
    [
      "<b>Старт участия в розыгрыше</b>",
      "",
      "Нужно пройти 4 шага.",
      "Если выиграете, бот отправит уведомление в личные сообщения.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
  trackJoinBotMessage(session, intro);
  setJoinSession(ctx.from.id, session);
  await sendCaptchaStep(ctx, session);
}

async function schedulerTick() {
  const data = readData();
  const now = DateTime.now().setZone(TIMEZONE);
  let hasChanges = false;

  for (const draw of data.draws) {
    try {
      if (draw.status === DRAW_STATUS.SCHEDULED) {
        const publishAt = DateTime.fromISO(draw.publishAt, { zone: TIMEZONE });
        if (publishAt.isValid && publishAt <= now) {
          await publishDraw(draw);
          hasChanges = true;
        }
      }

      if (draw.status === DRAW_STATUS.ACTIVE && draw.endAt) {
        const endAt = DateTime.fromISO(draw.endAt, { zone: TIMEZONE });
        if (endAt.isValid && endAt <= now) {
          await finishDraw(draw);
          hasChanges = true;
        }
      }
    } catch (error) {
      console.error(`Ошибка обработки розыгрыша ${draw.id}:`, error.message);
    }
  }

  const timeoutChanges = await processWinnerConfirmTimeouts(data);
  if (timeoutChanges) {
    hasChanges = true;
  }

  if (hasChanges) {
    writeData(data);
  }
}

function redirectWithMessage(res, message) {
  res.redirect(`/?msg=${encodeURIComponent(message)}`);
}

function renderWebPage(draws, message) {
  const projects = readProjects().projects || [];
  const knownChannels = readKnownChannels().channels || [];
  const userProfiles = readUserProjectProfiles();
  const projectOptions = projects
    .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`)
    .join("");
  const channelOptions = knownChannels
    .map((channel) => {
      const preferredValue = channel.username ? `@${channel.username}` : channel.id;
      const title = channel.title || preferredValue;
      const subtitle = channel.username ? `@${channel.username}` : channel.id;
      return `<option value="${escapeHtml(preferredValue)}">${escapeHtml(title)} (${escapeHtml(subtitle)})</option>`;
    })
    .join("");
  const drawsStats = {
    total: draws.length,
    active: draws.filter((d) => d.status === DRAW_STATUS.ACTIVE).length,
    scheduled: draws.filter((d) => d.status === DRAW_STATUS.SCHEDULED).length,
    finished: draws.filter((d) => d.status === DRAW_STATUS.FINISHED).length,
  };

  const drawBlocks = draws
    .map((draw) => {
      const project = projects.find((item) => item.id === draw.projectId);
      const statusLabel = {
        draft: "Черновик",
        scheduled: "Запланирован",
        active: "Активен",
        finished: "Завершен",
      }[draw.status] || draw.status;
      const canPublishNow = draw.status === DRAW_STATUS.SCHEDULED;
      const canFinishNow = draw.status === DRAW_STATUS.ACTIVE;
      const winnerNotifications = draw.winnerNotifications || {};
      const imagePreview = draw.imagePath
        ? `<img src="/uploads/${encodeURIComponent(path.basename(draw.imagePath))}" alt="cover" class="history-thumb" />`
        : "";
      const projectLogo = project?.logoPath
        ? `<img src="/uploads/${encodeURIComponent(path.basename(project.logoPath))}" alt="project-logo" class="logo" />`
        : "";
      const winnerRows = (draw.winnerIds || [])
        .map((winnerId) => {
          const { meta, projectData } = getUserProfileBundle(userProfiles, winnerId, draw.projectId);
          const displayName = getWinnerDisplayName(meta, winnerId);
          const nickname = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() || "Не указан";
          const username = meta.username ? `@${meta.username}` : "Нет username";
          const avatar = meta.avatarFileId
            ? `<img src="/avatar/${encodeURIComponent(String(winnerId))}" alt="winner-avatar" class="winner-avatar" />`
            : `<div class="winner-avatar winner-avatar-fallback">${escapeHtml(
                (nickname || displayName).charAt(0).toUpperCase() || "?"
              )}</div>`;
          const trcAddress = projectData.trc20Address || "Не указан";
          const notifyInfo = winnerNotifications[String(winnerId)];
          const expireLine =
            notifyInfo?.expiresAt ? `⏳ Дедлайн: ${escapeHtml(formatDateTime(notifyInfo.expiresAt))}` : null;
          const notifyStatus = notifyInfo
            ? [
                `✅ Уведомление отправлено: ${escapeHtml(formatDateTime(notifyInfo.sentAt))}`,
                notifyInfo.verifiedAt
                  ? `🤖 Проверка пройдена: ${escapeHtml(formatDateTime(notifyInfo.verifiedAt))}`
                  : notifyInfo.status === "expired"
                    ? "⛔ Время подтверждения истекло"
                    : "🤖 Проверка не пройдена",
                expireLine,
              ].join("<br>")
            : "⏳ Уведомление не отправляли";
          const notifyButtonText = notifyInfo ? "Отправить повторно" : "Отправить уведомление";
          const paidStatus = notifyInfo?.paidAt
            ? `💸 Выплачено: ${escapeHtml(formatDateTime(notifyInfo.paidAt))}`
            : "💸 Не выплачено";
          const payoutText = getWinnerPayoutText(draw, projectData);
          const refStatusText = projectData.selfReportedNonReferral
            ? "⚠️ Статус: не реф (выплата /2)"
            : "✅ Статус: реф";
          const qr = trcAddress !== "Не указан"
            ? `<img src="/qr?text=${encodeURIComponent(trcAddress)}" alt="trc-qr" class="qr" />`
            : "";

          return `
            <div class="winner-item">
              <div class="winner-head">
                ${avatar}
                <div>
                  <div><strong>${escapeHtml(displayName)}</strong> (${escapeHtml(String(winnerId))})</div>
                  <div><strong>Никнейм:</strong> ${escapeHtml(nickname)}</div>
                  <div><strong>Username:</strong> ${escapeHtml(username)}</div>
                  <div><strong>${escapeHtml(refStatusText)}</strong></div>
                </div>
              </div>
              <div><strong>К выплате:</strong> ${escapeHtml(payoutText)}</div>
              <div><strong>TRC-20:</strong> ${escapeHtml(trcAddress)}</div>
              <div class="winner-meta">${notifyStatus}</div>
              <div class="winner-meta">${paidStatus}</div>
              ${qr}
              <form method="post" action="/draws/${encodeURIComponent(draw.id)}/pay/${encodeURIComponent(String(winnerId))}">
                <button type="submit">Оплатил</button>
              </form>
              <form method="post" action="/draws/${encodeURIComponent(draw.id)}/notify/${encodeURIComponent(String(winnerId))}">
                <button type="submit">${notifyButtonText}</button>
              </form>
            </div>
          `;
        })
        .join("");

      return `
        <article class="card history-card">
          <div class="history-top">
            <div class="history-main">
              <div class="history-project">
                ${projectLogo}
                <span>${escapeHtml(project?.name || "Проект не указан")}</span>
              </div>
              <h3 class="history-prize">${escapeHtml(draw.prize)}</h3>
              <div class="history-time">Публикация: ${escapeHtml(formatDateTime(draw.publishAt))}</div>
              <div class="history-time">Окончание: ${escapeHtml(formatDateTime(draw.endAt))}</div>
            </div>
            <div class="history-side">
              <span class="badge status-${escapeHtml(draw.status)}">${escapeHtml(statusLabel)}</span>
              ${imagePreview}
            </div>
          </div>
          <div class="history-chips">
            <span class="chip">👥 Участников: ${draw.participantIds.length}</span>
            <span class="chip">🎯 Призовых мест: ${draw.winnersCount}</span>
          </div>
          ${
            draw.status === DRAW_STATUS.FINISHED
              ? `<details class="winner-block"><summary>Победители и выплаты</summary>${winnerRows || "<p>Победителей нет.</p>"}</details>`
              : ""
          }
          <details class="meta-details">
            <summary>Дополнительно</summary>
            <div class="meta-lines">
              <div><strong>Канал:</strong> ${escapeHtml(draw.channelId)}</div>
              <div><strong>ID:</strong> ${escapeHtml(draw.id)}</div>
            </div>
          </details>
          <div class="actions">
            ${
              canPublishNow
                ? `<form method="post" action="/draws/${encodeURIComponent(draw.id)}/publish-now"><button>Опубликовать сейчас</button></form>`
                : ""
            }
            ${
              canFinishNow
                ? `<form method="post" action="/draws/${encodeURIComponent(draw.id)}/finish-now"><button class="danger">Завершить сейчас</button></form>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  const projectsBlocks = projects
    .map((project) => {
      const logo = project.logoPath
        ? `<img src="/uploads/${encodeURIComponent(path.basename(project.logoPath))}" alt="project-logo" class="logo" />`
        : "";
      return `
        <article class="card">
          <div class="row-between">
            <h3>${escapeHtml(project.name)}</h3>
            <small>${escapeHtml(project.id)}</small>
          </div>
          ${logo}
          <p><strong>Реф-ссылка:</strong> <a href="${escapeHtml(project.refLink)}" target="_blank">${escapeHtml(
            project.refLink
          )}</a></p>
        </article>
      `;
    })
    .join("");

  return `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Управление розыгрышами</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    :root {
      --bg: #f3f6ff;
      --card: #ffffff;
      --text: #151a2d;
      --sub: #65708a;
      --primary: #325fff;
      --primary-2: #1f4be8;
      --line: #dfe5f4;
      --ok-bg: #ebfff1;
      --ok-line: #a7e6bc;
      --ok-text: #1f6a3c;
    }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #eef3ff 0%, var(--bg) 100%);
      margin: 0;
      color: var(--text);
    }
    .container { max-width: 1120px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 14px; font-size: 30px; letter-spacing: 0.2px; }
    h2 { margin-top: 0; margin-bottom: 14px; font-size: 22px; }
    h3 { margin: 0; }
    .subtitle { color: var(--sub); margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .card {
      background: var(--card);
      border-radius: 16px;
      padding: 18px;
      border: 1px solid var(--line);
      box-shadow: 0 8px 24px rgba(27, 45, 94, 0.06);
    }
    .card-dark {
      background: linear-gradient(135deg, #283a77 0%, #304ba1 55%, #2a4ddd 100%);
      color: #fff;
      border: none;
    }
    .card-dark .subtitle { color: #dce4ff; }
    .create-panel {
      background: linear-gradient(145deg, #20346f 0%, #2850bb 62%, #2f60f5 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 18px 42px rgba(22, 43, 110, 0.35);
      max-width: 980px;
      margin: 0 auto;
    }
    .create-form { display: grid; gap: 10px; }
    .form-section-card {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(231, 238, 255, 0.22);
      border-radius: 14px;
      padding: 10px;
      backdrop-filter: blur(3px);
    }
    .section-caption {
      font-size: 12px;
      color: #dde6ff;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    label { display: block; font-size: 12px; margin-bottom: 6px; color: #3b4560; font-weight: 600; }
    .card-dark label { color: #e7edff; }
    input, select, button {
      width: 100%;
      border-radius: 12px;
      border: 1px solid #cfd8ef;
      padding: 9px 11px;
      font-size: 13px;
      box-sizing: border-box;
      background: #fff;
    }
    .card-dark input,
    .card-dark select {
      border: 1px solid #6f86d8;
      background: rgba(255, 255, 255, 0.96);
    }
    button {
      background: var(--primary);
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: 700;
      transition: all 0.18s ease;
    }
    button:hover { background: var(--primary-2); transform: translateY(-1px); }
    .danger { background: #d73a49; }
    .danger:hover { background: #b82b38; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .row-between { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .badge {
      background: #eff3ff;
      color: #3155d4;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid #d6dffd;
    }
    .msg {
      margin-bottom: 16px;
      background: var(--ok-bg);
      border: 1px solid var(--ok-line);
      color: var(--ok-text);
      padding: 11px 13px;
      border-radius: 12px;
      font-weight: 600;
    }
    .hint { color: var(--sub); font-size: 12px; margin-top: 4px; margin-bottom: 6px; }
    .card-dark .hint { color: #d1ddff; margin-top: 2px; }
    .actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .actions form { margin: 0; width: auto; min-width: 220px; }
    .preview { width: 100%; max-height: 280px; object-fit: cover; border-radius: 12px; margin: 10px 0; border: 1px solid #ececec; }
    .logo { width: 88px; height: 88px; object-fit: contain; border: 1px solid #ececec; border-radius: 12px; padding: 8px; background: #fff; }
    .winner-block { margin-top: 12px; padding: 10px 12px; border: 1px solid #e2e8fb; border-radius: 12px; background: #f9fbff; }
    .winner-block summary { cursor: pointer; font-weight: 700; color: #3e4f82; }
    .winner-item { border: 1px solid #dce4fb; border-radius: 10px; padding: 10px; background: #fff; margin-bottom: 8px; }
    .winner-meta { color: #5d6c8f; font-size: 13px; margin: 4px 0 8px; }
    .winner-head { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px; }
    .winner-avatar { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 1px solid #dce4fb; }
    .winner-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #edf2ff;
      color: #2e4db9;
      font-weight: 800;
      font-size: 18px;
    }
    .qr { width: 140px; height: 140px; border: 1px solid #e2e7f8; border-radius: 10px; background: #fff; padding: 6px; margin-bottom: 8px; }
    .paste-box {
      margin-top: 6px;
      border: 1.5px dashed #9db0e9;
      border-radius: 12px;
      background: #f8fbff;
      padding: 8px;
    }
    .paste-box .title {
      font-size: 13px;
      font-weight: 700;
      color: #3857c4;
      margin-bottom: 6px;
    }
    .paste-target {
      border: 1px dashed #b5c2e8;
      border-radius: 10px;
      background: #fff;
      padding: 8px;
      font-size: 12px;
      color: #66708a;
      outline: none;
      min-height: 34px;
    }
    .paste-preview {
      display: none;
      margin-top: 8px;
      border: 1px solid #dce3f7;
      border-radius: 12px;
      max-height: 180px;
      object-fit: contain;
      width: auto;
      max-width: 100%;
      background: #fff;
    }
    .section-title {
      margin: 8px 0 4px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #7682a0;
      font-weight: 800;
    }
    .admin-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
    .btn-secondary { background: #ffffff; color: #2c3f86; border: 1px solid #cad6ff; }
    .btn-secondary:hover { background: #f5f8ff; }
    .panel-hidden { display: none; }
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 10px 0 2px; }
    .stat-card { background: #fff; border: 1px solid #dde5fb; border-radius: 12px; padding: 10px 12px; }
    .stat-card span { color: #7582a5; font-size: 12px; display: block; margin-bottom: 4px; }
    .stat-card b { font-size: 20px; }
    .draw-history-title { margin: 2px 0 10px; font-size: 20px; }
    .history-card { border-left: 4px solid #b8c9ff; padding: 14px; }
    .history-top { display: flex; justify-content: space-between; gap: 12px; }
    .history-main { min-width: 0; }
    .history-project { display: flex; align-items: center; gap: 8px; color: #5d6b8f; font-size: 13px; }
    .history-project .logo { width: 28px; height: 28px; padding: 3px; border-radius: 8px; }
    .history-prize { margin: 4px 0 6px; font-size: 20px; line-height: 1.25; }
    .history-time { color: #6b7694; font-size: 13px; margin-bottom: 2px; }
    .history-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .history-thumb { width: 110px; height: 72px; border-radius: 10px; object-fit: cover; border: 1px solid #dde5fb; }
    .history-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .chip { background: #f4f7ff; border: 1px solid #dce4fb; border-radius: 999px; padding: 6px 10px; font-size: 12px; color: #334a88; }
    .meta-details { margin-top: 10px; border: 1px solid #e2e8fb; border-radius: 10px; background: #fbfcff; padding: 8px 10px; }
    .meta-details summary { cursor: pointer; font-weight: 600; color: #4f5c7f; }
    .meta-lines { margin-top: 8px; display: grid; gap: 4px; font-size: 13px; color: #3d4460; }
    .status-active { background: #eaffef; color: #21754a; border-color: #b7edc9; }
    .status-scheduled { background: #eef3ff; color: #2d56cc; border-color: #d4dfff; }
    .status-finished { background: #f3f4f8; color: #555f76; border-color: #dde1ea; }
    .project-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .history-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .compact-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .compact-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .subtle-details { margin-top: 4px; border: 1px dashed rgba(211, 223, 255, 0.6); border-radius: 10px; padding: 6px 8px; }
    .subtle-details summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #dbe6ff; }
    .form-footer { display: flex; justify-content: flex-end; margin-top: 2px; }
    .form-footer button { max-width: 220px; }
    @media (max-width: 900px) {
      .row, .row-3 { grid-template-columns: 1fr; }
      .actions form { width: 100%; }
      .container { padding: 16px; }
      .admin-actions, .stats-row, .project-layout, .history-list { grid-template-columns: 1fr; }
      .history-side { align-items: flex-start; }
      .history-thumb { width: 100%; max-width: 220px; height: auto; }
      .compact-grid-2, .compact-grid-3 { grid-template-columns: 1fr; }
      .form-footer button { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Розыгрыши Telegram</h1>
    <div class="subtitle">Управление проектами, публикациями и участниками в одном месте.</div>
    ${message ? `<div class="msg">${escapeHtml(message)}</div>` : ""}
    <div class="grid">
      <div class="admin-actions">
        <button id="toggleCreateDrawBtn" type="button">Создать розыгрыш</button>
        <button id="toggleProjectsBtn" type="button" class="btn-secondary">Управление проектами</button>
      </div>

      <section id="createDrawPanel" class="card card-dark create-panel panel-hidden">
        <h2>Создать розыгрыш</h2>
        <div class="subtitle">Только нужные поля: быстрое создание без перегруза.</div>
        <form id="create-draw-form" method="post" action="/draws" enctype="multipart/form-data" class="create-form">
          <div class="form-section-card">
            <div class="section-caption">Проект и канал</div>
            <div class="compact-grid-2">
              <label>Проект
                <select name="projectId" required>
                  <option value="">-- Выбрать проект --</option>
                  ${projectOptions}
                </select>
              </label>
              <label>Канал из подключенных
                <select name="knownChannelId">
                  <option value="">-- Выбрать --</option>
                  ${channelOptions}
                </select>
              </label>
            </div>
            <details class="subtle-details">
              <summary>Указать канал вручную</summary>
              <label style="margin-top:8px;">@username или -100...
                <input name="channelId" placeholder="@my_channel или -1001234567890" />
              </label>
            </details>
            <p class="hint">Если список пустой — добавьте бота админом и опубликуйте пост в канале.</p>
          </div>

          <div class="form-section-card">
            <div class="section-caption">Приз и медиа</div>
            <div class="compact-grid-2">
              <label>Тип приза
                <select id="prizeType" name="prizeType" required>
                  <option value="money_rub">Денежный (₽)</option>
                  <option value="custom">Другое</option>
                </select>
              </label>
              <div id="moneyPrizeFields">
                <label>Сумма в рублях
                  <input name="prizeAmountRub" type="number" min="1" step="1" placeholder="50000" />
                </label>
              </div>
              <div id="customPrizeFields" style="display:none;">
                <label>Описание приза
                  <input name="prizeCustomText" placeholder="Например: iPhone 16 Pro" />
                </label>
              </div>
            </div>
            <div class="compact-grid-2">
              <label>Картинка (необязательно)
                <input id="draw-image-input" name="image" type="file" accept="image/*" />
              </label>
              <details class="subtle-details">
                <summary>Вставить из буфера обмена</summary>
                <div class="paste-box">
                  <div class="title">Вставьте картинку (Cmd+V)</div>
                  <div id="draw-paste-target" class="paste-target" contenteditable="true">
                    Нажмите сюда и вставьте картинку
                  </div>
                  <input type="hidden" id="draw-clipboard-data" name="imageClipboardData" data-field-name="imageClipboardData" />
                  <img id="draw-paste-preview" class="paste-preview" alt="draw-clipboard-preview" />
                </div>
              </details>
            </div>
          </div>

          <div class="form-section-card">
            <div class="section-caption">Параметры публикации</div>
            <div class="compact-grid-3">
              <label>Победителей
                <input name="winnersCount" type="number" min="1" max="20" value="1" required />
              </label>
              <label>Когда публиковать
                <select id="publishMode" name="publishMode">
                  <option value="now">Сейчас</option>
                  <option value="scheduled">По времени</option>
                </select>
              </label>
              <label id="publishAtWrap">Время публикации
                <input name="publishAt" type="datetime-local" value="${escapeHtml(
                  formatDateTimeForInput(DateTime.now().setZone(TIMEZONE).plus({ minutes: 1 }).toISO())
                )}" />
              </label>
            </div>
            <div class="compact-grid-2">
              <label>Как завершать
                <select id="endMode" name="endMode">
                  <option value="manual">Вручную</option>
                  <option value="scheduled">По времени</option>
                </select>
              </label>
              <label id="endAfterWrap">Время завершения
                <div class="compact-grid-2">
                  <input name="endAfterValue" type="number" min="1" step="1" placeholder="10" />
                  <select name="endAfterUnit">
                    <option value="minutes">Минут</option>
                    <option value="hours">Часов</option>
                    <option value="days">Дней</option>
                  </select>
                </div>
              </label>
            </div>
            <div class="compact-grid-2">
              <label>Таймер подтверждения победы
                <div class="compact-grid-2">
                  <input name="winnerConfirmValue" type="number" min="1" step="1" value="30" />
                  <select name="winnerConfirmUnit">
                    <option value="minutes">Минут</option>
                    <option value="hours">Часов</option>
                  </select>
                </div>
              </label>
            </div>
          </div>
          <div class="form-footer">
            <button type="submit">Создать розыгрыш</button>
          </div>
        </form>
      </section>

      <section id="projectsPanel" class="card panel-hidden">
        <h2>Управление проектами</h2>
        <div class="project-layout">
          <div>
            <form id="create-project-form" method="post" action="/projects" enctype="multipart/form-data">
              <label>Название проекта
                <input name="name" required />
              </label>
              <label>Реферальная ссылка
                <input name="refLink" type="url" placeholder="https://..." required />
              </label>
              <label>Лого (png/svg/webp, желательно прозрачный фон)
                <input id="project-logo-input" name="logo" type="file" accept="image/*" />
              </label>
              <div class="paste-box">
                <div class="title">Или вставьте лого из буфера обмена</div>
                <div id="project-paste-target" class="paste-target" contenteditable="true">
                  Нажмите сюда и вставьте картинку (Cmd+V)
                </div>
                <input type="hidden" id="project-clipboard-data" name="logoClipboardData" data-field-name="logoClipboardData" />
                <img id="project-paste-preview" class="paste-preview" alt="project-clipboard-preview" />
              </div>
              <button type="submit">Добавить проект</button>
            </form>
          </div>
          <div>
            ${projectsBlocks || `<article class="card"><p>Проектов пока нет.</p></article>`}
          </div>
        </div>
      </section>

      <section class="card">
        <h2 class="draw-history-title">История розыгрышей</h2>
        <div class="subtitle" style="margin-bottom:10px;">Компактная лента с ключевыми данными и быстрыми действиями.</div>
        <div class="stats-row">
          <div class="stat-card"><span>Всего</span><b>${drawsStats.total}</b></div>
          <div class="stat-card"><span>Активных</span><b>${drawsStats.active}</b></div>
          <div class="stat-card"><span>Запланированных</span><b>${drawsStats.scheduled}</b></div>
          <div class="stat-card"><span>Завершенных</span><b>${drawsStats.finished}</b></div>
        </div>
      </section>

      <section>
        ${
          drawBlocks
            ? `<div class="history-list">${drawBlocks}</div>`
            : `<article class="card"><p>Розыгрышей пока нет.</p></article>`
        }
      </section>
    </div>
  </div>
  <script>
    function setupPasteImage(targetId, hiddenInputId, previewId) {
      const target = document.getElementById(targetId);
      const hiddenInput = document.getElementById(hiddenInputId);
      const preview = document.getElementById(previewId);
      if (!target || !hiddenInput || !preview) return;

      target.addEventListener("paste", (event) => {
        const items = event.clipboardData?.items || [];
        const imageItem = Array.from(items).find((item) => item.type && item.type.startsWith("image/"));
        if (!imageItem) {
          return;
        }
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          const fieldName = hiddenInput.dataset.fieldName;
          if (fieldName) {
            hiddenInput.setAttribute("name", fieldName);
          }
          hiddenInput.value = dataUrl;
          preview.src = dataUrl;
          preview.style.display = "block";
          target.textContent = "Картинка из буфера вставлена ✅";
        };
        reader.readAsDataURL(file);
      });
    }

    function dataUrlToFile(dataUrl, filename) {
      const match = String(dataUrl).match(/^data:(image\\/[a-z+]+);base64,(.+)$/i);
      if (!match) {
        throw new Error("invalid data url");
      }
      const mime = match[1];
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new File([bytes], filename, { type: mime });
    }

    function setupClipboardSubmit(formId, hiddenInputId, fileInputId, defaultFilename) {
      const form = document.getElementById(formId);
      const hiddenInput = document.getElementById(hiddenInputId);
      const fileInput = document.getElementById(fileInputId);
      if (!form || !hiddenInput || !fileInput) return;

      const mimeExt = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
      };

      form.addEventListener("submit", (event) => {
        if (!hiddenInput.value) {
          return;
        }
        if (fileInput.files && fileInput.files.length > 0) {
          hiddenInput.removeAttribute("name");
          hiddenInput.value = "";
          return;
        }

        try {
          const mime = hiddenInput.value.match(/^data:(image\\/[a-z+]+);/i)?.[1] || "image/png";
          const ext = mimeExt[mime] || "png";
          const file = dataUrlToFile(hiddenInput.value, defaultFilename + "." + ext);
          const transfer = new DataTransfer();
          transfer.items.add(file);
          fileInput.files = transfer.files;
          hiddenInput.removeAttribute("name");
          hiddenInput.value = "";
        } catch (error) {
          event.preventDefault();
          alert("Не удалось отправить картинку из буфера. Выберите файл через «Выбрать файл».");
        }
      });
    }

    function setupPrizeTypeToggle() {
      const prizeType = document.getElementById("prizeType");
      const moneyFields = document.getElementById("moneyPrizeFields");
      const customFields = document.getElementById("customPrizeFields");
      if (!prizeType || !moneyFields || !customFields) return;

      function sync() {
        const isMoney = prizeType.value === "money_rub";
        moneyFields.style.display = isMoney ? "block" : "none";
        customFields.style.display = isMoney ? "none" : "block";
      }

      prizeType.addEventListener("change", sync);
      sync();
    }

    function setupPublishEndToggles() {
      const publishMode = document.getElementById("publishMode");
      const publishAtWrap = document.getElementById("publishAtWrap");
      const endMode = document.getElementById("endMode");
      const endAfterWrap = document.getElementById("endAfterWrap");
      if (!publishMode || !publishAtWrap || !endMode || !endAfterWrap) return;

      function syncPublish() {
        publishAtWrap.style.display = publishMode.value === "scheduled" ? "block" : "none";
      }

      function syncEnd() {
        endAfterWrap.style.display = endMode.value === "scheduled" ? "block" : "none";
      }

      publishMode.addEventListener("change", syncPublish);
      endMode.addEventListener("change", syncEnd);
      syncPublish();
      syncEnd();
    }

    function setupAdminPanels() {
      const createBtn = document.getElementById("toggleCreateDrawBtn");
      const projectsBtn = document.getElementById("toggleProjectsBtn");
      const createPanel = document.getElementById("createDrawPanel");
      const projectsPanel = document.getElementById("projectsPanel");
      if (!createBtn || !projectsBtn || !createPanel || !projectsPanel) return;

      createBtn.addEventListener("click", () => {
        const willOpen = createPanel.classList.contains("panel-hidden");
        createPanel.classList.toggle("panel-hidden");
        if (willOpen) {
          projectsPanel.classList.add("panel-hidden");
          createBtn.textContent = "Скрыть создание розыгрыша";
          projectsBtn.textContent = "Управление проектами";
        } else {
          createBtn.textContent = "Создать розыгрыш";
        }
      });

      projectsBtn.addEventListener("click", () => {
        const willOpen = projectsPanel.classList.contains("panel-hidden");
        projectsPanel.classList.toggle("panel-hidden");
        if (willOpen) {
          createPanel.classList.add("panel-hidden");
          projectsBtn.textContent = "Скрыть управление проектами";
          createBtn.textContent = "Создать розыгрыш";
        } else {
          projectsBtn.textContent = "Управление проектами";
        }
      });
    }

    setupPasteImage("draw-paste-target", "draw-clipboard-data", "draw-paste-preview");
    setupPasteImage("project-paste-target", "project-clipboard-data", "project-paste-preview");
    setupClipboardSubmit("create-draw-form", "draw-clipboard-data", "draw-image-input", "pasted-draw");
    setupClipboardSubmit("create-project-form", "project-clipboard-data", "project-logo-input", "pasted-logo");
    setupPrizeTypeToggle();
    setupPublishEndToggles();
    setupAdminPanels();
  </script>
</body>
</html>`;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = ext || ".jpg";
      cb(null, `${Date.now()}_${Math.floor(Math.random() * 100000)}${safeExt}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    fieldSize: 64 * 1024,
  },
});

app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/", (req, res) => {
  const data = readData();
  const draws = data.draws.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.type("html").send(renderWebPage(draws, req.query.msg));
});

app.get("/qr", async (req, res) => {
  const text = String(req.query.text || "").trim();
  if (!text) {
    res.status(400).send("text is required");
    return;
  }

  try {
    const svg = await QRCode.toString(text, {
      type: "svg",
      width: 180,
      margin: 1,
    });
    res.type("image/svg+xml").send(svg);
  } catch (error) {
    res.status(500).send("QR generation error");
  }
});

app.get("/avatar/:userId", async (req, res) => {
  const userId = req.params.userId;
  const userProfiles = readUserProjectProfiles();
  const fileId = userProfiles.users?.[String(userId)]?.meta?.avatarFileId;
  if (!fileId) {
    res.status(404).send("No avatar");
    return;
  }

  try {
    const url = await bot.telegram.getFileLink(fileId);
    res.redirect(String(url));
  } catch (error) {
    res.status(404).send("Avatar unavailable");
  }
});

app.post("/projects", upload.single("logo"), (req, res) => {
  const body = req.body || {};
  const name = (body.name || "").trim();
  const refLink = (body.refLink || "").trim();
  const logoClipboardData = (body.logoClipboardData || "").trim();

  if (!name || !refLink) {
    redirectWithMessage(res, "Укажите название проекта и реф-ссылку.");
    return;
  }

  let logoPath = req.file ? req.file.path : "";
  if (!logoPath && logoClipboardData) {
    logoPath = saveClipboardImage(logoClipboardData, "project_logo");
  }

  const projectsData = readProjects();
  projectsData.projects.push({
    id: createProjectId(),
    name,
    refLink,
    logoPath,
    createdAt: new Date().toISOString(),
  });
  writeProjects(projectsData);

  redirectWithMessage(res, "Проект добавлен.");
});

app.post("/draws", upload.single("image"), async (req, res) => {
  try {
    const body = req.body || {};
    const manualChannelId = (body.channelId || "").trim();
    const selectedChannelId = (body.knownChannelId || "").trim();
    const channelId = selectedChannelId || manualChannelId;
    const projectId = (body.projectId || "").trim();
    const prizeType = body.prizeType === "custom" ? "custom" : "money_rub";
    const prizeAmountRubRaw = String(body.prizeAmountRub || "").replace(/\s+/g, "");
    const prizeAmountRub = Number(prizeAmountRubRaw);
    const prizeCustomText = (body.prizeCustomText || "").trim();
    const imageClipboardData = (body.imageClipboardData || "").trim();
    const endAfterValue = Number(body.endAfterValue);
    const endAfterUnit = ["minutes", "hours", "days"].includes(body.endAfterUnit)
      ? body.endAfterUnit
      : "minutes";
    const winnerConfirmValue = Number(body.winnerConfirmValue);
    const winnerConfirmUnit = ["minutes", "hours"].includes(body.winnerConfirmUnit)
      ? body.winnerConfirmUnit
      : "minutes";
    const publishMode = body.publishMode === "scheduled" ? "scheduled" : "now";
    const endMode = body.endMode === "scheduled" ? "scheduled" : "manual";
    const winnersCount = Number(body.winnersCount);

    let prize = "";
    if (prizeType === "money_rub") {
      if (!Number.isFinite(prizeAmountRub) || prizeAmountRub <= 0) {
        redirectWithMessage(res, "Для денежного приза укажите корректную сумму в рублях.");
        return;
      }
      prize = formatRubAmount(prizeAmountRub);
    } else {
      if (!prizeCustomText) {
        redirectWithMessage(res, "Для типа приза «Другое» укажите описание.");
        return;
      }
      prize = prizeCustomText;
    }

    if (!channelId || !projectId) {
      redirectWithMessage(res, "Выберите проект, канал (или введите вручную) и укажите приз.");
      return;
    }

    if (!getProjectById(projectId)) {
      redirectWithMessage(res, "Выбранный проект не найден.");
      return;
    }

    if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 20) {
      redirectWithMessage(res, "Количество победителей должно быть от 1 до 20.");
      return;
    }
    if (!Number.isFinite(winnerConfirmValue) || winnerConfirmValue <= 0) {
      redirectWithMessage(res, "Укажите корректный таймер подтверждения победы.");
      return;
    }

    let publishAtISO = DateTime.now().setZone(TIMEZONE).toISO();
    if (publishMode === "scheduled") {
      const publishAt = parseDateTimeFromWeb(body.publishAt || "");
      if (!publishAt) {
        redirectWithMessage(res, "Укажите корректное время публикации.");
        return;
      }
      publishAtISO = publishAt.toISO();
    }

    let endAtISO = "";
    let normalizedEndAfterValue = null;
    let normalizedEndAfterUnit = null;
    if (endMode === "scheduled") {
      if (!Number.isFinite(endAfterValue) || endAfterValue <= 0) {
        redirectWithMessage(res, "Укажите корректный интервал завершения (число больше 0).");
        return;
      }

      normalizedEndAfterValue = Math.floor(endAfterValue);
      normalizedEndAfterUnit = endAfterUnit;
      const publishAt = DateTime.fromISO(publishAtISO, { zone: TIMEZONE });
      const endAt = publishAt.plus({
        [normalizedEndAfterUnit]: normalizedEndAfterValue,
      });
      endAtISO = endAt.toISO();
    }

    try {
      const chat = await bot.telegram.getChat(channelId);
      if (chat.type !== "channel") {
        redirectWithMessage(res, "Указанный чат не является каналом.");
        return;
      }
      upsertKnownChannel(chat);
    } catch (error) {
      redirectWithMessage(
        res,
        "Не удалось получить доступ к каналу. Добавьте бота в канал админом и отправьте любой пост в канале."
      );
      return;
    }

    let drawImagePath = req.file ? req.file.path : "";
    if (!drawImagePath && imageClipboardData) {
      drawImagePath = saveClipboardImage(imageClipboardData, "draw_image");
    }

    const draw = {
      id: createDrawId(),
      status: publishMode === "now" ? DRAW_STATUS.ACTIVE : DRAW_STATUS.SCHEDULED,
      projectId,
      channelId,
      prizeType,
      prize,
      prizeAmountRub: prizeType === "money_rub" ? Math.floor(prizeAmountRub) : null,
      imagePath: drawImagePath,
      publishAt: publishAtISO,
      endAt: endAtISO,
      endAfterValue: normalizedEndAfterValue,
      endAfterUnit: normalizedEndAfterUnit,
      winnersCount,
      createdBy: ADMIN_IDS[0],
      createdAt: new Date().toISOString(),
      messageId: null,
      messageType: "text",
      participantIds: [],
      winnerIds: [],
      winnerNotifications: {},
      winnerConfirmValue: Math.floor(winnerConfirmValue),
      winnerConfirmUnit,
    };

    if (publishMode === "now") {
      await publishDraw(draw);
    }

    const data = readData();
    data.draws.push(draw);
    writeData(data);

    redirectWithMessage(
      res,
      publishMode === "now"
        ? "Розыгрыш создан и опубликован сразу."
        : "Розыгрыш создан и будет опубликован по расписанию."
    );
  } catch (error) {
    console.error("Ошибка создания розыгрыша через веб:", error);
    redirectWithMessage(res, `Ошибка: ${error.message}`);
  }
});

app.post("/draws/:id/publish-now", async (req, res) => {
  const data = readData();
  const draw = data.draws.find((item) => item.id === req.params.id);

  if (!draw) {
    redirectWithMessage(res, "Розыгрыш не найден.");
    return;
  }

  if (draw.status !== DRAW_STATUS.SCHEDULED) {
    redirectWithMessage(res, "Можно публиковать сейчас только запланированные розыгрыши.");
    return;
  }

  try {
    await publishDraw(draw);
    writeData(data);
    redirectWithMessage(res, "Розыгрыш опубликован.");
  } catch (error) {
    console.error("Ошибка публикации через веб:", error);
    redirectWithMessage(res, `Не удалось опубликовать: ${error.message}`);
  }
});

app.post("/draws/:id/finish-now", async (req, res) => {
  const data = readData();
  const draw = data.draws.find((item) => item.id === req.params.id);

  if (!draw) {
    redirectWithMessage(res, "Розыгрыш не найден.");
    return;
  }

  if (draw.status !== DRAW_STATUS.ACTIVE) {
    redirectWithMessage(res, "Можно завершать только активные розыгрыши.");
    return;
  }

  try {
    await finishDraw(draw);
    writeData(data);
    redirectWithMessage(res, "Розыгрыш завершен вручную.");
  } catch (error) {
    console.error("Ошибка ручного завершения:", error);
    redirectWithMessage(res, `Не удалось завершить: ${error.message}`);
  }
});

app.post("/draws/:id/notify/:userId", async (req, res) => {
  const drawId = req.params.id;
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId)) {
    redirectWithMessage(res, "Некорректный userId победителя.");
    return;
  }

  const data = readData();
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw) {
    redirectWithMessage(res, "Розыгрыш не найден.");
    return;
  }

  if (!draw.winnerIds?.includes(userId)) {
    redirectWithMessage(res, "Пользователь не является победителем этого розыгрыша.");
    return;
  }

  await enrichUserAvatar(userId);

  try {
    await sendWinnerVerificationNotification(draw, userId, ADMIN_IDS[0]);
  } catch (error) {
    redirectWithMessage(
      res,
      "Не удалось отправить уведомление. Возможно, пользователь не открыл личный чат с ботом."
    );
    return;
  }

  writeData(data);

  redirectWithMessage(res, `Уведомление отправлено пользователю ${userId}.`);
});

app.post("/draws/:id/pay/:userId", async (req, res) => {
  const drawId = req.params.id;
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId)) {
    redirectWithMessage(res, "Некорректный userId победителя.");
    return;
  }

  const data = readData();
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw) {
    redirectWithMessage(res, "Розыгрыш не найден.");
    return;
  }
  if (!draw.winnerIds?.includes(userId)) {
    redirectWithMessage(res, "Пользователь не является победителем этого розыгрыша.");
    return;
  }

  const userProfiles = readUserProjectProfiles();
  const { projectData } = getUserProfileBundle(userProfiles, userId, draw.projectId);
  const payoutText = getWinnerPayoutText(draw, projectData);

  try {
    await bot.telegram.sendMessage(userId, `✅ Ваш приз ${payoutText} выплачен!`);
  } catch (error) {
    redirectWithMessage(res, "Не удалось отправить сообщение о выплате победителю.");
    return;
  }

  if (!draw.winnerNotifications) {
    draw.winnerNotifications = {};
  }
  if (!draw.winnerNotifications[String(userId)]) {
    draw.winnerNotifications[String(userId)] = {};
  }
  draw.winnerNotifications[String(userId)].paidAt = new Date().toISOString();
  draw.winnerNotifications[String(userId)].paidBy = ADMIN_IDS[0];
  writeData(data);

  redirectWithMessage(res, `Победителю ${userId} отмечена выплата.`);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err?.name === "MulterError") {
    const messages = {
      LIMIT_FILE_SIZE: `Файл слишком большой (максимум ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ).`,
      LIMIT_FIELD_VALUE: `Картинка из буфера слишком большая (максимум ~${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ). Выберите файл меньше или загрузите через «Выбрать файл».`,
    };
    redirectWithMessage(res, messages[err.code] || `Ошибка загрузки: ${err.message}`);
    return;
  }
  next(err);
});

bot.on("my_chat_member", async (ctx) => {
  const payload = ctx.update?.my_chat_member;
  if (!payload || payload.chat?.type !== "channel") {
    return;
  }

  const status = payload.new_chat_member?.status;
  if (status === "administrator" || status === "member") {
    upsertKnownChannel(payload.chat);
  }
});

bot.on("channel_post", async (ctx) => {
  if (ctx.chat?.type !== "channel") {
    return;
  }
  upsertKnownChannel(ctx.chat);
});

bot.start(async (ctx) => {
  const payload = parseStartPayload(ctx);
  if (payload.startsWith("join_")) {
    const drawId = payload.replace(/^join_/, "");
    await startJoinFlow(ctx, drawId);
    return;
  }

  if (!isAdmin(ctx)) {
    await ctx.reply("Привет! Этот бот используется для участия в розыгрышах через кнопку в канале.");
    return;
  }

  await ctx.reply(
    [
      "Привет! Я помогу управлять розыгрышами.",
      "",
      "Команды:",
      "• /create_draw — создать розыгрыш через чат",
      "• /my_draws — показать розыгрыши",
      "• /cancel_draw — отменить создание",
      "• /channels — список подключенных каналов",
      "• /join <draw_id> — ручной запуск входа в розыгрыш",
      "",
      `Веб-панель: ${WEB_PUBLIC_URL || `http://localhost:${WEB_PORT}`}`,
    ].join("\n")
  );
});

bot.command("join", async (ctx) => {
  const parts = (ctx.message?.text || "").split(" ");
  const drawId = parts[1];
  if (!drawId) {
    await ctx.reply("Использование: /join <draw_id>");
    return;
  }
  await startJoinFlow(ctx, drawId.trim());
});

bot.command("trc20_help", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Откройте личный чат с ботом и отправьте /trc20_help");
    return;
  }
  await sendTrc20Guide(ctx);
});

bot.command("create_draw", async (ctx) => {
  if (!isAdmin(ctx)) {
    return;
  }

  createSession(ctx.from.id);
  await ctx.reply(
    "Шаг 1/5. Отправьте ID канала или @username канала.\nПример: @my_channel или -1001234567890"
  );
});

bot.command("cancel_draw", async (ctx) => {
  if (!isAdmin(ctx)) {
    return;
  }

  removeSession(ctx.from.id);
  await ctx.reply("Создание розыгрыша отменено.");
});

bot.command("channels", async (ctx) => {
  if (!isAdmin(ctx)) {
    return;
  }

  const channels = readKnownChannels().channels || [];
  if (channels.length === 0) {
    await ctx.reply(
      [
        "Пока нет известных каналов.",
        "Добавьте бота админом в канал и опубликуйте любой пост в канале.",
        "После этого канал появится автоматически.",
      ].join("\n")
    );
    return;
  }

  const lines = channels.map((channel) => {
    const handle = channel.username ? `@${channel.username}` : channel.id;
    return `• ${channel.title || "Без названия"} — ${handle}`;
  });
  await ctx.reply(`Подключенные каналы:\n${lines.join("\n")}`);
});

bot.command("my_draws", async (ctx) => {
  if (!isAdmin(ctx)) {
    return;
  }

  const data = readData();
  const myDraws = data.draws
    .filter((draw) => draw.createdBy === ctx.from.id || draw.createdBy === ADMIN_IDS[0])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  if (myDraws.length === 0) {
    await ctx.reply("У вас пока нет розыгрышей.");
    return;
  }

  const lines = myDraws.map((draw) => {
    return [
      `ID: ${draw.id}`,
      `Статус: ${draw.status}`,
      `Приз: ${draw.prize}`,
      `Публикация: ${formatDateTime(draw.publishAt)}`,
      `Окончание: ${formatDateTime(draw.endAt)}`,
      `Участников: ${draw.participantIds.length}`,
    ].join(" | ");
  });

  await ctx.reply(lines.join("\n\n"));
});

bot.on("text", async (ctx) => {
  upsertUserMeta(ctx.from);

  if (ctx.chat?.type === "private") {
    const joinSession = getJoinSession(ctx.from.id);
    if (joinSession && joinSession.step === "await_ref_nickname") {
      const projectLink = buildProjectLinkHtml(joinSession.projectId);
      const nickname = ctx.message.text.trim();
      if (nickname.length < 3) {
        const failMessage = await ctx.reply(
          `Никнейм слишком короткий. Введите никнейм с ${projectLink} (минимум 3 символа).`,
          { parse_mode: "HTML" }
        );
        trackJoinBotMessage(joinSession, failMessage);
        setJoinSession(ctx.from.id, joinSession);
        return;
      }

      await cleanupJoinStage(ctx, joinSession, [ctx.message.message_id]);
      const checkingMessage = await ctx.reply(
        [
          "<b>Этап 3/4 · Проверка реферала</b>",
          "",
          `Проверяю никнейм <b>${escapeHtml(nickname)}</b> в базе проекта...`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );

      const delayMs = (Math.floor(Math.random() * 8) + 8) * 1000;
      await sleep(delayMs);

      await safeDeleteMessage(ctx.chat.id, checkingMessage.message_id);
      setUserProjectProfile(ctx.from.id, joinSession.projectId, {
        referralVerified: true,
        selfReportedNonReferral: false,
        referralNickname: nickname,
        referralCheckedAt: new Date().toISOString(),
      });

      await sendTrc20Step(ctx, joinSession);
      return;
    }

    if (joinSession && joinSession.step === "await_trc20") {
      const projectLink = buildProjectLinkHtml(joinSession.projectId);
      const address = ctx.message.text.trim();
      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
        const invalidMessage = await ctx.reply(
          `Неверный формат TRC-20 адреса. Отправьте адрес с ${projectLink}.\nПример: T... (34 символа).\nЕсли нужна инструкция: /trc20_help`,
          { parse_mode: "HTML" }
        );
        trackJoinBotMessage(joinSession, invalidMessage);
        setJoinSession(ctx.from.id, joinSession);
        return;
      }

      await cleanupJoinStage(ctx, joinSession, [ctx.message.message_id]);
      setUserProjectProfile(ctx.from.id, joinSession.projectId, {
        referralVerified: joinSession.skipReferralCheck ? false : true,
        selfReportedNonReferral: Boolean(joinSession.skipReferralCheck),
        trc20Address: address,
        verifiedBy: "manual_confirmation",
      });
      clearJoinSession(ctx.from.id);

      const result = await addUserToDraw(joinSession.drawId, ctx.from.id);
      if (result.messageHtml) {
        await ctx.reply(result.messageHtml, { parse_mode: "HTML" });
      } else {
        await ctx.reply(result.cbMessage || "Вы участвуете ✅");
      }
      return;
    }
  }

  if (!isAdmin(ctx)) {
    return;
  }

  const session = sessions.get(ctx.from.id);
  if (!session) {
    return;
  }

  const text = ctx.message.text.trim();
  const { draft } = session;

  if (session.step === "channelId") {
    draft.channelId = text;
    session.step = "prize";
    await ctx.reply("Шаг 2/5. Укажите приз.");
    return;
  }

  if (session.step === "prize") {
    draft.prize = text;
    session.step = "publishAt";
    await ctx.reply(
      `Шаг 3/5. Укажите дату и время публикации в формате YYYY-MM-DD HH:mm (${TIMEZONE}).`
    );
    return;
  }

  if (session.step === "publishAt") {
    const dt = parseDateTimeFromBot(text);
    if (!dt) {
      await ctx.reply("Неверный формат. Пример: 2026-05-30 18:30");
      return;
    }
    draft.publishAt = dt.toISO();
    session.step = "endAt";
    await ctx.reply(
      `Шаг 4/5. Укажите дату и время окончания в формате YYYY-MM-DD HH:mm (${TIMEZONE}).`
    );
    return;
  }

  if (session.step === "endAt") {
    const dt = parseDateTimeFromBot(text);
    const publishDt = DateTime.fromISO(draft.publishAt, { zone: TIMEZONE });
    if (!dt) {
      await ctx.reply("Неверный формат. Пример: 2026-05-30 20:00");
      return;
    }
    if (dt <= publishDt) {
      await ctx.reply("Время окончания должно быть позже времени публикации.");
      return;
    }
    draft.endAt = dt.toISO();
    session.step = "winnersCount";
    await ctx.reply("Шаг 5/5. Укажите количество победителей (число от 1 до 20).");
    return;
  }

  if (session.step === "winnersCount") {
    const winnersCount = Number(text);
    if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 20) {
      await ctx.reply("Введите целое число от 1 до 20.");
      return;
    }

    draft.winnersCount = winnersCount;
    draft.status = DRAW_STATUS.SCHEDULED;

    const data = readData();
    data.draws.push(draft);
    writeData(data);
    removeSession(ctx.from.id);

    await ctx.reply(
      [
        "Розыгрыш сохранен и запланирован ✅",
        `Канал: ${draft.channelId}`,
        `Приз: ${draft.prize}`,
        `Публикация: ${formatDateTime(draft.publishAt)} (${TIMEZONE})`,
        `Окончание: ${formatDateTime(draft.endAt)} (${TIMEZONE})`,
      ].join("\n")
    );
  }
});

bot.action(/^join:(.+)$/, async (ctx) => {
  upsertUserMeta(ctx.from);

  const drawId = ctx.match[1];
  const data = readData();
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw || draw.status !== DRAW_STATUS.ACTIVE) {
    await ctx.answerCbQuery("Розыгрыш недоступен.");
    return;
  }

  if (draw.participantIds.includes(ctx.from.id)) {
    await ctx.answerCbQuery("Вы уже участвуете ✅");
    return;
  }

  const profile = getUserProjectProfile(ctx.from.id, draw.projectId);
  const hasReadyProfile =
    !draw.projectId || ((profile?.referralVerified || profile?.selfReportedNonReferral) && profile?.trc20Address);

  if (hasReadyProfile) {
    const result = await addUserToDraw(drawId, ctx.from.id);
    await ctx.answerCbQuery(result.cbMessage || "Вы участвуете ✅", { show_alert: true });
    return;
  }

  if (!BOT_USERNAME) {
    try {
      await ensureBotUsername();
    } catch (error) {
      console.error("Ошибка получения BOT_USERNAME:", error.message);
    }
  }

  const deepLink = getJoinDeepLink(drawId);
  const text = deepLink
    ? "Нужно пройти проверку. Откройте личку с ботом по кнопке «Перейти к проверке»."
    : "Нужно пройти проверку. Откройте бота в личке и нажмите /start.";
  await ctx.answerCbQuery(text, { show_alert: true });

  if (!deepLink) {
    return;
  }

  try {
    await ctx.telegram.sendMessage(
      ctx.from.id,
      "Чтобы завершить участие, пройдите 4 шага проверки в боте:",
      Markup.inlineKeyboard([[Markup.button.url("Перейти к проверке", deepLink)]])
    );
  } catch (error) {
    console.error("Не удалось отправить deep-link в личку:", error.message);
  }
});

bot.action("draw_finished", async (ctx) => {
  await ctx.answerCbQuery("Розыгрыш уже завершен.");
});

bot.action(/^jp:cap:(\d+)$/, async (ctx) => {
  const selected = Number(ctx.match[1]);
  const session = getJoinSession(ctx.from.id);
  if (!session || session.step !== "captcha") {
    await ctx.answerCbQuery("Сессия проверки устарела. Запустите участие заново.");
    return;
  }

  if (selected !== session.captchaCorrect) {
    await ctx.answerCbQuery("Неверно, попробуйте еще раз.");
    await cleanupJoinStage(ctx, session, [ctx.callbackQuery?.message?.message_id]);
    await sendCaptchaStep(ctx, session);
    return;
  }

  await cleanupJoinStage(ctx, session, [ctx.callbackQuery?.message?.message_id]);
  await ctx.answerCbQuery("Проверка пройдена.");
  await sendRegistrationStep(ctx, session);
});

bot.action("jp:reg:open", async (ctx) => {
  const session = getJoinSession(ctx.from.id);
  if (!session || session.step !== "registration") {
    await ctx.answerCbQuery("Сессия проверки устарела.");
    return;
  }

  const project = getProjectById(session.projectId);
  await cleanupJoinStage(ctx, session, [ctx.callbackQuery?.message?.message_id]);
  session.registrationOpened = true;
  session.step = "registration_confirm";
  setJoinSession(ctx.from.id, session);

  try {
    await ctx.answerCbQuery("Открываю проект...", { url: project?.refLink || "https://t.me" });
  } catch (error) {
    await ctx.answerCbQuery("Открываю проект...");
    const fallbackMessage = await ctx.reply(
      "Если проект не открылся автоматически, нажмите кнопку ниже:",
      Markup.inlineKeyboard([[Markup.button.url("Перейти на проект", project?.refLink || "https://t.me")]])
    );
    trackJoinBotMessage(session, fallbackMessage);
    setJoinSession(ctx.from.id, session);
  }

  await sleep(10_000);

  const confirmMessage = await ctx.reply(
    [
      "<b>Подтвердите регистрацию кнопкой ниже:</b>",
      "",
      "Если у вас уже был аккаунт не по реф-ссылке — отметьте это отдельно.",
    ].join("\n"),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("Я зарегистрировался(лась)", "jp:reg:registered")],
        [Markup.button.callback("Я уже зарегистрирован(не реф)", "jp:reg:nonref")],
      ]),
    }
  );
  trackJoinBotMessage(session, confirmMessage);
  setJoinSession(ctx.from.id, session);
});

bot.action("jp:reg:registered", async (ctx) => {
  const session = getJoinSession(ctx.from.id);
  if (!session || session.step !== "registration_confirm") {
    await ctx.answerCbQuery("Сессия проверки устарела.");
    return;
  }

  await cleanupJoinStage(ctx, session, [ctx.callbackQuery?.message?.message_id]);
  session.step = "await_ref_nickname";
  setJoinSession(ctx.from.id, session);
  await ctx.answerCbQuery("Продолжаем.");
  const projectLink = buildProjectLinkHtml(session.projectId);
  const promptMessage = await ctx.reply(
    [
      "<b>Этап 3/4 · Подтверждение реферала</b>",
      "",
      `Введите ваш никнейм с ${projectLink} одним сообщением.`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
  trackJoinBotMessage(session, promptMessage);
  setJoinSession(ctx.from.id, session);
});

bot.action("jp:reg:nonref", async (ctx) => {
  const session = getJoinSession(ctx.from.id);
  if (!session || !["registration", "registration_confirm"].includes(session.step)) {
    await ctx.answerCbQuery("Сессия проверки устарела.");
    return;
  }

  setUserProjectProfile(ctx.from.id, session.projectId, {
    referralVerified: false,
    selfReportedNonReferral: true,
    nonReferralMarkedAt: new Date().toISOString(),
  });

  await cleanupJoinStage(ctx, session, [ctx.callbackQuery?.message?.message_id]);
  session.skipReferralCheck = true;
  setJoinSession(ctx.from.id, session);
  await ctx.answerCbQuery("Отметка сохранена.");
  await sendTrc20Step(ctx, session);
});

bot.action(/^wp:cap:([^:]+):(\d+)$/, async (ctx) => {
  const drawId = ctx.match[1];
  const selected = Number(ctx.match[2]);
  const sessionKey = winnerVerificationSessionKey(ctx.from.id, drawId);
  const session = winnerVerificationSessions.get(sessionKey);
  if (!session) {
    await ctx.answerCbQuery("Сессия проверки устарела.");
    return;
  }

  const data = readData();
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw) {
    winnerVerificationSessions.delete(sessionKey);
    await ctx.answerCbQuery("Розыгрыш не найден.");
    return;
  }

  const notify = draw.winnerNotifications?.[String(ctx.from.id)];
  const expiresAtISO = notify?.expiresAt || session.expiresAt;
  const isExpired = expiresAtISO
    ? DateTime.fromISO(expiresAtISO, { zone: TIMEZONE }) < DateTime.now().setZone(TIMEZONE)
    : false;
  if (isExpired) {
    await markWinnerNotificationExpired(draw, ctx.from.id);
    writeData(data);
    await ctx.answerCbQuery("Время подтверждения истекло.");
    return;
  }

  if (selected !== session.correct) {
    await ctx.answerCbQuery("Неверно, попробуйте еще раз.");
    return;
  }

  winnerVerificationSessions.delete(sessionKey);
  if (draw) {
    if (!draw.winnerNotifications) {
      draw.winnerNotifications = {};
    }
    if (!draw.winnerNotifications[String(ctx.from.id)]) {
      draw.winnerNotifications[String(ctx.from.id)] = {};
    }
    draw.winnerNotifications[String(ctx.from.id)].verifiedAt = new Date().toISOString();
    draw.winnerNotifications[String(ctx.from.id)].status = "confirmed";
    writeData(data);
  }

  await ctx.answerCbQuery("Проверка пройдена ✅");
  await ctx.reply("✅ Успешно! Ожидайте выплаты приза!");
});

bot.catch((error) => {
  console.error("Ошибка бота:", error);
});

setInterval(async () => {
  await schedulerTick();
}, CHECK_INTERVAL_MS);

async function bootstrap() {
  ensureStorage();
  await ensureBotUsername();
  app.listen(WEB_PORT, "0.0.0.0", () => {
    console.log(`Веб-панель запущена: ${WEB_PUBLIC_URL || `http://0.0.0.0:${WEB_PORT}`}`);
  });
  await bot.launch();
  await syncActiveDrawKeyboards();
  console.log(`Бот запущен: @${BOT_USERNAME}`);
}

bootstrap().catch((error) => {
  console.error("Ошибка запуска:", error.message);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
