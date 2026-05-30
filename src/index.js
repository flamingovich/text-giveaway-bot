const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const QRCode = require("qrcode");
const { Telegraf, Markup } = require("telegraf");
const { DateTime } = require("luxon");
const { createWebAuth, validateInitData, renderLoginPage } = require("./web-auth");
const { renderOrganizerGatePage, registerJoinMiniApp } = require("./join-miniapp");
const { registerWinnersMiniApp } = require("./winners-miniapp");
const { getMiniAppStyles, getMiniAppInitScript, getMiniAppHeadScript, getMiniAppViewportMeta } = require("./miniapp-ui");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter(Number.isFinite);
const SUPER_ADMIN_IDS = (process.env.SUPER_ADMIN_IDS || process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter(Number.isFinite);
const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 30_000);
const PANEL_POLL_MS = Number(process.env.PANEL_POLL_MS || 8_000);
const WEB_PORT = Number(process.env.WEB_PORT || 3000);
const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL || "").replace(/\/$/, "");
const PANEL_BASE = "/panel";
const WEB_ONLY = process.env.WEB_ONLY === "true";
const WEB_AUTH_DISABLED = process.env.WEB_AUTH_DISABLED === "true" || WEB_ONLY;
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || "";
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "";
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
const webAuth = createWebAuth({
  botToken: BOT_TOKEN,
  disabled: WEB_AUTH_DISABLED,
  cookieSecure: WEB_PUBLIC_URL.startsWith("https://"),
  defaultUserId: ADMIN_IDS[0],
  botUsername: BOT_USERNAME,
  publicUrl: WEB_PUBLIC_URL,
  panelPath: PANEL_BASE,
});
const app = express();
const DATA_DIR = path.join(__dirname, "..", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DRAWS_FILE = path.join(DATA_DIR, "draws.json");
const KNOWN_CHANNELS_FILE = path.join(DATA_DIR, "known-channels.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const USER_PROJECT_PROFILES_FILE = path.join(DATA_DIR, "user-project-profiles.json");
const DELEGATED_ADMINS_FILE = path.join(DATA_DIR, "delegated-admins.json");
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const BRAND_LOGO_FILE = path.join(__dirname, "..", "rollerbot_logo.jpg");
const BRAND_BACKGROUND_FILE = path.join(__dirname, "..", "background.jpg");
const BRAND_BACKGROUND_DARK_FILE = path.join(__dirname, "..", "background_dark.png");

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
  if (!fs.existsSync(DELEGATED_ADMINS_FILE)) {
    fs.writeFileSync(DELEGATED_ADMINS_FILE, JSON.stringify({ admins: [] }, null, 2), "utf8");
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

function readDelegatedAdmins() {
  ensureStorage();
  const content = fs.readFileSync(DELEGATED_ADMINS_FILE, "utf8");
  return JSON.parse(content);
}

function writeDelegatedAdmins(data) {
  fs.writeFileSync(DELEGATED_ADMINS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getDelegatedAdminIds() {
  return (readDelegatedAdmins().admins || []).map((entry) => Number(entry.userId)).filter(Number.isFinite);
}

function addDelegatedAdmin(user, label, addedBy) {
  const id = Number(user?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "Укажите корректный Telegram ID." };
  }
  if (isSuperAdmin(id) || ADMIN_IDS.includes(id)) {
    return { ok: false, error: "Этот пользователь уже суперадмин (.env)." };
  }
  const data = readDelegatedAdmins();
  if ((data.admins || []).some((entry) => Number(entry.userId) === id)) {
    return { ok: false, error: "Этот пользователь уже в списке админов." };
  }
  data.admins = data.admins || [];
  data.admins.push({
    userId: id,
    username: user.username || "",
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    label: String(label || "").trim(),
    addedAt: new Date().toISOString(),
    addedBy: Number(addedBy) || null,
  });
  writeDelegatedAdmins(data);
  upsertUserMeta({
    id,
    username: user.username || "",
    first_name: user.first_name || "",
    last_name: user.last_name || "",
  });
  return { ok: true };
}

function removeDelegatedAdmin(userId) {
  const id = Number(userId);
  const data = readDelegatedAdmins();
  const before = (data.admins || []).length;
  data.admins = (data.admins || []).filter((entry) => Number(entry.userId) !== id);
  if (data.admins.length === before) {
    return { ok: false, error: "Админ с таким ID не найден." };
  }
  writeDelegatedAdmins(data);
  return { ok: true };
}

function isSuperAdmin(userId) {
  return SUPER_ADMIN_IDS.includes(Number(userId));
}

function isPlatformAdmin(userId) {
  const id = Number(userId);
  return SUPER_ADMIN_IDS.includes(id) || ADMIN_IDS.includes(id) || getDelegatedAdminIds().includes(id);
}

function getDefaultOwnerId() {
  return SUPER_ADMIN_IDS[0] || ADMIN_IDS[0];
}

function itemBelongsToOwner(item, ownerId) {
  const expected = Number(ownerId);
  const actual = item?.ownerId != null ? Number(item.ownerId) : getDefaultOwnerId();
  return actual === expected;
}

function filterByOwner(items, ownerId) {
  return (items || []).filter((item) => itemBelongsToOwner(item, ownerId));
}

function migrateLegacyOwnership() {
  const owner = getDefaultOwnerId();
  let changed = false;

  const projectsData = readProjects();
  for (const project of projectsData.projects) {
    if (project.ownerId == null) {
      project.ownerId = owner;
      changed = true;
    }
  }
  if (changed) {
    writeProjects(projectsData);
  }

  changed = false;
  const drawsData = readData();
  for (const draw of drawsData.draws) {
    if (draw.ownerId == null) {
      draw.ownerId = draw.createdBy != null ? Number(draw.createdBy) : owner;
      changed = true;
    }
  }
  if (changed) {
    writeData(drawsData);
  }

  changed = false;
  const channelsData = readKnownChannels();
  for (const channel of channelsData.channels) {
    if (channel.ownerId == null) {
      channel.ownerId = owner;
      changed = true;
    }
  }
  if (changed) {
    writeKnownChannels(channelsData);
  }
}

function getProjectById(projectId, ownerId = null) {
  if (!projectId) {
    return null;
  }
  const data = readProjects();
  const project = data.projects.find((item) => item.id === projectId) || null;
  if (!project) {
    return null;
  }
  if (ownerId != null && !itemBelongsToOwner(project, ownerId)) {
    return null;
  }
  return project;
}

function findOwnedDrawInData(data, drawId, ownerId) {
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw || !itemBelongsToOwner(draw, ownerId)) {
    return null;
  }
  return draw;
}

function normalizeChannelRef(channelId) {
  return String(channelId || "").trim();
}

function findKnownChannel(channelId) {
  const ref = normalizeChannelRef(channelId);
  const channels = readKnownChannels().channels || [];
  return (
    channels.find((channel) => {
      if (String(channel.id) === ref) {
        return true;
      }
      if (channel.username && `@${channel.username}` === ref) {
        return true;
      }
      if (channel.username && channel.username === ref.replace(/^@/, "")) {
        return true;
      }
      return false;
    }) || null
  );
}

function channelAccessibleByOwner(channelId, ownerId) {
  const known = findKnownChannel(channelId);
  if (!known) {
    return true;
  }
  if (known.ownerId == null) {
    return true;
  }
  return Number(known.ownerId) === Number(ownerId);
}

function upsertKnownChannel(chat, ownerId = null) {
  if (!chat || chat.type !== "channel") {
    return { conflict: false };
  }

  const data = readKnownChannels();
  const id = String(chat.id);
  const existing = data.channels.find((item) => item.id === id);
  const payload = {
    id,
    title: chat.title || "",
    username: chat.username || "",
    photoFileId: chat.photoFileId || "",
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, payload);
    if (ownerId != null) {
      if (existing.ownerId != null && Number(existing.ownerId) !== Number(ownerId)) {
        return { conflict: true, ownerId: existing.ownerId };
      }
      existing.ownerId = Number(ownerId);
    }
  } else {
    data.channels.push({
      ...payload,
      ownerId: ownerId != null ? Number(ownerId) : null,
      addedAt: new Date().toISOString(),
    });
  }

  writeKnownChannels(data);
  return { conflict: false };
}

function findOwnedKnownChannel(channelId, ownerId) {
  const channel = findKnownChannel(channelId);
  if (!channel) {
    return null;
  }
  if (channel.ownerId != null && Number(channel.ownerId) !== Number(ownerId)) {
    return null;
  }
  return channel;
}

function removeKnownChannel(channelId, ownerId) {
  const channel = findOwnedKnownChannel(channelId, ownerId);
  if (!channel) {
    return { ok: false, error: "Канал не найден." };
  }

  const draws = filterByOwner(readData().draws || [], ownerId);
  const channelRef = channel.username ? `@${channel.username}` : channel.id;
  const blocked = draws.some(
    (draw) =>
      (draw.status === DRAW_STATUS.ACTIVE || draw.status === DRAW_STATUS.SCHEDULED) &&
      (normalizeChannelRef(draw.channelId) === normalizeChannelRef(channelRef) ||
        normalizeChannelRef(draw.channelId) === normalizeChannelRef(channel.id)),
  );
  if (blocked) {
    return { ok: false, error: "Нельзя удалить канал с активным или запланированным розыгрышем." };
  }

  const data = readKnownChannels();
  data.channels = data.channels.filter((item) => item.id !== channel.id);
  writeKnownChannels(data);
  return { ok: true, channel };
}

function getBotLinkChannelUrl() {
  if (!BOT_USERNAME) {
    return "https://t.me";
  }
  return `https://t.me/${BOT_USERNAME}?start=link_channel`;
}

function isChannelAdminStatus(status) {
  return status === "administrator" || status === "creator";
}

async function linkChannelForUser(ctx, chat) {
  const userId = ctx.from?.id;
  if (!userId) {
    return { ok: false, message: "Не удалось определить ваш Telegram ID." };
  }

  let botId;
  try {
    botId = (await bot.telegram.getMe()).id;
  } catch (error) {
    return { ok: false, message: "Ошибка проверки бота. Попробуйте позже." };
  }

  try {
    const botMember = await bot.telegram.getChatMember(chat.id, botId);
    if (!isChannelAdminStatus(botMember.status)) {
      return {
        ok: false,
        message: [
          `Бот @${BOT_USERNAME} не является админом в этом канале.`,
          "",
          "Добавьте бота администратором с правами:",
          "• публиковать сообщения",
          "• редактировать сообщения",
          "",
          "После этого перешлите пост из канала ещё раз.",
        ].join("\n"),
      };
    }

    const userMember = await ctx.telegram.getChatMember(chat.id, userId);
    if (!isChannelAdminStatus(userMember.status)) {
      return {
        ok: false,
        message: "Вы не администратор этого канала. Пересылать пост может только админ канала.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      message:
        "Не удалось проверить канал. Убедитесь, что бот добавлен в канал администратором.",
    };
  }

  const linkResult = upsertKnownChannel(chat, userId);
  if (linkResult.conflict) {
    return {
      ok: false,
      message: "Этот канал уже привязан к другому организатору.",
    };
  }

  try {
    const fullChat = await bot.telegram.getChat(chat.id);
    if (fullChat.photo?.small_file_id) {
      const data = readKnownChannels();
      const stored = data.channels.find((item) => item.id === String(chat.id));
      if (stored) {
        stored.photoFileId = fullChat.photo.small_file_id;
        writeKnownChannels(data);
      }
    }
  } catch {
    // optional avatar
  }

  const handle = chat.username ? `@${chat.username}` : chat.id;
  return {
    ok: true,
    message: [
      `✅ Канал подключён: ${chat.title || handle}`,
      "",
      "Он появится в панели: Настройки → Мои каналы.",
      "Обновите Mini App, если панель уже была открыта.",
    ].join("\n"),
  };
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

const RU_MONTHS_SHORT = {
  1: "янв.",
  2: "февр.",
  3: "мар.",
  4: "апр.",
  5: "мая",
  6: "июня",
  7: "июля",
  8: "авг.",
  9: "сент.",
  10: "окт.",
  11: "нояб.",
  12: "дек.",
};

function formatCardDateTime(isoString) {
  if (!isoString) {
    return "вручную";
  }
  const dt = DateTime.fromISO(isoString, { zone: TIMEZONE });
  if (!dt.isValid) {
    return "не задано";
  }
  const month = RU_MONTHS_SHORT[dt.month] || dt.toFormat("LLL");
  return `${dt.day} ${month} ${dt.year} в ${dt.toFormat("HH:mm")}`;
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
  return isPlatformAdmin(ctx.from?.id);
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

function formatUsdAmount(value) {
  const amount = Math.floor(Number(value));
  const formatted = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted}$`;
}

function formatRubStatDisplay(value) {
  const amount = Math.floor(Number(value) || 0);
  const formatted = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} ₽`;
}

function formatUsdStatDisplay(value) {
  const amount = Math.floor(Number(value) || 0);
  const formatted = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} $`;
}

function formatPaidStatDisplay(rub, usd) {
  const parts = [];
  if (rub > 0) parts.push(formatRubStatDisplay(rub));
  if (usd > 0) parts.push(formatUsdStatDisplay(usd));
  return parts.length ? parts.join(" · ") : "0 ₽";
}

function isMoneyPrizeType(prizeType) {
  return prizeType === "money_rub" || prizeType === "money_usd";
}

function getDrawPrizeAmount(draw) {
  if (draw.prizeType === "money_usd") {
    const total = Number.isFinite(draw.prizeAmountUsd)
      ? Number(draw.prizeAmountUsd)
      : parseRubAmountFromText(draw.prize);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }
  if (draw.prizeType === "money_rub") {
    const total = Number.isFinite(draw.prizeAmountRub)
      ? Number(draw.prizeAmountRub)
      : parseRubAmountFromText(draw.prize);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }
  return 0;
}

function formatMoneyAmount(value, prizeType) {
  if (prizeType === "money_usd") {
    return formatUsdAmount(value);
  }
  return formatRubAmount(value);
}

function getWinnerPayoutAmount(draw, projectData) {
  if (!isMoneyPrizeType(draw.prizeType)) {
    return 0;
  }
  const total = getDrawPrizeAmount(draw);
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const winnerCount = Math.max(1, (draw.winnerIds || []).length || Number(draw.winnersCount) || 1);
  let perWinner = Math.floor(total / winnerCount);
  if (projectData?.selfReportedNonReferral) {
    perWinner = Math.floor(perWinner / 2);
  }
  return perWinner;
}

function computeDrawStats(draws, userProfiles) {
  const now = DateTime.now().setZone(TIMEZONE);
  const monthName = now.setLocale("ru").toFormat("LLLL");
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  let paidThisMonthRub = 0;
  let paidAllTimeRub = 0;
  let paidThisMonthUsd = 0;
  let paidAllTimeUsd = 0;

  for (const draw of draws) {
    for (const winnerId of draw.winnerIds || []) {
      const notifyInfo = draw.winnerNotifications?.[String(winnerId)];
      if (!notifyInfo?.paidAt || !isMoneyPrizeType(draw.prizeType)) {
        continue;
      }
      const paidAt = DateTime.fromISO(notifyInfo.paidAt, { zone: TIMEZONE });
      if (!paidAt.isValid) {
        continue;
      }
      const { projectData } = getUserProfileBundle(userProfiles, winnerId, draw.projectId);
      const amount = getWinnerPayoutAmount(draw, projectData);
      if (draw.prizeType === "money_usd") {
        paidAllTimeUsd += amount;
        if (paidAt.year === now.year && paidAt.month === now.month) {
          paidThisMonthUsd += amount;
        }
      } else {
        paidAllTimeRub += amount;
        if (paidAt.year === now.year && paidAt.month === now.month) {
          paidThisMonthRub += amount;
        }
      }
    }
  }

  return {
    total: draws.length,
    active: draws.filter((draw) => draw.status === DRAW_STATUS.ACTIVE).length,
    monthLabel,
    paidThisMonth: formatPaidStatDisplay(paidThisMonthRub, paidThisMonthUsd),
    paidAllTime: formatPaidStatDisplay(paidAllTimeRub, paidAllTimeUsd),
  };
}

function parseRubAmountFromText(text) {
  const digits = String(text || "").replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }
  return Number(digits);
}

function getPerWinnerPrizeText(draw) {
  if (!isMoneyPrizeType(draw.prizeType)) {
    return draw.prize;
  }

  const total = getDrawPrizeAmount(draw);
  if (!Number.isFinite(total) || total <= 0) {
    return draw.prize;
  }

  const winnerCount = Math.max(1, (draw.winnerIds || []).length || Number(draw.winnersCount) || 1);
  const perWinner = Math.floor(total / winnerCount);
  return formatMoneyAmount(perWinner, draw.prizeType);
}

function getWinnerPayoutText(draw, projectData) {
  const base = getPerWinnerPrizeText(draw);
  if (!projectData?.selfReportedNonReferral || !isMoneyPrizeType(draw.prizeType)) {
    return base;
  }

  const amount = getWinnerPayoutAmount(draw, projectData);
  return formatMoneyAmount(amount, draw.prizeType);
}

function isWinnerNotificationExpired(notifyInfo) {
  if (!notifyInfo) {
    return false;
  }
  if (notifyInfo.status === "expired") {
    return true;
  }
  if (notifyInfo.verifiedAt) {
    return false;
  }
  const expiresAt = notifyInfo.expiresAt
    ? DateTime.fromISO(notifyInfo.expiresAt, { zone: TIMEZONE })
    : null;
  return Boolean(expiresAt?.isValid && expiresAt <= DateTime.now().setZone(TIMEZONE));
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
      ownerId: userId,
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

function isOrganizer(userId) {
  const id = Number(userId);
  if (isPlatformAdmin(id)) {
    return true;
  }
  if (filterByOwner(readKnownChannels().channels || [], id).length > 0) {
    return true;
  }
  if (filterByOwner(readProjects().projects || [], id).length > 0) {
    return true;
  }
  if (filterByOwner(readData().draws || [], id).length > 0) {
    return true;
  }
  return false;
}

function getJoinWebAppUrl(drawId) {
  if (!WEB_PUBLIC_URL) {
    return getJoinDeepLink(drawId);
  }
  return `${WEB_PUBLIC_URL}/join/${encodeURIComponent(drawId)}`;
}

function getWinnersWebAppUrl(drawId) {
  const base = (WEB_PUBLIC_URL || `http://localhost:${WEB_PORT}`).replace(/\/$/, "");
  return `${base}/winners/${encodeURIComponent(drawId)}`;
}

function getWinnersDeepLink(drawId) {
  if (!BOT_USERNAME) {
    return "";
  }
  return `https://t.me/${BOT_USERNAME}?start=winners_${drawId}`;
}

function getWinnersChannelUrl(drawId) {
  if (WEB_PUBLIC_URL.startsWith("https://")) {
    return getWinnersWebAppUrl(drawId);
  }
  return getWinnersDeepLink(drawId);
}

function getPanelUrl() {
  const base = (WEB_PUBLIC_URL || `http://localhost:${WEB_PORT}`).replace(/\/$/, "");
  return `${base}${PANEL_BASE}`;
}

function getPanelKeyboardForUser(userId) {
  if (userId && isOrganizer(userId)) {
    return Markup.keyboard([[Markup.button.webApp("📱 Панель", getPanelUrl())]]).resize();
  }
  return Markup.removeKeyboard();
}

async function syncOrganizerPanelUi(userId) {
  if (!userId || !WEB_PUBLIC_URL.startsWith("https://") || WEB_ONLY) {
    return;
  }

  try {
    if (isOrganizer(userId)) {
      await bot.telegram.setChatMenuButton({
        chat_id: userId,
        menu_button: {
          type: "web_app",
          text: "📱 Панель",
          web_app: { url: getPanelUrl() },
        },
      });
      return;
    }

    await bot.telegram.setChatMenuButton({
      chat_id: userId,
      menu_button: { type: "default" },
    });
  } catch (error) {
    console.warn(`Не удалось обновить кнопку панели для ${userId}:`, error.message);
  }
}

function getKeyboard(drawId, count) {
  const text = `Участвовать (${count})`;
  // Web App-кнопки в inline-клавиатуре канала запрещены (BUTTON_TYPE_INVALID).
  // Ведём в бота по deep link; там уже открывается Mini App участия.
  if (BOT_USERNAME) {
    return Markup.inlineKeyboard([Markup.button.url(text, getJoinDeepLink(drawId))]);
  }
  return Markup.inlineKeyboard([Markup.button.callback(text, `join:${drawId}`)]);
}

async function ensureBotUsername() {
  if (BOT_USERNAME) {
    return BOT_USERNAME;
  }
  if (WEB_ONLY) {
    throw new Error("В режиме WEB_ONLY укажите BOT_USERNAME в .env");
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
  const text = `Розыгрыш на ${shortPrize || "приз"} завершен`;
  const url = getWinnersChannelUrl(draw.id);
  if (url) {
    return Markup.inlineKeyboard([Markup.button.url(text, url)]);
  }
  return Markup.inlineKeyboard([Markup.button.callback(text, `winners:${draw.id}`)]);
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
    ...(data.users[userKey].meta || {}),
    id: user.id,
    username: user.username || data.users[userKey].meta?.username || "",
    first_name: user.first_name || data.users[userKey].meta?.first_name || "",
    last_name: user.last_name || data.users[userKey].meta?.last_name || "",
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
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  if (meta.username) {
    return `@${meta.username}`;
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

function findUserInProfilesByUsername(username) {
  const needle = String(username || "").replace(/^@/, "").trim().toLowerCase();
  if (!needle) {
    return null;
  }
  const profiles = readUserProjectProfiles();
  for (const [userKey, node] of Object.entries(profiles.users || {})) {
    const profileUsername = node.meta?.username;
    if (profileUsername && profileUsername.toLowerCase() === needle) {
      return {
        id: Number(userKey),
        username: profileUsername,
        first_name: node.meta.first_name || "",
        last_name: node.meta.last_name || "",
      };
    }
  }
  return null;
}

async function resolveTelegramUser(ref) {
  const raw = String(ref || "").trim();
  if (!raw) {
    return { ok: false, error: "Укажите @username или числовой Telegram ID." };
  }

  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, error: "Укажите корректный Telegram ID." };
    }
    const profiles = readUserProjectProfiles();
    const meta = profiles.users?.[String(id)]?.meta || {};
    return {
      ok: true,
      user: {
        id,
        username: meta.username || "",
        first_name: meta.first_name || "",
        last_name: meta.last_name || "",
      },
    };
  }

  const username = raw.replace(/^@/, "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) {
    return { ok: false, error: "Неверный формат @username. Пример: @durov" };
  }

  const local = findUserInProfilesByUsername(username);
  if (local?.id) {
    return { ok: true, user: local };
  }

  try {
    const chat = await bot.telegram.getChat(`@${username}`);
    if (chat?.id) {
      const user = {
        id: chat.id,
        username: chat.username || username,
        first_name: chat.first_name || "",
        last_name: chat.last_name || "",
      };
      upsertUserMeta(user);
      return { ok: true, user };
    }
  } catch (error) {
    // Пользователь не найден через API — см. сообщение ниже.
  }

  return {
    ok: false,
    error: `Не найден @${username}. Попросите человека написать боту /start или укажите его числовой ID.`,
  };
}

function getAccessPersonMeta(userId, userProfiles, entry) {
  const meta = userProfiles.users?.[String(userId)]?.meta || {};
  return {
    username: meta.username || entry?.username || "",
    first_name: meta.first_name || entry?.first_name || "",
    last_name: meta.last_name || entry?.last_name || "",
    avatarFileId: meta.avatarFileId || "",
  };
}

function renderAccessPersonCard(userId, userProfiles, options = {}) {
  const { badge = "", removable = false, superClass = "", entry = {} } = options;
  const person = getAccessPersonMeta(userId, userProfiles, entry);
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  const displayName = fullName || (person.username ? `@${person.username}` : `ID ${userId}`);
  const usernameLine = person.username ? `@${person.username}` : "без username";
  const initial = (fullName || person.username || String(userId)).charAt(0).toUpperCase();
  const avatar = person.avatarFileId
    ? `<img src="${PANEL_BASE}/avatar/${encodeURIComponent(String(userId))}" alt="" class="access-avatar" />`
    : `<div class="access-avatar access-avatar-fallback">${escapeHtml(initial)}</div>`;
  const badgeHtml = badge ? `<span class="access-badge">${escapeHtml(badge)}</span>` : "";
  const deleteAction = removable
    ? `<div class="access-card-actions">
          <form method="post" action="${PANEL_BASE}/admin/access/${encodeURIComponent(String(userId))}/remove" class="project-delete-form">
            <button
              type="submit"
              class="project-icon-btn project-delete-btn access-delete-btn"
              title="Удалить"
              data-access-name="${escapeHtml(displayName)}"
            >${renderFormIcon("delete")}</button>
          </form>
        </div>`
    : "";

  return `
    <article class="access-card ${superClass}">
      <div class="access-card-head${removable ? " access-card-head-removable" : ""}">
        ${deleteAction}
        <div class="access-avatar-wrap">${avatar}</div>
        <div class="access-card-body">
          <div class="access-card-name-row">
            <h3 class="access-card-name">${escapeHtml(displayName)}</h3>
            ${badgeHtml}
          </div>
          <div class="access-card-meta">${escapeHtml(usernameLine)}</div>
        </div>
      </div>
    </article>
  `;
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

function userParticipatedInProject(userId, projectId, excludeDrawId = null) {
  if (!projectId) {
    return false;
  }
  const data = readData();
  return data.draws.some(
    (draw) =>
      draw.projectId === projectId &&
      (excludeDrawId ? draw.id !== excludeDrawId : true) &&
      (draw.participantIds || []).includes(userId),
  );
}

async function tryAutoJoinDraw(draw, userId) {
  if (draw.participantIds.includes(userId)) {
    return { joined: true, already: true, message: "Вы уже участвуете!" };
  }

  if (draw.projectId && userParticipatedInProject(userId, draw.projectId, draw.id)) {
    const result = await addUserToDraw(draw.id, userId);
    return {
      joined: true,
      already: Boolean(result.already),
      message: result.already ? "Вы уже участвуете!" : "Вы участвуете!",
      messageHtml: result.messageHtml,
    };
  }

  const profile = getUserProjectProfile(userId, draw.projectId);
  const canSkip =
    !draw.projectId ||
    ((profile?.referralVerified || profile?.selfReportedNonReferral) && profile?.trc20Address);
  if (canSkip) {
    const result = await addUserToDraw(draw.id, userId);
    return {
      joined: true,
      already: Boolean(result.already),
      message: result.already ? "Вы уже участвуете!" : "Вы участвуете!",
      messageHtml: result.messageHtml,
    };
  }

  return { joined: false };
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

async function startWinnersFlow(ctx, drawId) {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Откройте личный чат с ботом.");
    return;
  }

  const data = readData();
  const draw = data.draws.find((item) => item.id === drawId);
  if (!draw || draw.status !== DRAW_STATUS.FINISHED) {
    await ctx.reply("Розыgрыш не найден или ещё не завершён.");
    return;
  }

  await ctx.reply(
    "Нажмите кнопку ниже, чтобы посмотреть победителей.",
    Markup.inlineKeyboard([Markup.button.webApp("🥳 Победители", getWinnersWebAppUrl(drawId))]),
  );
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

  const autoJoin = await tryAutoJoinDraw(draw, ctx.from.id);
  if (autoJoin.joined) {
    if (autoJoin.messageHtml) {
      await ctx.reply(autoJoin.messageHtml, { parse_mode: "HTML" });
    } else {
      await ctx.reply(autoJoin.message || "Вы участвуете ✅");
    }
    return;
  }

  if (WEB_PUBLIC_URL.startsWith("https://")) {
    await ctx.reply(
      "Нажмите кнопку ниже, чтобы пройти участие.",
      Markup.inlineKeyboard([Markup.button.webApp("🎁 Участвовать", getJoinWebAppUrl(drawId))]),
    );
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
  res.redirect(`${PANEL_BASE}?msg=${encodeURIComponent(message)}`);
}

function renderLandingPage() {
  const botLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : "https://t.me";
  const botLabel = BOT_USERNAME ? `@${BOT_USERNAME}` : "Telegram-бот";
  const landingBgTiles = Array.from({ length: 9 }, (_, index) =>
    `<span class="landing-bg-tile${index % 2 === 1 ? " landing-bg-tile-mirror" : ""}" aria-hidden="true"></span>`,
  ).join("");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  <meta name="theme-color" content="#152238" />
  <meta name="description" content="RollerBot — сервис розыгрышей в Telegram. Сайт скоро будет готов." />
  <title>RollerBot — розыгрыши в Telegram</title>
  <link rel="icon" href="/brand/logo.jpg" type="image/jpeg" />
  <link rel="apple-touch-icon" href="/brand/logo.jpg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #eef1f7;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background-color: #152238;
      position: relative;
      overflow-x: hidden;
    }
    .landing-bg {
      position: fixed;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      pointer-events: none;
      background-color: #152238;
    }
    .landing-bg-strip {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      height: 100%;
      min-width: 100vw;
    }
    .landing-bg-tile {
      --landing-tile-width: min(760px, 100vw);
      width: var(--landing-tile-width);
      flex: 0 0 var(--landing-tile-width);
      height: 100%;
      background-image: url("/brand/background-dark.png");
      background-repeat: repeat-y;
      background-size: 100% auto;
      background-position: center top;
      opacity: 0.58;
    }
    .landing-bg-tile-mirror {
      transform: scaleX(-1);
    }
    .landing-bg-overlay {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 60% at 50% -10%, rgba(91, 140, 255, 0.22) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 50% 110%, rgba(50, 95, 255, 0.14) 0%, transparent 55%),
        linear-gradient(180deg, rgba(21, 34, 56, 0.28) 0%, rgba(21, 34, 56, 0.84) 100%);
    }
    .shell {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
    }
    .card {
      background: rgba(22, 32, 54, 0.82);
      border: 1px solid rgba(147, 160, 184, 0.18);
      border-radius: 28px;
      padding: 36px 28px 30px;
      text-align: center;
      box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .logo-wrap {
      display: flex;
      justify-content: center;
      width: 100%;
      margin-bottom: 22px;
    }
    .logo {
      width: 88px;
      height: 88px;
      border-radius: 22px;
      object-fit: contain;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
      border: 1px solid rgba(147, 160, 184, 0.16);
    }
    .status-pill-wrap {
      display: flex;
      justify-content: center;
      width: 100%;
      margin-bottom: 18px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      background: rgba(91, 140, 255, 0.12);
      border: 1px solid rgba(91, 140, 255, 0.28);
      color: #9bb8ff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #5b8cff;
      box-shadow: 0 0 0 0 rgba(91, 140, 255, 0.55);
      animation: pulse 2s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(91, 140, 255, 0.45); }
      50% { box-shadow: 0 0 0 8px rgba(91, 140, 255, 0); }
    }
    .brand {
      margin: 0 0 8px;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      width: 100%;
    }
    .brand span {
      background: linear-gradient(135deg, #ffffff 0%, #9bb8ff 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 700;
      line-height: 1.3;
      color: #f4f6fb;
      width: 100%;
    }
    .lead {
      margin: 0 0 26px;
      color: #93a0b8;
      font-size: 15px;
      line-height: 1.6;
      width: 100%;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px 18px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      transition: transform 0.18s ease, filter 0.18s ease;
    }
    .btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
    .btn-primary {
      background: linear-gradient(135deg, #5b8cff 0%, #325fff 100%);
      color: #fff;
      box-shadow: 0 10px 28px rgba(50, 95, 255, 0.35);
    }
    .btn-ghost {
      background: rgba(255, 255, 255, 0.04);
      color: #b8c2d8;
      border: 1px solid rgba(147, 160, 184, 0.2);
    }
    .footer-note {
      margin-top: 18px;
      font-size: 12px;
      color: rgba(147, 160, 184, 0.75);
      line-height: 1.5;
      width: 100%;
    }
    .gear {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      animation: spin 4s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="landing-bg" aria-hidden="true">
    <div class="landing-bg-strip">${landingBgTiles}</div>
    <div class="landing-bg-overlay"></div>
  </div>
  <main class="shell">
    <div class="card">
      <div class="logo-wrap">
        <img src="/brand/logo.jpg" alt="RollerBot" class="logo" width="88" height="88" />
      </div>
      <div class="status-pill-wrap">
        <div class="status-pill">
          <span class="status-dot" aria-hidden="true"></span>
          <svg class="gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>Технические работы</span>
        </div>
      </div>
      <p class="brand"><span>RollerBot</span></p>
      <h1>Сайт скоро будет готов</h1>
      <p class="lead">Мы готовим полноценный лендинг. Пока что здесь ведутся технические работы — скоро появится новая версия.</p>
      <div class="actions">
        <a class="btn btn-primary" href="${botLink}">Открыть ${botLabel}</a>
      </div>
      <p class="footer-note">Розыгрыши в Telegram уже работают через бота и панель управления.</p>
    </div>
  </main>
  <script>
    (function () {
      const tg = window.Telegram?.WebApp;
      if (!tg?.initData) return;
      fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
        credentials: "same-origin",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.ok && data.organizer) {
            location.replace(
              "${PANEL_BASE}?telegramInitData=" + encodeURIComponent(tg.initData),
            );
          }
        })
        .catch(function () {});
    })();
  </script>
</body>
</html>`;
}

function renderDesignBanner() {
  return "";
}

function renderFormIcon(type) {
  const icons = {
    gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 11h-1V7c0-1.1-.9-2-2-2h-1V4c0-1.66-1.34-3-3-3S8 2.34 8 4v1H7c-1.1 0-2 .9-2 2v4H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6c0-1.1-.9-2-2-2zM10 4c0-.55.45-1 1-1s1 .45 1 1v2h-2V4zm4 0c0-.55.45-1 1-1s1 .45 1 1v2h-2V4zM4 13h16v6H4v-6z"/></svg>',
    project: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
    channel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9zm-5 11v2H11v-2H8l4-4 4 4h-3z"/></svg>',
    prize: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    winners: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    start: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>',
    finish: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>',
    confirm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.63-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7-1.93-.79-3.68-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>',
  };
  return icons[type] || "";
}

function renderQuickActionIcon(type) {
  if (type === "create") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
  }
  if (type === "projects") {
    return renderFormIcon("project");
  }
  if (type === "settings") {
    return renderFormIcon("settings");
  }
  if (type === "access") {
    return renderFormIcon("confirm");
  }
  return "";
}

function drawLabel(iconType, text) {
  return `<label class="draw-label"><span class="draw-ico">${renderFormIcon(iconType)}</span><span class="draw-label-text">${escapeHtml(text)}</span></label>`;
}

function renderProjectCard(project) {
  const refLink = project.refLink || "";
  return `
    <article class="project-card">
      <div class="project-card-head">
        <div class="project-card-body">
          <h3 class="project-card-name">${escapeHtml(project.name)}</h3>
          ${
            refLink
              ? `<a class="project-card-link" href="${escapeHtml(refLink)}" target="_blank" rel="noopener noreferrer">
                  <span class="draw-ico">${renderFormIcon("link")}</span>
                  <span class="project-card-link-text">${escapeHtml(refLink)}</span>
                </a>`
              : ""
          }
        </div>
        <div class="project-card-actions">
          <button
            type="button"
            class="project-icon-btn project-edit-btn"
            title="Редактировать"
            data-project-id="${escapeHtml(project.id)}"
            data-project-name="${escapeHtml(project.name)}"
            data-project-ref="${escapeHtml(refLink)}"
          >${renderFormIcon("edit")}</button>
          <form method="post" action="${PANEL_BASE}/projects/${encodeURIComponent(project.id)}/delete" class="project-delete-form">
            <button
              type="submit"
              class="project-icon-btn project-delete-btn"
              title="Удалить"
              data-project-name="${escapeHtml(project.name)}"
            >${renderFormIcon("delete")}</button>
          </form>
        </div>
      </div>
    </article>
  `;
}

function renderChannelAvatar(channel) {
  return `<img src="${PANEL_BASE}/channel-photo/${encodeURIComponent(String(channel.id))}" alt="" class="project-card-logo channel-card-avatar" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='flex');" /><span class="project-card-logo-fallback" style="display:none">${renderFormIcon("channel")}</span>`;
}

function renderChannelCard(channel) {
  const handle = channel.username ? `@${channel.username}` : channel.id;
  const title = channel.title || handle;
  return `
    <article class="project-card channel-card">
      <div class="project-card-head">
        <div class="project-card-logo-wrap channel-card-logo-wrap">${renderChannelAvatar(channel)}</div>
        <div class="project-card-body">
          <h3 class="project-card-name">${escapeHtml(title)}</h3>
          <div class="channel-card-meta">${escapeHtml(handle)}</div>
        </div>
        <div class="project-card-actions">
          <form method="post" action="${PANEL_BASE}/channels/${encodeURIComponent(String(channel.id))}/delete" class="project-delete-form">
            <button
              type="submit"
              class="project-icon-btn project-delete-btn channel-delete-btn"
              title="Удалить"
              data-channel-title="${escapeHtml(title)}"
            >${renderFormIcon("delete")}</button>
          </form>
        </div>
      </div>
    </article>
  `;
}

function renderHistoryGiftIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="11" rx="1.5"/><path d="M12 10v11"/><path d="M3 14h18"/><path d="M12 10c0-2.5-1.5-4.5-3.5-4.5S5 7.5 5.5 9.5C6 11.5 8 12 12 10z"/><path d="M12 10c0-2.5 1.5-4.5 3.5-4.5S19 7.5 18.5 9.5C18 11.5 16 12 12 10z"/></svg>`;
}

function renderHistoryCoverSide(imagePath) {
  if (!imagePath) {
    return "";
  }
  const src = `${PANEL_BASE}/uploads/${encodeURIComponent(path.basename(imagePath))}`;
  return `<div class="history-cover-side"><img src="${src}" alt="" class="history-thumb" loading="lazy" /></div>`;
}

function getTelegramUserProfileUrl(userId, username) {
  const cleanUsername = String(username || "").replace(/^@/, "").trim();
  if (cleanUsername) {
    return `https://t.me/${encodeURIComponent(cleanUsername)}`;
  }
  return `tg://user?id=${userId}`;
}

function renderWinnerCard(draw, winnerId, userProfiles, winnerNotifications) {
  const { meta, projectData } = getUserProfileBundle(userProfiles, winnerId, draw.projectId);
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  const displayName = fullName || (meta.username ? `@${meta.username}` : `ID ${winnerId}`);
  const usernameLine = meta.username ? `@${meta.username}` : "без username";
  const usernameMetaHtml = fullName
    ? `<div class="winner-card-meta">${escapeHtml(usernameLine)}</div>`
    : !meta.username
      ? `<div class="winner-card-meta">без username</div>`
      : "";
  const initial = (fullName || meta.username || String(winnerId)).charAt(0).toUpperCase() || "?";
  const avatar = meta.avatarFileId
    ? `<img src="${PANEL_BASE}/avatar/${encodeURIComponent(String(winnerId))}" alt="" class="winner-card-avatar" />`
    : `<div class="winner-card-avatar winner-card-avatar-fallback">${escapeHtml(initial)}</div>`;
  const trcAddress = projectData.trc20Address || "Не указан";
  const notifyInfo = winnerNotifications[String(winnerId)];
  const payoutText = getWinnerPayoutText(draw, projectData);
  const isPaid = Boolean(notifyInfo?.paidAt);
  const isVerified = Boolean(notifyInfo?.verifiedAt);
  const notifySent = Boolean(notifyInfo?.sentAt);
  const isExpired = isWinnerNotificationExpired(notifyInfo);
  const refBadge = projectData.selfReportedNonReferral
    ? `<span class="winner-badge winner-badge-warn">Не реф</span>`
    : `<span class="winner-badge winner-badge-ok">Реф</span>`;
  const statusBadge = isPaid
    ? `<span class="winner-badge winner-badge-paid">Выплачено</span>`
    : isVerified
      ? `<span class="winner-badge winner-badge-ok">Проверен</span>`
      : isExpired
        ? `<span class="winner-badge winner-badge-danger">Не отметился</span>`
        : notifySent
        ? `<span class="winner-badge">Уведомлён</span>`
        : `<span class="winner-badge">Ожидает</span>`;
  const copyBtn =
    trcAddress !== "Не указан"
      ? `<button type="button" class="winner-copy-btn" title="Копировать" aria-label="Копировать адрес" data-copy="${escapeHtml(trcAddress)}">${renderFormIcon("copy")}</button>`
      : "";
  const payButton = isPaid || isExpired
    ? ""
    : `<div class="winner-card-actions">
        <form method="post" action="${PANEL_BASE}/draws/${encodeURIComponent(draw.id)}/pay/${encodeURIComponent(String(winnerId))}">
          <button type="submit" class="winner-action-btn">Оплатил</button>
        </form>
      </div>`;
  const profileUrl = getTelegramUserProfileUrl(winnerId, meta.username);
  const profileBtn = `<a href="${escapeHtml(profileUrl)}" class="winner-profile-btn" title="Перейти в профиль" aria-label="Перейти в профиль">${renderFormIcon("user")}</a>`;

  return `
    <article class="winner-card">
      <div class="winner-card-head">
        ${avatar}
        <div class="winner-card-body">
          <div class="winner-card-name-row">
            <div class="winner-card-name">${escapeHtml(displayName)}</div>
            ${profileBtn}
          </div>
          ${usernameMetaHtml}
          <div class="winner-card-badges">${refBadge}${statusBadge}</div>
        </div>
      </div>
      <div class="winner-card-row">
        <span class="draw-ico">${renderFormIcon("prize")}</span>
        <span class="winner-card-row-text"><strong>К выплате:</strong> ${escapeHtml(payoutText)}</span>
      </div>
      <div class="winner-card-row winner-card-address-row">
        <div class="winner-address-wrap">
          <span class="winner-address-text">${escapeHtml(trcAddress)}</span>
          ${copyBtn}
        </div>
      </div>
      ${payButton}
    </article>
  `;
}

function getOwnerDraws(ownerId) {
  const data = readData();
  return filterByOwner(data.draws, ownerId).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
}

function buildPanelLiveFingerprint(draws, userProfiles) {
  const payload = draws.map((draw) => {
    const winnerStates = (draw.winnerIds || []).map((winnerId) => {
      const notify = draw.winnerNotifications?.[String(winnerId)] || {};
      const { projectData } = getUserProfileBundle(userProfiles, winnerId, draw.projectId);
      return {
        winnerId,
        notify,
        referralVerified: Boolean(projectData.referralVerified),
        selfReportedNonReferral: Boolean(projectData.selfReportedNonReferral),
        trc20Address: projectData.trc20Address || "",
      };
    });
    return {
      id: draw.id,
      status: draw.status,
      participantCount: draw.participantIds?.length || 0,
      winnerIds: draw.winnerIds || [],
      winnerStates,
      endAt: draw.endAt || "",
      publishAt: draw.publishAt || "",
      prize: draw.prize || "",
    };
  });
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function renderDrawHistoryBlocks(draws, projects, userProfiles) {
  return draws
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
      const coverPreview = renderHistoryCoverSide(draw.imagePath);
      const winnerRows = (draw.winnerIds || [])
        .map((winnerId) => renderWinnerCard(draw, winnerId, userProfiles, winnerNotifications))
        .join("");

      return `
        <article class="history-card${draw.status === DRAW_STATUS.ACTIVE ? " history-card-active" : ""}">
          <div class="history-card-head">
            <div class="history-head-top">
              <div class="history-title-row">
                <span class="history-title-icon">${renderHistoryGiftIcon()}</span>
                <div class="history-title-text">
                  <div class="history-title">Розыгрыш ${escapeHtml(draw.prize)}</div>
                  <div class="history-subtitle">Проект: ${escapeHtml(project?.name || "не указан")}</div>
                </div>
              </div>
              <div class="history-head-actions">
                <span class="history-status status-${escapeHtml(draw.status)}">${escapeHtml(statusLabel)}</span>
                ${
                  draw.status !== DRAW_STATUS.ACTIVE
                    ? `<form method="post" action="${PANEL_BASE}/draws/${encodeURIComponent(draw.id)}/delete" class="project-delete-form draw-delete-form">
                        <button
                          type="submit"
                          class="project-icon-btn project-delete-btn draw-delete-btn"
                          title="Удалить розыгрыш"
                          data-draw-prize="${escapeHtml(draw.prize)}"
                        >${renderFormIcon("delete")}</button>
                      </form>`
                    : ""
                }
              </div>
            </div>
            <div class="history-head-divider" aria-hidden="true"></div>
          </div>

          <div class="history-body${coverPreview ? "" : " history-body-no-cover"}">
            <div class="history-body-main">
              <div class="history-info-stack">
              <div class="history-times">
                <div class="history-time-row">
                  <span class="draw-ico">${renderFormIcon("start")}</span>
                  <span class="history-time-text"><span class="history-time-label">Начало:</span> ${escapeHtml(formatCardDateTime(draw.publishAt))}</span>
                </div>
                <div class="history-time-row">
                  <span class="draw-ico">${renderFormIcon("finish")}</span>
                  <span class="history-time-text"><span class="history-time-label">Конец:</span> ${escapeHtml(formatCardDateTime(draw.endAt))}</span>
                </div>
              </div>

              <div class="history-chips">
                <span class="history-chip">
                  <span class="draw-ico">${renderFormIcon("winners")}</span>
                  <span class="history-chip-label">Участников</span>
                  <span class="history-chip-value">${draw.participantIds.length}</span>
                </span>
                <span class="history-chip">
                  <span class="draw-ico">${renderFormIcon("trophy")}</span>
                  <span class="history-chip-label">Приз. мест</span>
                  <span class="history-chip-value">${draw.winnersCount}</span>
                </span>
              </div>
              </div>
            </div>
            ${coverPreview}
          </div>

          ${
            draw.status === DRAW_STATUS.FINISHED
              ? `<details class="history-details" data-details-key="winners-${escapeHtml(draw.id)}">
                  <summary>
                    <span class="draw-ico history-details-chevron">${renderFormIcon("chevron")}</span>
                    <span class="draw-ico">${renderFormIcon("winners")}</span>
                    <span>Победители и выплаты</span>
                  </summary>
                  <div class="history-details-anim">
                    <div class="history-details-content winner-details-content">${winnerRows || "<p class=\"history-empty-note\">Победителей нет.</p>"}</div>
                  </div>
                </details>`
              : ""
          }

          <details class="history-details" data-details-key="meta-${escapeHtml(draw.id)}">
            <summary>
              <span class="draw-ico history-details-chevron">${renderFormIcon("chevron")}</span>
              <span class="draw-ico">${renderFormIcon("channel")}</span>
              <span>Дополнительно</span>
            </summary>
            <div class="history-details-anim">
              <div class="history-details-content history-meta-lines">
                <div><strong>Канал:</strong> ${escapeHtml(draw.channelId)}</div>
                <div><strong>ID:</strong> ${escapeHtml(draw.id)}</div>
              </div>
            </div>
          </details>

          <div class="history-actions">
            ${
              canPublishNow
                ? `<form method="post" action="${PANEL_BASE}/draws/${encodeURIComponent(draw.id)}/publish-now"><button type="submit" class="history-action-btn">Опубликовать сейчас</button></form>`
                : ""
            }
            ${
              canFinishNow
                ? `<form method="post" action="${PANEL_BASE}/draws/${encodeURIComponent(draw.id)}/finish-now"><button type="submit" class="history-action-btn history-action-danger">Завершить сейчас</button></form>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPanelLiveHtml(draws, projects, userProfiles) {
  const drawsStats = computeDrawStats(draws, userProfiles);
  const drawBlocks = renderDrawHistoryBlocks(draws, projects, userProfiles);
  return `
      <section class="card history-section">
        <h2 class="create-title draw-history-title">
          <span class="create-title-icon">${renderFormIcon("history")}</span>
          История розыгрышей
        </h2>
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-card-label">Всего</span>
            <span class="stat-card-value">${drawsStats.total}</span>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">Активных</span>
            <span class="stat-card-value">${drawsStats.active}</span>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">Выплачено за ${escapeHtml(drawsStats.monthLabel)}</span>
            <span class="stat-card-value stat-card-value-rub">${escapeHtml(drawsStats.paidThisMonth)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">Выплачено за всё время</span>
            <span class="stat-card-value stat-card-value-rub">${escapeHtml(drawsStats.paidAllTime)}</span>
          </div>
        </div>
      </section>

      <section>
        ${
          drawBlocks
            ? `<div class="history-list">${drawBlocks}</div>`
            : `<div class="access-empty">
              <span class="draw-ico">${renderFormIcon("gift")}</span>
              <span>Розыгрышей пока нет</span>
            </div>`
        }
      </section>
  `;
}

function renderWebPage(draws, message, webUser) {
  const ownerId = webUser?.id ?? getDefaultOwnerId();
  const showAccessPanel = isSuperAdmin(ownerId);
  const userProfiles = readUserProjectProfiles();
  const delegatedAdmins = showAccessPanel ? readDelegatedAdmins().admins || [] : [];
  const superAdminLabels = SUPER_ADMIN_IDS.map((id) =>
    renderAccessPersonCard(id, userProfiles, {
      badge: "суперадмин",
      superClass: "access-card-super",
    }),
  ).join("");
  const delegatedAdminRows = delegatedAdmins
    .map((entry) => renderAccessPersonCard(entry.userId, userProfiles, {
        entry,
        removable: true,
      }))
    .join("");
  const projects = filterByOwner(readProjects().projects || [], ownerId);
  const knownChannels = filterByOwner(readKnownChannels().channels || [], ownerId);
  const projectOptions = projects
    .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`)
    .join("");
  const channelOptions = knownChannels
    .map((channel) => {
      const preferredValue = channel.username ? `@${channel.username}` : channel.id;
      const title = channel.title || preferredValue;
      return `<option value="${escapeHtml(preferredValue)}">${escapeHtml(title)}</option>`;
    })
    .join("");
  const panelLiveVersion = buildPanelLiveFingerprint(draws, userProfiles);
  const panelLiveHtml = renderPanelLiveHtml(draws, projects, userProfiles);

  const projectsBlocks = projects.map((project) => renderProjectCard(project)).join("");
  const channelBlocks = knownChannels.map((channel) => renderChannelCard(channel)).join("");
  const botLinkChannelUrl = getBotLinkChannelUrl();

  return `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  <title>Управление розыгрышами</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>${getMiniAppHeadScript()}</script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    :root {
      --bg: #dbe8f8;
      --bg-dark: #152238;
      --app-bg-image: url("/brand/background.jpg");
      --app-bg-image-dark: url("/brand/background-dark.png");
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
    * { box-sizing: border-box; }
    img, video { max-width: 100%; height: auto; }
    html {
      overflow-x: hidden;
      max-width: 100%;
      overscroll-behavior-x: none;
      touch-action: manipulation;
      -ms-touch-action: manipulation;
    }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background-color: var(--bg);
      margin: 0 auto;
      color: var(--text);
      max-width: 100%;
      width: 100%;
      min-height: 100vh;
      overflow-x: hidden;
      overscroll-behavior-x: none;
      position: relative;
      touch-action: manipulation;
      -ms-touch-action: manipulation;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      background-color: var(--bg-active, var(--bg));
      background-image: var(--app-bg-active, var(--app-bg-image));
      background-repeat: repeat-y;
      background-position: center top;
      background-size: min(100vw, 760px) auto;
      pointer-events: none;
    }
    body.app-theme-dark {
      --bg-active: var(--bg-dark);
      --app-bg-active: var(--app-bg-image-dark);
      color: var(--text-active, var(--tg-theme-text-color, #eef1f7));
    }
    body.app-theme-light {
      --bg-active: var(--bg);
      --app-bg-active: var(--app-bg-image);
    }
    .site-header {
      background: #fff;
      border-bottom: 1px solid var(--line);
      box-shadow: 0 2px 10px rgba(27, 45, 94, 0.06);
      position: sticky;
      top: 0;
      z-index: 20;
      width: 100%;
      padding-top: env(safe-area-inset-top);
    }
    .site-header-inner {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 100%;
      width: 100%;
      margin: 0 auto;
      padding: 10px 16px;
      min-height: 52px;
      min-width: 0;
      box-sizing: border-box;
    }
    .page-title {
      flex: 1;
      min-width: 0;
    }
    .theme-toggle-btn {
      flex-shrink: 0;
      width: 36px;
      min-width: 36px;
      max-width: 36px;
      height: 36px;
      padding: 0;
      margin-left: auto;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--primary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
      transform: none;
      font-weight: 400;
    }
    .theme-toggle-btn:hover,
    .theme-toggle-btn:focus-visible {
      background: #f5f8ff;
      transform: none;
    }
    .theme-toggle-btn svg {
      width: 18px;
      height: 18px;
      display: block;
    }
    .theme-toggle-btn .theme-icon-dark {
      display: none;
    }
    body.app-theme-dark .theme-toggle-btn {
      background: var(--tg-theme-secondary-bg-color, #232f42);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 28%, transparent);
      color: var(--tg-theme-button-color, #5b8cff);
    }
    body.app-theme-dark .theme-toggle-btn:hover,
    body.app-theme-dark .theme-toggle-btn:focus-visible {
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #232f42) 82%, #000);
      transform: none;
    }
    body.app-theme-dark .theme-toggle-btn .theme-icon-light {
      display: none;
    }
    body.app-theme-dark .theme-toggle-btn .theme-icon-dark {
      display: block;
    }
    body.app-theme-dark .site-header {
      background: var(--tg-theme-secondary-bg-color, #232f42);
      border-bottom-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
    }
    body.app-theme-dark .page-title-brand {
      color: var(--tg-theme-text-color, #eef1f7);
    }
    body.app-theme-dark .page-title-sub {
      color: var(--tg-theme-hint-color, #93a0b8);
    }
    body.app-theme-dark .card {
      background: var(--tg-theme-secondary-bg-color, #232f42);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      box-shadow: none;
      color: var(--tg-theme-text-color, #eef1f7);
    }
    body.app-theme-dark .history-time-row,
    body.app-theme-dark .history-chip,
    body.app-theme-dark .stat-card,
    body.app-theme-dark .draw-block,
    body.app-theme-dark .history-details {
      background: color-mix(in srgb, var(--tg-theme-bg-color, #1c2536) 92%, #000);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 24%, transparent);
    }
    body.app-theme-dark .history-card,
    body.app-theme-dark .project-card,
    body.app-theme-dark .access-card,
    body.app-theme-dark .winner-card {
      background: var(--tg-theme-secondary-bg-color, #232f42);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 24%, transparent);
    }
    body.app-theme-dark .draw-input,
    body.app-theme-dark .draw-file-btn,
    body.app-theme-dark .draw-paste-btn {
      background: color-mix(in srgb, var(--tg-theme-bg-color, #1c2536) 88%, #000);
      color: var(--tg-theme-text-color, #eef1f7);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 28%, transparent);
    }
    body.app-theme-dark .msg {
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #232f42) 90%, #000);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      color: var(--tg-theme-text-color, #eef1f7);
    }
    .container {
      max-width: 100%;
      width: 100%;
      margin: 0 auto;
      padding: 16px 16px 24px;
      overflow-x: hidden;
      box-sizing: border-box;
    }
    h1 { margin: 0 0 14px; font-size: 24px; letter-spacing: 0.2px; }
    h2 { margin-top: 0; margin-bottom: 14px; font-size: 22px; }
    h3 { margin: 0; }
    .subtitle { color: var(--sub); margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; width: 100%; min-width: 0; max-width: 100%; }
    #panelLiveRoot {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
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
      background: var(--tg-theme-secondary-bg-color, var(--card));
      color: var(--tg-theme-text-color, var(--text));
      border: 1px solid var(--line);
      box-shadow: 0 4px 16px rgba(27, 45, 94, 0.06);
      padding: 14px;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
      max-height: 5000px;
      opacity: 1;
      transform: translateY(0);
      transition:
        max-height 0.24s ease,
        opacity 0.18s ease,
        transform 0.22s ease,
        padding 0.22s ease,
        border-width 0.18s ease,
        box-shadow 0.18s ease;
    }
    .create-form { display: grid; gap: 10px; }
    .create-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
      font-size: 17px;
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
    }
    .create-title-icon {
      width: 22px;
      height: 22px;
      display: inline-flex;
      color: var(--tg-theme-button-color, var(--primary));
    }
    .create-title-icon svg { width: 22px; height: 22px; }
    .draw-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: inherit;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .draw-block {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      border-radius: 12px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .draw-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .draw-field { min-width: 0; overflow: hidden; }
    .draw-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 700;
      color: var(--tg-theme-hint-color, var(--sub));
      margin-bottom: 4px;
      min-width: 0;
      white-space: nowrap;
    }
    .draw-label-text {
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .draw-ico {
      width: 14px;
      height: 14px;
      display: inline-flex;
      color: var(--tg-theme-button-color, var(--primary));
      flex-shrink: 0;
    }
    .draw-ico svg { width: 14px; height: 14px; display: block; }
    .draw-input {
      width: 100%;
      font-family: inherit;
      font-size: 16px;
      font-weight: 500;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-text-color, var(--text));
      padding: 9px 10px;
      box-sizing: border-box;
    }
    .draw-form select.draw-input {
      appearance: none;
      -webkit-appearance: none;
      padding-right: 28px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%2365708a'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      cursor: pointer;
    }
    .draw-input:focus {
      outline: none;
      border-color: var(--tg-theme-button-color, var(--primary));
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 18%, transparent);
    }
    .draw-timing-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      align-items: end;
      width: 100%;
    }
    .draw-inline-full {
      display: flex;
      gap: 6px;
      align-items: center;
      width: 100%;
      min-width: 0;
    }
    .draw-input-num {
      width: 52px;
      flex: 0 0 52px;
      padding: 9px 6px;
      text-align: center;
    }
    .draw-input-unit {
      flex: 1 1 auto;
      min-width: 72px;
      padding: 9px 26px 9px 8px;
      font-size: 13px;
    }
    .draw-block-confirm {
      padding: 8px 10px;
    }
    .projects-list,
    .channels-list,
    .access-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .settings-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .settings-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 10px 6px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 28%, transparent);
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 10%, transparent);
      color: var(--tg-theme-button-color, var(--primary));
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
      text-decoration: none;
      box-sizing: border-box;
    }
    .settings-action-btn:hover,
    .settings-action-btn:focus-visible,
    .settings-action-btn.settings-action-active {
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 18%, transparent);
    }
    .settings-collapse {
      margin-bottom: 2px;
    }
    .channel-card-meta {
      font-size: 12px;
      font-weight: 600;
      color: var(--tg-theme-hint-color, var(--sub));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .channel-card-avatar {
      object-fit: cover;
    }
    .channel-card-logo-wrap {
      border-radius: 50%;
    }
    .projects-list-title,
    .access-list-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 12px 0 6px;
      font-size: 13px;
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
    }
    .projects-list-title .draw-ico,
    .access-list-title .draw-ico {
      width: 16px;
      height: 16px;
    }
    .projects-list-title .draw-ico svg,
    .access-list-title .draw-ico svg {
      width: 16px;
      height: 16px;
    }
    .project-card {
      padding: 10px;
      border-radius: 12px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }
    .project-card-head {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .project-card:not(.channel-card) .project-card-head {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .project-card-logo-wrap {
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      border-radius: 10px;
      overflow: hidden;
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .project-card-logo {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .project-card-logo-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 70%, transparent);
    }
    .project-card-logo-fallback svg {
      width: 22px;
      height: 22px;
    }
    .project-card-body {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }
    .project-card-name {
      margin: 0 0 4px;
      font-size: 15px;
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .channel-card .project-card-name {
      font-size: 13px;
      font-weight: 700;
    }
    .project-card-link {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--tg-theme-link-color, var(--primary));
      text-decoration: none;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }
    .project-card-link .draw-ico {
      flex-shrink: 0;
      margin-top: 1px;
    }
    .project-card-link-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
      flex: 1 1 auto;
      direction: rtl;
      text-align: left;
      unicode-bidi: plaintext;
    }
    .project-card-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      align-items: flex-start;
      justify-self: end;
    }
    .project-delete-form {
      margin: 0;
      display: inline-flex;
    }
    .project-icon-btn {
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, var(--primary));
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
    }
    .project-icon-btn:hover,
    .project-icon-btn:focus-visible {
      background: var(--tg-theme-secondary-bg-color, #fff);
      transform: none;
    }
    .project-icon-btn svg {
      width: 16px;
      height: 16px;
      display: block;
    }
    .project-delete-btn {
      color: #c0392b;
      border-color: color-mix(in srgb, #c0392b 28%, transparent);
    }
    .project-delete-btn:hover,
    .project-delete-btn:focus-visible {
      background: #fff5f5;
      color: #c0392b;
      transform: none;
    }
    .project-form-footer {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .project-cancel-btn {
      align-self: flex-start;
      padding: 0;
      min-height: 0;
    }
    .projects-empty,
    .access-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 18px 12px;
      border-radius: 12px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px dashed color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 28%, transparent);
      color: var(--tg-theme-hint-color, var(--sub));
      font-size: 13px;
      font-weight: 600;
      text-align: center;
    }
    .projects-empty .draw-ico,
    .access-empty .draw-ico {
      width: 28px;
      height: 28px;
      color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 55%, transparent);
    }
    .projects-empty .draw-ico svg,
    .access-empty .draw-ico svg {
      width: 28px;
      height: 28px;
    }
    .access-card {
      padding: 10px;
      border-radius: 12px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }
    .access-card-super {
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 6%, var(--tg-theme-bg-color, #f5f8ff));
    }
    .access-card-head {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .access-card-head-removable {
      grid-template-columns: auto 48px minmax(0, 1fr);
    }
    .access-avatar-wrap {
      width: 48px;
      height: 48px;
      flex-shrink: 0;
    }
    .access-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
      display: block;
    }
    .access-avatar-fallback {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, var(--primary));
      font-weight: 800;
      font-size: 18px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
    }
    .access-card-body {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }
    .access-card-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      margin-bottom: 2px;
    }
    .access-card-name {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .access-card-meta {
      font-size: 12px;
      color: var(--tg-theme-hint-color, var(--sub));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .access-badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--tg-theme-button-color, var(--primary));
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 12%, #fff);
      border-radius: 999px;
      padding: 2px 7px;
    }
    .access-card-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      align-items: center;
      justify-self: start;
    }
    .access-form {
      margin-top: 4px;
    }
    .draw-media-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 6px;
      width: 100%;
      max-width: 100%;
      align-items: stretch;
    }
    .draw-paste-btn {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      padding: 0 8px;
      border-radius: 10px;
      border: 1px dashed color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 38%, transparent);
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, var(--primary));
      cursor: pointer;
      height: 38px;
      min-height: 38px;
      max-height: 38px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      -webkit-user-modify: read-write-plaintext-only;
    }
    .draw-file-btn {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      padding: 0 8px;
      border-radius: 10px;
      border: 1px dashed color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 38%, transparent);
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, var(--primary));
      cursor: pointer;
      height: 38px;
      min-height: 38px;
      max-height: 38px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .draw-file-btn:hover,
    .draw-file-btn:focus-visible,
    .draw-paste-btn:hover,
    .draw-paste-btn:focus-visible {
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, var(--primary));
      transform: none;
    }
    .draw-file-btn input { display: none; }
    .draw-link-btn {
      background: none;
      border: none;
      color: var(--tg-theme-link-color, var(--primary));
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 0;
      width: auto;
      min-height: 0;
      text-align: left;
      cursor: pointer;
    }
    .draw-field-hidden { display: none !important; }
    .anim-collapse {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
      transition: max-height 0.22s ease, opacity 0.18s ease;
    }
    .anim-collapse.anim-collapse-open {
      max-height: 220px;
      opacity: 1;
      pointer-events: auto;
    }
    .draw-timing-row .anim-collapse.anim-collapse-open {
      max-height: 120px;
    }
    .draw-form .paste-preview {
      display: none;
      margin-top: 6px;
      border-radius: 10px;
      max-height: 100px;
      width: 100%;
      object-fit: cover;
    }
    .draw-submit {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 13px 16px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 800;
      font-family: inherit;
      background: var(--tg-theme-button-color, var(--primary));
      color: var(--tg-theme-button-text-color, #fff);
      border: none;
      cursor: pointer;
    }
    .draw-submit:hover,
    .draw-submit:focus-visible {
      background: var(--tg-theme-button-color, var(--primary));
      color: var(--tg-theme-button-text-color, #fff);
      filter: brightness(1.06);
      transform: none;
    }
    .draw-submit .draw-ico { color: inherit; width: 18px; height: 18px; }
    .draw-submit .draw-ico svg { width: 18px; height: 18px; }
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
      border-radius: 12px;
      border: 1px solid #cfd8ef;
      padding: 9px 11px;
      font-size: 16px;
      box-sizing: border-box;
      background: #fff;
    }
    input, select,
    button:not(.quick-action):not(.project-icon-btn):not(.draw-link-btn):not(.theme-toggle-btn):not(.winner-copy-btn) {
      width: 100%;
    }
    .card-dark input,
    .card-dark select {
      border: 1px solid #6f86d8;
      background: rgba(255, 255, 255, 0.96);
    }
    button:not(.theme-toggle-btn):not(.settings-action-btn):not(.winner-copy-btn):not(.quick-action):not(.project-icon-btn):not(.draw-link-btn):not(.history-action-btn):not(.winner-action-btn) {
      background: var(--primary);
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: 700;
      transition: all 0.18s ease;
    }
    button:not(.theme-toggle-btn):not(.settings-action-btn):not(.winner-copy-btn):not(.quick-action):not(.project-icon-btn):not(.draw-link-btn):not(.history-action-btn):not(.winner-action-btn):hover {
      background: var(--primary-2);
      transform: translateY(-1px);
    }
    button.theme-toggle-btn {
      width: 36px;
      min-width: 36px;
      max-width: 36px;
      height: 36px;
      padding: 0;
      flex-shrink: 0;
      margin-left: auto;
      background: #fff;
      color: var(--primary);
      border: 1px solid var(--line);
      font-weight: 400;
      transform: none;
    }
    button.theme-toggle-btn:hover,
    button.theme-toggle-btn:focus-visible {
      background: #f5f8ff;
      transform: none;
    }
    button.theme-toggle-btn svg {
      width: 18px;
      height: 18px;
      display: block;
      flex-shrink: 0;
    }
    body.app-theme-dark button.theme-toggle-btn {
      background: var(--tg-theme-secondary-bg-color, #232f42);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 28%, transparent);
      color: var(--tg-theme-button-color, #5b8cff);
    }
    body.app-theme-dark button.theme-toggle-btn:hover,
    body.app-theme-dark button.theme-toggle-btn:focus-visible {
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #232f42) 82%, #000);
      transform: none;
    }
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
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .msg.msg-hide {
      opacity: 0;
      transform: translateY(-8px);
      pointer-events: none;
    }
    .hint { color: var(--sub); font-size: 12px; margin-top: 4px; margin-bottom: 6px; }
    .card-dark .hint { color: #d1ddff; margin-top: 2px; }
    .actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .actions form { margin: 0; width: auto; min-width: 0; flex: 1 1 140px; max-width: 100%; }
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
    .design-banner {
      background: #fff8e6;
      border: 1px solid #ffe2a8;
      color: #6a4f00;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 14px;
      border-radius: 12px;
      margin-bottom: 14px;
      text-align: center;
    }
    .section-title {
      margin: 8px 0 4px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #7682a0;
      font-weight: 800;
    }
    .admin-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .quick-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    .quick-action {
      flex: 1 1 0;
      width: auto;
      min-width: 0;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 10px 6px;
      min-height: 58px;
      border-radius: 12px;
      border: 1px solid #cad6ff;
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, #325fff);
      cursor: pointer;
      font-weight: 700;
      transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease, filter 0.18s ease;
    }
    body.app-theme-dark .quick-action:not(.quick-action-primary),
    body.app-theme-dark .quick-action:not(.quick-action-primary):hover,
    body.app-theme-dark .quick-action:not(.quick-action-primary):focus-visible {
      background: var(--tg-theme-secondary-bg-color, #232f42);
      color: var(--tg-theme-link-color, var(--tg-theme-button-color, #5b8cff));
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
    }
    .quick-action:hover,
    .quick-action:focus-visible {
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, #325fff);
      transform: translateY(-1px);
    }
    .quick-action-primary {
      background: var(--tg-theme-button-color, var(--primary));
      color: var(--tg-theme-button-text-color, #fff);
      border-color: transparent;
    }
    .quick-action-primary:hover,
    .quick-action-primary:focus-visible {
      background: var(--tg-theme-button-color, var(--primary));
      color: var(--tg-theme-button-text-color, #fff);
      filter: brightness(1.06);
      transform: translateY(-1px);
    }
    .quick-action.qa-active {
      outline: none;
      box-shadow: inset 0 0 0 1.5px var(--tg-theme-button-color, var(--primary));
    }
    .quick-action-primary.qa-active {
      filter: brightness(1.06);
      box-shadow: none;
    }
    .qa-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      line-height: 0;
    }
    .qa-icon svg {
      width: 22px;
      height: 22px;
      display: block;
      flex-shrink: 0;
    }
    .quick-action .qa-label {
      font-size: 11px;
      line-height: 1.15;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .page-logo {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
      display: block;
      box-shadow: 0 2px 8px rgba(27, 45, 94, 0.12);
    }
    .page-title {
      margin: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 17px;
      line-height: 1;
      min-width: 0;
      flex: 1;
    }
    .page-title-brand {
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
    }
    .page-title-sub {
      font-size: 13px;
      font-weight: 500;
      color: var(--tg-theme-hint-color, var(--sub));
    }
    .btn-secondary { background: #ffffff; color: #2c3f86; border: 1px solid #cad6ff; }
    .btn-secondary:hover { background: #f5f8ff; }
    .btn-danger { background: #fff5f5; color: #b42318; border: 1px solid #fecdca; }
    .btn-danger:hover { background: #fee4e2; }
    .panel-hidden {
      max-height: 0;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
      border-width: 0;
      box-shadow: none;
      transform: translateY(-6px);
      pointer-events: none;
    }
    .admin-panels-stack {
      display: grid;
      min-height: 0;
      min-width: 0;
    }
    .admin-panels-stack:not(:has(.create-panel:not(.panel-hidden))) {
      display: none;
    }
    .admin-panels-stack > .create-panel {
      grid-area: 1 / 1;
      width: 100%;
      min-width: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      .create-panel,
      .panel-hidden,
      .anim-collapse,
      .history-details-anim,
      .history-details-chevron,
      .history-details summary,
      .quick-action {
        transition: none !important;
      }
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
      width: 100%;
      min-width: 0;
    }
    .stat-card {
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 12px;
      padding: 10px;
      min-width: 0;
      box-sizing: border-box;
    }
    .stat-card-label {
      display: block;
      color: var(--tg-theme-hint-color, #7582a5);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.25;
      margin-bottom: 4px;
    }
    .stat-card-value {
      display: block;
      font-size: 20px;
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
      line-height: 1.15;
    }
    .stat-card-value-rub {
      font-size: 17px;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .draw-history-title { margin: 0 0 10px; font-size: 17px; }
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      min-width: 0;
    }
    .history-card {
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 12px;
      padding: 10px;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .history-card.history-card-active {
      border: 2px solid var(--tg-theme-button-color, var(--primary));
    }
    body.app-theme-dark .history-card.history-card-active,
    body.mini-app-shell.app-theme-dark .history-card.history-card-active {
      border: 2px solid #5b8cff;
    }
    body.app-theme-light .history-card.history-card-active,
    body.mini-app-shell.app-theme-light .history-card.history-card-active {
      border: 2px solid #325fff;
    }
    .history-card-head {
      display: flex;
      flex-direction: column;
      gap: 0;
      min-width: 0;
      margin-bottom: 8px;
    }
    .history-head-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .history-title-block {
      flex: 1 1 auto;
      min-width: 0;
    }
    .history-title-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .history-title-text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .history-head-divider {
      margin-top: 8px;
      border-top: 1px dashed color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 24%, transparent);
    }
    body.app-theme-dark .history-head-divider {
      border-top-color: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 32%, transparent);
    }
    .history-title-icon {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 12%, transparent);
      color: var(--tg-theme-button-color, var(--primary));
    }
    .history-title-icon svg {
      width: 17px;
      height: 17px;
      display: block;
    }
    .history-title-text .history-title {
      font-size: 15px;
      font-weight: 800;
      line-height: 1.2;
      color: var(--tg-theme-text-color, var(--text));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .history-subtitle {
      margin-top: 2px;
      padding-left: 0;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.25;
      color: var(--tg-theme-hint-color, var(--sub));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .history-head-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .draw-delete-form {
      margin: 0;
      display: inline-flex;
    }
    .draw-delete-btn {
      width: 28px;
      height: 28px;
    }
    .draw-delete-btn svg {
      width: 14px;
      height: 14px;
    }
    .history-status {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid transparent;
    }
    .history-cover-side {
      flex: 0 0 92px;
      width: 92px;
      align-self: stretch;
      min-height: 0;
      border-radius: 10px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 5px;
      box-sizing: border-box;
    }
    .history-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: stretch;
      gap: 8px;
      margin-bottom: 4px;
      min-width: 0;
    }
    .history-body-main {
      min-width: 0;
      display: flex;
      align-items: stretch;
    }
    .history-info-stack {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      width: 100%;
      min-width: 0;
    }
    .history-body-no-cover {
      grid-template-columns: 1fr;
    }
    .history-body-no-cover .history-body-main {
      width: 100%;
    }
    .history-thumb {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      border-radius: 6px;
    }
    .history-times {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      margin-bottom: 0;
    }
    .history-time-row {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      padding: 6px 8px;
      border-radius: 8px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
    }
    .history-time-row .draw-ico {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
    }
    .history-time-row .draw-ico svg {
      width: 13px;
      height: 13px;
    }
    .history-time-text {
      font-size: 11px;
      font-weight: 600;
      color: var(--tg-theme-hint-color, var(--sub));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .history-time-label {
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
    }
    .history-chips {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 0;
    }
    .history-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      border-radius: 8px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      font-size: 11px;
      font-weight: 600;
      color: var(--tg-theme-hint-color, var(--sub));
      min-width: 0;
      justify-content: flex-start;
    }
    .history-chip-label {
      white-space: nowrap;
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .history-chip-value {
      font-size: 12px;
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
      flex-shrink: 0;
      margin-left: auto;
    }
    .history-chip .draw-ico {
      width: 14px;
      height: 14px;
      color: var(--tg-theme-button-color, var(--primary));
    }
    .history-chip .draw-ico svg {
      width: 14px;
      height: 14px;
    }
    .history-details {
      margin-top: 4px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      background: var(--tg-theme-bg-color, #f5f8ff);
      overflow: hidden;
    }
    .history-details summary {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 9px 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
      color: var(--tg-theme-text-color, var(--text));
      list-style: none;
      transition: background 0.15s ease;
    }
    .history-details summary:hover {
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 6%, transparent);
    }
    .history-details summary::-webkit-details-marker {
      display: none;
    }
    .history-details-chevron {
      transition: transform 0.22s ease;
      color: var(--tg-theme-hint-color, var(--sub));
    }
    .history-details[open] .history-details-chevron {
      transform: rotate(180deg);
    }
    .history-details-anim {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      transition: grid-template-rows 0.22s ease, opacity 0.18s ease;
    }
    .history-details[open] .history-details-anim {
      grid-template-rows: 1fr;
      opacity: 1;
    }
    .history-details-content {
      overflow: hidden;
      min-height: 0;
      padding: 8px 10px 10px;
      border-top: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
    }
    .history-meta-lines {
      display: grid;
      gap: 4px;
      font-size: 12px;
      color: var(--tg-theme-hint-color, var(--sub));
      word-break: break-all;
    }
    .history-empty-note {
      margin: 0;
      font-size: 12px;
      color: var(--tg-theme-hint-color, var(--sub));
    }
    .winner-details-content {
      display: grid;
      gap: 8px;
    }
    .winner-card {
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 10px;
      padding: 10px;
      background: var(--tg-theme-secondary-bg-color, #fff);
      min-width: 0;
    }
    .winner-card-head {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 8px;
      min-width: 0;
    }
    .winner-card-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
      flex-shrink: 0;
    }
    .winner-card-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--tg-theme-bg-color, #edf2ff);
      color: var(--tg-theme-button-color, var(--primary));
      font-weight: 800;
      font-size: 16px;
    }
    .winner-card-body {
      flex: 1;
      min-width: 0;
    }
    .winner-card-name-row {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      min-width: 0;
    }
    .winner-card-name-row .winner-card-name {
      flex: 0 1 auto;
      min-width: 0;
    }
    .winner-profile-btn {
      width: 22px;
      height: 22px;
      min-width: 22px;
      max-width: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 10%, transparent);
      color: var(--tg-theme-button-color, var(--primary));
      text-decoration: none;
      flex-shrink: 0;
      padding: 0;
      box-sizing: border-box;
    }
    .winner-profile-btn:hover,
    .winner-profile-btn:focus-visible {
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 18%, transparent);
      transform: none;
    }
    .winner-profile-btn svg {
      width: 13px;
      height: 13px;
      display: block;
    }
    .winner-card-name {
      font-size: 14px;
      font-weight: 800;
      color: var(--tg-theme-text-color, var(--text));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .winner-card-meta {
      font-size: 12px;
      color: var(--tg-theme-hint-color, var(--sub));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .winner-card-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }
    .winner-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      background: var(--tg-theme-bg-color, #f5f8ff);
      color: var(--tg-theme-hint-color, var(--sub));
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
    }
    .winner-badge-ok {
      color: #1a7f37;
      background: #e8f5ec;
      border-color: #b7dfc4;
    }
    .winner-badge-warn {
      color: #9a6700;
      background: #fff8e6;
      border-color: #f0d58b;
    }
    .winner-badge-paid {
      color: #1a7f37;
      background: #e8f5ec;
      border-color: #b7dfc4;
    }
    .winner-badge-danger {
      color: #cf222e;
      background: #ffebe9;
      border-color: #ff8182;
    }
    .winner-card-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 6px;
      min-width: 0;
      font-size: 12px;
      color: var(--tg-theme-text-color, var(--text));
    }
    .winner-card-row .draw-ico {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      margin-top: 1px;
      color: var(--tg-theme-button-color, var(--primary));
    }
    .winner-card-row .draw-ico svg {
      width: 14px;
      height: 14px;
    }
    .winner-card-row-text {
      min-width: 0;
      word-break: break-word;
    }
    .winner-card-address-row {
      align-items: center;
    }
    .winner-card-address-row .winner-address-wrap {
      width: 100%;
    }
    .winner-address-wrap {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 6px 5px 8px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      box-sizing: border-box;
    }
    .winner-address-text {
      flex: 1;
      min-width: 0;
      font-size: 11px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.01em;
      color: var(--tg-theme-hint-color, var(--sub));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.3;
    }
    .winner-copy-btn {
      width: 20px;
      height: 20px;
      min-width: 20px;
      max-width: 20px;
      padding: 0;
      margin: 0;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 5px;
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 12%, transparent);
      color: var(--tg-theme-button-color, var(--primary));
      cursor: pointer;
      transform: none;
      font-weight: 400;
      box-sizing: border-box;
    }
    .winner-copy-btn:hover,
    .winner-copy-btn:focus-visible {
      background: color-mix(in srgb, var(--tg-theme-button-color, var(--primary)) 22%, transparent);
      transform: none;
    }
    .winner-copy-btn svg {
      width: 12px;
      height: 12px;
      display: block;
    }
    body.app-theme-dark .winner-address-wrap {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 10%, transparent);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 18%, transparent);
    }
    body.app-theme-dark .winner-copy-btn {
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 16%, transparent);
    }
    body.app-theme-dark .winner-copy-btn:hover,
    body.app-theme-dark .winner-copy-btn:focus-visible {
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 26%, transparent);
    }
    .winner-card-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .winner-card-actions form {
      margin: 0;
      flex: 1;
      min-width: 0;
    }
    .winner-action-btn {
      width: 100%;
      padding: 8px 10px;
      border-radius: 8px;
      border: none;
      font-family: inherit;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      background: var(--tg-theme-button-color, var(--primary));
      color: var(--tg-theme-button-text-color, #fff);
    }
    .winner-action-btn:hover,
    .winner-action-btn:focus-visible {
      filter: brightness(1.06);
      transform: none;
    }
    .winner-action-secondary {
      background: var(--tg-theme-bg-color, #f5f8ff);
      color: var(--tg-theme-text-color, var(--text));
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
    }
    .winner-action-muted {
      opacity: 0.65;
      cursor: default;
    }
    .winner-action-btn:disabled {
      opacity: 0.65;
      cursor: default;
      pointer-events: none;
    }
    .history-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .history-actions form {
      margin: 0;
      width: 100%;
    }
    .history-action-btn {
      width: 100%;
      padding: 11px 14px;
      border-radius: 10px;
      border: none;
      font-family: inherit;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      background: var(--tg-theme-button-color, var(--primary));
      color: var(--tg-theme-button-text-color, #fff);
    }
    .history-action-btn:hover,
    .history-action-btn:focus-visible {
      filter: brightness(1.06);
      transform: none;
    }
    .history-action-danger {
      background: #d73a49;
      color: #fff;
    }
    .history-action-danger:hover,
    .history-action-danger:focus-visible {
      background: #d73a49;
      filter: brightness(1.06);
    }
    .status-active { background: #eaffef; color: #21754a; border-color: #b7edc9; }
    .status-scheduled { background: #eef3ff; color: #2d56cc; border-color: #d4dfff; }
    .status-finished { background: #f3f4f8; color: #555f76; border-color: #dde1ea; }
    body.app-theme-dark .status-active {
      background: color-mix(in srgb, #3dd68c 18%, transparent);
      color: #7ee2a8;
      border-color: color-mix(in srgb, #3dd68c 34%, transparent);
    }
    body.app-theme-dark .status-scheduled {
      background: color-mix(in srgb, #5b8cff 18%, transparent);
      color: #9bb8ff;
      border-color: color-mix(in srgb, #5b8cff 34%, transparent);
    }
    body.app-theme-dark .status-finished {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 16%, transparent);
      color: #b8c2d8;
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 30%, transparent);
    }
    body.app-theme-dark .winner-badge {
      color: var(--tg-theme-hint-color, #93a0b8);
      background: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 12%, transparent);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 24%, transparent);
    }
    body.app-theme-dark .winner-badge-ok,
    body.app-theme-dark .winner-badge-paid {
      color: #7ee2a8;
      background: color-mix(in srgb, #3dd68c 16%, transparent);
      border-color: color-mix(in srgb, #3dd68c 30%, transparent);
    }
    body.app-theme-dark .winner-badge-warn {
      color: #f0c14d;
      background: color-mix(in srgb, #f0c14d 14%, transparent);
      border-color: color-mix(in srgb, #f0c14d 28%, transparent);
    }
    body.app-theme-dark .winner-badge-danger {
      color: #ff9a9a;
      background: color-mix(in srgb, #ff6b6b 14%, transparent);
      border-color: color-mix(in srgb, #ff6b6b 28%, transparent);
    }
    body.app-theme-dark .winner-profile-btn {
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 14%, transparent);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #93a0b8) 28%, transparent);
    }
    body.app-theme-dark .winner-profile-btn:hover,
    body.app-theme-dark .winner-profile-btn:focus-visible {
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 24%, transparent);
    }
    .project-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .compact-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .compact-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .subtle-details { margin-top: 4px; border: 1px dashed rgba(211, 223, 255, 0.6); border-radius: 10px; padding: 6px 8px; }
    .subtle-details summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #dbe6ff; }
    .form-footer { display: flex; justify-content: flex-end; margin-top: 2px; }
    .form-footer button { max-width: 220px; }
    @media (max-width: 900px) {
      body:not(.mini-app-shell) .row,
      body:not(.mini-app-shell) .row-3 { grid-template-columns: 1fr; }
      .actions form { width: 100%; }
      body:not(.mini-app-shell) .container { padding: 16px; }
      body:not(.mini-app-shell) .admin-actions,
      body:not(.mini-app-shell) .stats-row,
      body:not(.mini-app-shell) .project-layout { grid-template-columns: 1fr; }
      body:not(.mini-app-shell) .compact-grid-2,
      body:not(.mini-app-shell) .compact-grid-3 { grid-template-columns: 1fr; }
      .form-footer button { max-width: none; }
    }
    ${getMiniAppStyles()}
  </style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <img src="/brand/logo.jpg" alt="" class="page-logo" width="36" height="36" loading="eager" />
      <h1 class="page-title"><span class="page-title-brand">RollerBot</span><span class="page-title-sub">Панель розыгрышей</span></h1>
      <button type="button" class="theme-toggle-btn" id="themeToggleBtn" title="Переключить тему" aria-label="Переключить тему">
        <span class="theme-icon theme-icon-light" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></span>
        <span class="theme-icon theme-icon-dark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>
      </button>
    </div>
  </header>
  <div class="container">
    ${message ? `<div class="msg">${escapeHtml(message)}</div>` : ""}
    <div class="grid">
      <div class="quick-actions">
        <button id="toggleCreateDrawBtn" type="button" class="quick-action">
          <span class="qa-icon">${renderQuickActionIcon("create")}</span>
          <span class="qa-label">Создать</span>
        </button>
        <button id="toggleSettingsBtn" type="button" class="quick-action">
          <span class="qa-icon">${renderQuickActionIcon("settings")}</span>
          <span class="qa-label">Настройки</span>
        </button>
        ${
          showAccessPanel
            ? `<button id="toggleAccessBtn" type="button" class="quick-action">
          <span class="qa-icon">${renderQuickActionIcon("access")}</span>
          <span class="qa-label">Доступ</span>
        </button>`
            : ""
        }
      </div>

      <div class="admin-panels-stack">
      <section id="createDrawPanel" class="card create-panel panel-hidden">
        <h2 class="create-title">
          <span class="create-title-icon">${renderFormIcon("gift")}</span>
          Новый розыгрыш
        </h2>
        <form id="create-draw-form" method="post" action="${PANEL_BASE}/draws" enctype="multipart/form-data" class="draw-form">
          <div class="draw-block">
            <div class="draw-row-2">
              <div class="draw-field">
                ${drawLabel("project", "Проект")}
                <select class="draw-input" name="projectId" required>
                  <option value="">Выберите</option>
                  ${projectOptions}
                </select>
              </div>
              <div class="draw-field">
                ${drawLabel("channel", "Канал")}
                <select class="draw-input" name="knownChannelId" required>
                  <option value="">Выберите</option>
                  ${channelOptions}
                </select>
              </div>
            </div>
          </div>

          <div class="draw-block">
            <div class="draw-row-2">
              <div class="draw-field">
                ${drawLabel("prize", "Приз")}
                <select class="draw-input" id="prizeType" name="prizeType" required>
                  <option value="money_rub">Деньги ₽</option>
                  <option value="money_usd">Деньги $</option>
                  <option value="custom">Другое</option>
                </select>
              </div>
              <div class="draw-field" id="moneyPrizeFields">
                ${drawLabel("prize", "Сумма")}
                <input class="draw-input" name="prizeAmount" type="number" min="1" step="1" placeholder="50000" />
              </div>
              <div class="draw-field" id="customPrizeFields" style="display:none;">
                ${drawLabel("gift", "Описание")}
                <input class="draw-input" name="prizeCustomText" placeholder="iPhone 16 Pro" />
              </div>
            </div>
            <div class="draw-field">
              ${drawLabel("photo", "Обложка")}
              <div class="draw-media-row">
                <label class="draw-file-btn">
                  <input id="draw-image-input" name="image" type="file" accept="image/*" />
                  Галерея
                </label>
                <div id="draw-paste-target" class="draw-paste-btn" contenteditable="true">Вставить</div>
              </div>
              <input type="hidden" id="draw-clipboard-data" name="imageClipboardData" data-field-name="imageClipboardData" />
              <img id="draw-paste-preview" class="paste-preview" alt="" />
            </div>
          </div>

          <div class="draw-block">
            <div class="draw-row-2">
              <div class="draw-field">
                ${drawLabel("winners", "Победители")}
                <input class="draw-input" name="winnersCount" type="number" min="1" max="20" value="1" required />
              </div>
              <div class="draw-field">
                ${drawLabel("start", "Старт")}
                <select class="draw-input" id="publishMode" name="publishMode">
                  <option value="now">Сейчас</option>
                  <option value="scheduled">По времени</option>
                </select>
              </div>
            </div>
            <div class="draw-field anim-collapse" id="publishAtWrap">
              <input class="draw-input" name="publishAt" type="datetime-local" value="${escapeHtml(
                formatDateTimeForInput(DateTime.now().setZone(TIMEZONE).plus({ minutes: 1 }).toISO())
              )}" />
            </div>
            <div class="draw-timing-row">
              <div class="draw-field">
                ${drawLabel("finish", "Финиш")}
                <select class="draw-input" id="endMode" name="endMode">
                  <option value="scheduled" selected>По времени</option>
                  <option value="manual">Вручную</option>
                </select>
              </div>
              <div class="draw-field anim-collapse anim-collapse-open" id="endAfterWrap">
                ${drawLabel("finish", "Длительность")}
                <div class="draw-inline-full">
                  <input class="draw-input draw-input-num" name="endAfterValue" type="number" min="1" step="1" value="10" />
                  <select class="draw-input draw-input-unit" name="endAfterUnit">
                    <option value="minutes">мин.</option>
                    <option value="hours">ч.</option>
                    <option value="days">дн.</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="draw-block draw-block-confirm">
            <div class="draw-field">
              ${drawLabel("confirm", "Время на подтверждение")}
              <div class="draw-inline-full">
                <input class="draw-input draw-input-num" name="winnerConfirmValue" type="number" min="1" step="1" value="30" />
                <select class="draw-input draw-input-unit" name="winnerConfirmUnit">
                  <option value="minutes">мин.</option>
                  <option value="hours">ч.</option>
                </select>
              </div>
            </div>
          </div>

          <button type="submit" class="draw-submit">
            <span class="draw-ico">${renderFormIcon("gift")}</span>
            Создать розыгрыш
          </button>
        </form>
      </section>

      <section id="settingsPanel" class="card create-panel panel-hidden">
        <h2 class="create-title">
          <span class="create-title-icon">${renderFormIcon("settings")}</span>
          Настройки
        </h2>

        <div class="settings-actions">
          <button type="button" id="toggleAddProjectBtn" class="settings-action-btn">
            <span class="draw-ico">${renderFormIcon("project")}</span>
            Добавить проект
          </button>
          <a href="${escapeHtml(botLinkChannelUrl)}" id="addChannelBtn" class="settings-action-btn settings-action-link">
            <span class="draw-ico">${renderFormIcon("channel")}</span>
            Добавить канал
          </a>
        </div>

        <div id="addProjectWrap" class="settings-collapse panel-hidden">
        <form id="create-project-form" method="post" action="${PANEL_BASE}/projects" enctype="multipart/form-data" class="draw-form">
          <div class="draw-block">
            <div class="draw-field">
              ${drawLabel("project", "Название")}
              <input class="draw-input" name="name" required placeholder="Pokerdom" />
            </div>
            <div class="draw-field">
              ${drawLabel("link", "Реферальная ссылка")}
              <input class="draw-input" name="refLink" type="url" placeholder="https://..." required />
            </div>
          </div>
          <div class="draw-block">
            <div class="draw-field">
              ${drawLabel("photo", "Лого")}
              <div class="draw-media-row">
                <label class="draw-file-btn">
                  <input id="project-logo-input" name="logo" type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" />
                  Файл
                </label>
                <div id="project-paste-target" class="draw-paste-btn" contenteditable="true">Вставить</div>
              </div>
              <input type="hidden" id="project-clipboard-data" name="logoClipboardData" data-field-name="logoClipboardData" />
              <img id="project-paste-preview" class="paste-preview" alt="" />
            </div>
          </div>
          <div class="project-form-footer">
            <button type="button" id="project-edit-cancel" class="draw-link-btn project-cancel-btn" style="display:none;">Отмена редактирования</button>
            <button type="submit" id="project-submit-btn" class="draw-submit">
              <span class="draw-ico">${renderFormIcon("project")}</span>
              <span id="project-submit-label">Добавить проект</span>
            </button>
          </div>
        </form>
        </div>

        <div class="projects-list-title">
          <span class="draw-ico">${renderFormIcon("project")}</span>
          Мои проекты
        </div>
        <div class="projects-list">
          ${
            projectsBlocks ||
            `<div class="projects-empty">
              <span class="draw-ico">${renderFormIcon("project")}</span>
              <span>Проектов пока нет — нажмите «Добавить проект»</span>
            </div>`
          }
        </div>

        <div class="projects-list-title">
          <span class="draw-ico">${renderFormIcon("channel")}</span>
          Мои каналы
        </div>
        <div class="channels-list">
          ${
            channelBlocks ||
            `<div class="projects-empty">
              <span class="draw-ico">${renderFormIcon("channel")}</span>
              <span>Каналов пока нет — нажмите «Добавить канал»</span>
            </div>`
          }
        </div>
      </section>

      ${
        showAccessPanel
          ? `
      <section id="accessPanel" class="card create-panel panel-hidden">
        <h2 class="create-title">
          <span class="create-title-icon">${renderFormIcon("confirm")}</span>
          Доступ
        </h2>

        <div class="access-list-title">
          <span class="draw-ico">${renderFormIcon("confirm")}</span>
          Суперадмины
        </div>
        <div class="access-list">
          ${
            superAdminLabels ||
            `<div class="access-empty">
              <span class="draw-ico">${renderFormIcon("confirm")}</span>
              <span>SUPER_ADMIN_IDS не задан</span>
            </div>`
          }
        </div>

        <div class="access-list-title">
          <span class="draw-ico">${renderFormIcon("winners")}</span>
          Админы
        </div>
        <div class="access-list">
          ${
            delegatedAdminRows ||
            `<div class="access-empty">
              <span class="draw-ico">${renderFormIcon("winners")}</span>
              <span>Делегированных админов пока нет</span>
            </div>`
          }
        </div>

        <form method="post" action="${PANEL_BASE}/admin/access" class="draw-form access-form">
          <div class="draw-block">
            <div class="draw-field">
              ${drawLabel("user", "Telegram")}
              <input class="draw-input" name="userRef" type="text" required placeholder="@username или 123456789" />
            </div>
          </div>
          <button type="submit" class="draw-submit">
            <span class="draw-ico">${renderFormIcon("confirm")}</span>
            Добавить админа
          </button>
        </form>
      </section>
      `
          : ""
      }

      </div>

      <div id="panelLiveRoot" data-version="${escapeHtml(panelLiveVersion)}">
        ${panelLiveHtml}
      </div>
    </div>
  </div>
  <script>
    ${getMiniAppInitScript({ authSession: true, previewShell: WEB_ONLY })}

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
          target.textContent = "✓";
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
      const prizeAmountInput = moneyFields?.querySelector('input[name="prizeAmount"]');
      if (!prizeType || !moneyFields || !customFields) return;

      function sync() {
        const isMoney = prizeType.value === "money_rub" || prizeType.value === "money_usd";
        moneyFields.style.display = isMoney ? "block" : "none";
        customFields.style.display = isMoney ? "none" : "block";
        if (prizeAmountInput) {
          prizeAmountInput.placeholder = prizeType.value === "money_usd" ? "500" : "50000";
        }
      }

      prizeType.addEventListener("change", sync);
      sync();
    }

    function setupPreventNumberWheel() {
      document.addEventListener(
        "wheel",
        (event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement && target.type === "number") {
            event.preventDefault();
          }
        },
        { passive: false, capture: true }
      );
    }

    function setupProfileLinks() {
      document.querySelectorAll(".winner-profile-btn").forEach((link) => {
        if (link.dataset.bound === "1") return;
        link.dataset.bound = "1";
        link.addEventListener("click", (event) => {
          const tg = window.Telegram?.WebApp;
          const href = link.getAttribute("href");
          if (!href || !tg?.openTelegramLink) return;
          event.preventDefault();
          tg.openTelegramLink(href);
        });
      });
    }

    function setupCopyButtons() {
      document.querySelectorAll(".winner-copy-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const text = btn.getAttribute("data-copy") || "";
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            btn.title = "Скопировано";
            setTimeout(() => {
              btn.title = "Копировать";
            }, 1500);
          } catch (error) {
            const area = document.createElement("textarea");
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            area.remove();
          }
        });
      });
    }

    function setupPublishEndToggles() {
      const publishMode = document.getElementById("publishMode");
      const publishAtWrap = document.getElementById("publishAtWrap");
      const endMode = document.getElementById("endMode");
      const endAfterWrap = document.getElementById("endAfterWrap");
      if (!publishMode || !publishAtWrap || !endMode || !endAfterWrap) return;

      function syncPublish() {
        publishAtWrap.classList.toggle("anim-collapse-open", publishMode.value === "scheduled");
      }

      function syncEnd() {
        endAfterWrap.classList.toggle("anim-collapse-open", endMode.value === "scheduled");
      }

      publishMode.addEventListener("change", syncPublish);
      endMode.addEventListener("change", syncEnd);
      syncPublish();
      syncEnd();
    }

    function setupSettingsPanel() {
      const addProjectBtn = document.getElementById("toggleAddProjectBtn");
      const addProjectWrap = document.getElementById("addProjectWrap");
      const addChannelBtn = document.getElementById("addChannelBtn");
      if (addProjectBtn && addProjectWrap) {
        addProjectBtn.addEventListener("click", () => {
          const willOpen = addProjectWrap.classList.contains("panel-hidden");
          addProjectWrap.classList.toggle("panel-hidden");
          addProjectBtn.classList.toggle("settings-action-active", willOpen);
          if (willOpen) {
            const nameInput = document.querySelector("#create-project-form [name='name']");
            if (nameInput) nameInput.focus();
          }
        });
      }
      if (addChannelBtn) {
        addChannelBtn.addEventListener("click", (event) => {
          const tg = window.Telegram?.WebApp;
          const href = addChannelBtn.getAttribute("href");
          if (!href || !tg?.openTelegramLink) return;
          event.preventDefault();
          tg.openTelegramLink(href);
        });
      }
      document.querySelectorAll(".channel-delete-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          const title = btn.dataset.channelTitle || "канал";
          if (!confirm("Удалить канал «" + title + "»?")) {
            event.preventDefault();
          }
        });
      });
    }

    function openProjectForm() {
      const addProjectWrap = document.getElementById("addProjectWrap");
      const addProjectBtn = document.getElementById("toggleAddProjectBtn");
      if (addProjectWrap) addProjectWrap.classList.remove("panel-hidden");
      if (addProjectBtn) addProjectBtn.classList.add("settings-action-active");
    }

    function setupAdminPanels() {
      const createBtn = document.getElementById("toggleCreateDrawBtn");
      const settingsBtn = document.getElementById("toggleSettingsBtn");
      const accessBtn = document.getElementById("toggleAccessBtn");
      const createPanel = document.getElementById("createDrawPanel");
      const settingsPanel = document.getElementById("settingsPanel");
      const accessPanel = document.getElementById("accessPanel");
      if (!createBtn || !settingsBtn || !createPanel || !settingsPanel) return;

      function getTabButtons() {
        return [createBtn, settingsBtn, accessBtn].filter(Boolean);
      }

      function setActiveTab(btn) {
        for (const item of getTabButtons()) {
          item.classList.remove("qa-active", "quick-action-primary");
        }
        if (btn) {
          btn.classList.add("qa-active", "quick-action-primary");
        }
      }

      function closeOtherPanels(exceptPanel) {
        const panels = [
          { panel: createPanel, btn: createBtn },
          { panel: settingsPanel, btn: settingsBtn },
        ];
        if (accessPanel && accessBtn) {
          panels.push({ panel: accessPanel, btn: accessBtn });
        }
        for (const item of panels) {
          if (item.panel === exceptPanel) continue;
          item.panel.classList.add("panel-hidden");
        }
      }

      function togglePanel(panel, btn) {
        const willOpen = panel.classList.contains("panel-hidden");
        panel.classList.toggle("panel-hidden");
        if (willOpen) {
          closeOtherPanels(panel);
          setActiveTab(btn);
        } else {
          setActiveTab(null);
        }
      }

      createBtn.addEventListener("click", () => togglePanel(createPanel, createBtn));
      settingsBtn.addEventListener("click", () => togglePanel(settingsPanel, settingsBtn));
      if (accessPanel && accessBtn) {
        accessBtn.addEventListener("click", () => togglePanel(accessPanel, accessBtn));
      }
    }

    function setupProjectFormEdit() {
      const form = document.getElementById("create-project-form");
      const cancelBtn = document.getElementById("project-edit-cancel");
      const submitLabel = document.getElementById("project-submit-label");
      const submitBtn = document.getElementById("project-submit-btn");
      const nameInput = form?.querySelector('[name="name"]');
      const refInput = form?.querySelector('[name="refLink"]');
      const logoInput = document.getElementById("project-logo-input");
      const clipboardInput = document.getElementById("project-clipboard-data");
      const pastePreview = document.getElementById("project-paste-preview");
      if (!form || !cancelBtn || !submitLabel || !nameInput || !refInput) return;

      function resetProjectForm() {
        form.action = "${PANEL_BASE}/projects";
        nameInput.value = "";
        refInput.value = "";
        if (logoInput) logoInput.value = "";
        if (clipboardInput) {
          clipboardInput.value = "";
          clipboardInput.removeAttribute("name");
        }
        if (pastePreview) {
          pastePreview.style.display = "none";
          pastePreview.removeAttribute("src");
        }
        cancelBtn.style.display = "none";
        submitLabel.textContent = "Добавить проект";
        if (submitBtn) {
          submitBtn.querySelector(".draw-ico").innerHTML = ${JSON.stringify(renderFormIcon("project"))};
        }
      }

      document.querySelectorAll(".project-edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const projectId = btn.dataset.projectId || "";
          if (!projectId) return;
          form.action = "${PANEL_BASE}/projects/" + encodeURIComponent(projectId) + "/update";
          nameInput.value = btn.dataset.projectName || "";
          refInput.value = btn.dataset.projectRef || "";
          if (logoInput) logoInput.value = "";
          if (clipboardInput) {
            clipboardInput.value = "";
            clipboardInput.removeAttribute("name");
          }
          if (pastePreview) {
            pastePreview.style.display = "none";
            pastePreview.removeAttribute("src");
          }
          cancelBtn.style.display = "";
          submitLabel.textContent = "Сохранить";
          if (submitBtn) {
            submitBtn.querySelector(".draw-ico").innerHTML = ${JSON.stringify(renderFormIcon("edit"))};
          }
          openProjectForm();
          form.scrollIntoView({ behavior: "smooth", block: "start" });
          nameInput.focus();
        });
      });

      document.querySelectorAll(".project-delete-btn:not(.draw-delete-btn)").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          const name = btn.dataset.projectName || "проект";
          if (!confirm("Удалить проект «" + name + "»?")) {
            event.preventDefault();
          }
        });
      });

      document.querySelectorAll(".draw-delete-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          const prize = btn.dataset.drawPrize || "розыгрыш";
          if (!confirm("Удалить розыгрыш «" + prize + "»?")) {
            event.preventDefault();
          }
        });
      });

      cancelBtn.addEventListener("click", resetProjectForm);
    }

    function setupFlashMessages() {
      document.querySelectorAll(".msg").forEach((el) => {
        window.setTimeout(() => {
          el.classList.add("msg-hide");
          const removeEl = () => el.remove();
          el.addEventListener("transitionend", removeEl, { once: true });
          window.setTimeout(removeEl, 800);
        }, 10000);
      });
    }

    function setupTelegramFormAuth() {
      const tg = window.Telegram?.WebApp;
      if (!tg?.initData) return;
      document.querySelectorAll("form").forEach((form) => {
        if (form.querySelector('input[name="telegramInitData"]')) return;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "telegramInitData";
        input.value = tg.initData;
        form.appendChild(input);
      });
    }

    function setupPanelAutoRefresh() {
      const root = document.getElementById("panelLiveRoot");
      if (!root) return;

      const pollMs = ${PANEL_POLL_MS};
      let timerId = null;

      function captureDetailsState() {
        return Array.from(root.querySelectorAll("details[data-details-key]"))
          .filter((el) => el.open)
          .map((el) => el.getAttribute("data-details-key"))
          .filter(Boolean);
      }

      function restoreDetailsState(openKeys) {
        openKeys.forEach((key) => {
          const el = root.querySelector('details[data-details-key="' + key + '"]');
          if (el) el.open = true;
        });
      }

      function shouldSkipPoll() {
        if (document.hidden) return true;
        if (document.querySelector("input:focus, select:focus, textarea:focus, [contenteditable=true]:focus")) {
          return true;
        }
        const createPanel = document.getElementById("createDrawPanel");
        const addProjectWrap = document.getElementById("addProjectWrap");
        if (createPanel && !createPanel.classList.contains("panel-hidden")) return true;
        if (addProjectWrap && !addProjectWrap.classList.contains("panel-hidden")) return true;
        return false;
      }

      async function pollPanelLive() {
        if (shouldSkipPoll()) return;
        try {
          const tg = window.Telegram?.WebApp;
          const headers = { Accept: "application/json" };
          if (tg?.initData) {
            headers["X-Telegram-Init-Data"] = tg.initData;
          }
          const response = await fetch("${PANEL_BASE}/live", {
            credentials: "same-origin",
            headers,
          });
          if (!response.ok) return;
          const data = await response.json();
          if (!data?.html || data.version === root.dataset.version) return;

          const scrollY = window.scrollY;
          const openDetails = captureDetailsState();
          root.innerHTML = data.html;
          root.dataset.version = data.version;
          restoreDetailsState(openDetails);
          window.scrollTo(0, scrollY);
          setupCopyButtons();
          setupProfileLinks();
        } catch (error) {
          // ignore transient network errors
        }
      }

      function schedulePoll() {
        if (timerId) window.clearInterval(timerId);
        timerId = window.setInterval(pollPanelLive, pollMs);
      }

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          pollPanelLive();
        }
      });

      schedulePoll();
      window.setTimeout(pollPanelLive, 1500);
    }

    function setupAccessDeleteButtons() {
      document.querySelectorAll(".access-delete-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          const name = btn.dataset.accessName || "админа";
          if (!confirm("Удалить доступ у «" + name + "»?")) {
            event.preventDefault();
          }
        });
      });
    }

    setupPasteImage("draw-paste-target", "draw-clipboard-data", "draw-paste-preview");
    setupPasteImage("project-paste-target", "project-clipboard-data", "project-paste-preview");
    setupClipboardSubmit("create-draw-form", "draw-clipboard-data", "draw-image-input", "pasted-draw");
    setupClipboardSubmit("create-project-form", "project-clipboard-data", "project-logo-input", "pasted-logo");
    setupProjectFormEdit();
    setupAccessDeleteButtons();
    setupPrizeTypeToggle();
    setupPreventNumberWheel();
    setupCopyButtons();
    setupProfileLinks();
    setupPublishEndToggles();
    setupSettingsPanel();
    setupAdminPanels();
    setupPanelAutoRefresh();
    setupFlashMessages();
    setupTelegramFormAuth();
  </script>
</body>
</html>`;
}

function requireOrganizer(req, res, next) {
  if (!req.webUser?.id || !isOrganizer(req.webUser.id)) {
    if (req.method === "GET") {
      res.status(403).type("html").send(renderOrganizerGatePage(BOT_USERNAME));
      return;
    }
    redirectWithMessage(res, "Доступ только для организаторов каналов.");
    return;
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.webUser?.id || !isSuperAdmin(req.webUser.id)) {
    redirectWithMessage(res, "Доступ только для суперадмина.");
    return;
  }
  next();
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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(webAuth.attachUser);
app.get("/brand/logo.jpg", (req, res) => {
  if (!fs.existsSync(BRAND_LOGO_FILE)) {
    res.status(404).end();
    return;
  }
  res.sendFile(BRAND_LOGO_FILE);
});
app.get("/brand/background.jpg", (req, res) => {
  if (!fs.existsSync(BRAND_BACKGROUND_FILE)) {
    res.status(404).end();
    return;
  }
  res.sendFile(BRAND_BACKGROUND_FILE);
});
app.get("/brand/background-dark.png", (req, res) => {
  if (!fs.existsSync(BRAND_BACKGROUND_DARK_FILE)) {
    res.status(404).end();
    return;
  }
  res.sendFile(BRAND_BACKGROUND_DARK_FILE);
});
const panelRouter = express.Router();

panelRouter.use("/uploads", webAuth.requireAuth, requireOrganizer, express.static(UPLOADS_DIR));

app.post("/auth/session", (req, res) => {
  const user = validateInitData(req.body?.initData, BOT_TOKEN);
  if (!user?.id) {
    res.status(401).json({ ok: false });
    return;
  }
  webAuth.setSessionCookie(res, user.id);
  res.json({
    ok: true,
    userId: user.id,
    organizer: isOrganizer(user.id),
    platformAdmin: isPlatformAdmin(user.id),
    superAdmin: isSuperAdmin(user.id),
  });
});

registerJoinMiniApp(app, {
  validateInitData,
  BOT_TOKEN,
  readData,
  readProjects,
  getProjectById,
  DRAW_STATUS,
  joinSessions,
  getUserProjectProfile,
  setUserProjectProfile,
  upsertUserMeta,
  addUserToDraw,
  ASSETS_DIR,
  BOT_USERNAME,
  designPreview: WEB_ONLY,
  RECAPTCHA_SITE_KEY,
  RECAPTCHA_SECRET_KEY,
});

registerWinnersMiniApp(app, {
  readData,
  DRAW_STATUS,
  readUserProjectProfiles,
  getUserProfileBundle,
  getWinnerDisplayName,
  getWinnerPayoutText,
  getTelegramUserProfileUrl,
  bot: WEB_ONLY ? null : bot,
  designPreview: WEB_ONLY,
});

app.get("/", (_req, res) => {
  res.type("html").send(renderLandingPage());
});

function renderPanelForUser(res, webUser, message) {
  if (!isOrganizer(webUser.id)) {
    res.type("html").send(renderOrganizerGatePage(BOT_USERNAME));
    return;
  }
  const draws = getOwnerDraws(webUser.id);
  res.type("html").send(renderWebPage(draws, message, webUser));
}

function sendPanelAuthPage(res, message) {
  res.status(200).type("html").send(renderLoginPage(BOT_USERNAME, WEB_PUBLIC_URL, PANEL_BASE));
}

panelRouter.get("/", (req, res) => {
  const user = webAuth.resolveUser(req);
  if (!user?.id) {
    sendPanelAuthPage(res);
    return;
  }

  const initData =
    req.headers["x-telegram-init-data"] ||
    req.body?.initData ||
    req.body?.telegramInitData ||
    req.query?.telegramInitData;
  if (initData && validateInitData(initData, BOT_TOKEN)) {
    webAuth.setSessionCookie(res, user.id);
  }

  if (req.query.telegramInitData) {
    const params = new URLSearchParams();
    if (req.query.msg) {
      params.set("msg", String(req.query.msg));
    }
    const qs = params.toString();
    res.redirect(303, `${PANEL_BASE}${qs ? `?${qs}` : ""}`);
    return;
  }

  req.webUser = user;
  renderPanelForUser(res, user, req.query.msg);
});

panelRouter.post("/enter", (req, res) => {
  const initData = req.body?.initData || req.body?.telegramInitData;
  const tgUser = validateInitData(initData, BOT_TOKEN);
  if (!tgUser?.id) {
    sendPanelAuthPage(res);
    return;
  }

  webAuth.setSessionCookie(res, tgUser.id);
  req.webUser = { id: tgUser.id, user: tgUser };
  renderPanelForUser(res, req.webUser, req.body?.msg || req.query?.msg);
});

panelRouter.get("/live", webAuth.requireAuth, requireOrganizer, (req, res) => {
  const ownerId = req.webUser.id;
  const draws = getOwnerDraws(ownerId);
  const userProfiles = readUserProjectProfiles();
  const projects = filterByOwner(readProjects().projects || [], ownerId);
  res.json({
    version: buildPanelLiveFingerprint(draws, userProfiles),
    html: renderPanelLiveHtml(draws, projects, userProfiles),
  });
});

panelRouter.post("/admin/access", webAuth.requireAuth, requireOrganizer, requireSuperAdmin, async (req, res) => {
  const resolved = await resolveTelegramUser(req.body?.userRef || req.body?.userId);
  if (!resolved.ok) {
    redirectWithMessage(res, resolved.error);
    return;
  }
  const result = addDelegatedAdmin(resolved.user, req.body?.label, req.webUser.id);
  if (!result.ok) {
    redirectWithMessage(res, result.error);
    return;
  }
  await enrichUserAvatar(resolved.user.id);
  await syncOrganizerPanelUi(resolved.user.id);
  try {
    await bot.telegram.sendMessage(
      resolved.user.id,
      [
        "✅ Вам открыли доступ к панели RollerBot.",
        "",
        "Нажмите «📱 Панель» под полем ввода или отправьте /panel.",
        "Открывать нужно именно из Telegram — не через браузер.",
      ].join("\n"),
      getPanelKeyboardForUser(resolved.user.id),
    );
  } catch (error) {
    console.warn(`Не удалось уведомить нового админа ${resolved.user.id}:`, error.message);
  }
  const display =
    resolved.user.username
      ? `@${resolved.user.username}`
      : [resolved.user.first_name, resolved.user.last_name].filter(Boolean).join(" ").trim() ||
        String(resolved.user.id);
  redirectWithMessage(res, `Админ ${display} добавлен.`);
});

panelRouter.post(
  "/admin/access/:userId/remove",
  webAuth.requireAuth,
  requireOrganizer,
  requireSuperAdmin,
  (req, res) => {
    const result = removeDelegatedAdmin(req.params.userId);
    if (!result.ok) {
      redirectWithMessage(res, result.error);
      return;
    }
    syncOrganizerPanelUi(Number(req.params.userId)).catch(() => {});
    redirectWithMessage(res, `Админ ${req.params.userId} удалён из списка.`);
  },
);

panelRouter.get("/qr", webAuth.requireAuth, requireOrganizer, async (req, res) => {
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

panelRouter.get("/avatar/:userId", webAuth.requireAuth, requireOrganizer, async (req, res) => {
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

panelRouter.get("/channel-photo/:channelId", webAuth.requireAuth, requireOrganizer, async (req, res) => {
  const channel = findOwnedKnownChannel(req.params.channelId, req.webUser.id);
  if (!channel) {
    res.status(404).end();
    return;
  }

  let fileId = channel.photoFileId || "";
  if (!fileId) {
    try {
      const chat = await bot.telegram.getChat(channel.username ? `@${channel.username}` : channel.id);
      fileId = chat.photo?.small_file_id || "";
      if (fileId) {
        const data = readKnownChannels();
        const stored = data.channels.find((item) => item.id === channel.id);
        if (stored) {
          stored.photoFileId = fileId;
          writeKnownChannels(data);
        }
      }
    } catch {
      res.status(404).end();
      return;
    }
  }

  if (!fileId) {
    res.status(404).end();
    return;
  }

  try {
    const url = await bot.telegram.getFileLink(fileId);
    res.redirect(String(url));
  } catch {
    res.status(404).end();
  }
});

function deleteProjectLogoFile(logoPath) {
  if (!logoPath) return;
  try {
    const resolved = path.isAbsolute(logoPath) ? logoPath : path.join(UPLOADS_DIR, path.basename(logoPath));
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch {
    // ignore cleanup errors
  }
}

function parseProjectFormBody(req) {
  const body = req.body || {};
  const name = (body.name || "").trim();
  const refLink = (body.refLink || "").trim();
  const logoClipboardData = (body.logoClipboardData || "").trim();
  return { name, refLink, logoClipboardData };
}

function resolveProjectLogoUpload(req, logoClipboardData, previousLogoPath = "") {
  let logoPath = req.file ? req.file.path : "";
  if (!logoPath && logoClipboardData) {
    logoPath = saveClipboardImage(logoClipboardData, "project_logo");
  }
  if (logoPath && previousLogoPath && logoPath !== previousLogoPath) {
    deleteProjectLogoFile(previousLogoPath);
  }
  return logoPath || previousLogoPath;
}

panelRouter.post("/projects", webAuth.requireAuth, requireOrganizer, upload.single("logo"), (req, res) => {
  const ownerId = req.webUser.id;
  const { name, refLink, logoClipboardData } = parseProjectFormBody(req);

  if (!name || !refLink) {
    redirectWithMessage(res, "Укажите название проекта и реф-ссылку.");
    return;
  }

  const logoPath = resolveProjectLogoUpload(req, logoClipboardData);

  const projectsData = readProjects();
  projectsData.projects.push({
    id: createProjectId(),
    name,
    refLink,
    logoPath,
    ownerId,
    createdAt: new Date().toISOString(),
  });
  writeProjects(projectsData);

  redirectWithMessage(res, "Проект добавлен.");
});

panelRouter.post("/projects/:projectId/update", webAuth.requireAuth, requireOrganizer, upload.single("logo"), (req, res) => {
  const ownerId = req.webUser.id;
  const projectId = (req.params.projectId || "").trim();
  const project = getProjectById(projectId, ownerId);
  if (!project) {
    redirectWithMessage(res, "Проект не найден.");
    return;
  }

  const { name, refLink, logoClipboardData } = parseProjectFormBody(req);
  if (!name || !refLink) {
    redirectWithMessage(res, "Укажите название проекта и реф-ссылку.");
    return;
  }

  const projectsData = readProjects();
  const index = projectsData.projects.findIndex((item) => item.id === projectId);
  if (index < 0) {
    redirectWithMessage(res, "Проект не найден.");
    return;
  }

  const logoPath = resolveProjectLogoUpload(req, logoClipboardData, project.logoPath || "");
  projectsData.projects[index] = {
    ...projectsData.projects[index],
    name,
    refLink,
    logoPath,
  };
  writeProjects(projectsData);
  redirectWithMessage(res, "Проект обновлён.");
});

panelRouter.post("/projects/:projectId/delete", webAuth.requireAuth, requireOrganizer, (req, res) => {
  const ownerId = req.webUser.id;
  const projectId = (req.params.projectId || "").trim();
  const project = getProjectById(projectId, ownerId);
  if (!project) {
    redirectWithMessage(res, "Проект не найден.");
    return;
  }

  const projectsData = readProjects();
  projectsData.projects = projectsData.projects.filter((item) => item.id !== projectId);
  writeProjects(projectsData);
  deleteProjectLogoFile(project.logoPath);
  redirectWithMessage(res, "Проект удалён.");
});

panelRouter.post("/channels/:channelId/delete", webAuth.requireAuth, requireOrganizer, (req, res) => {
  const result = removeKnownChannel(req.params.channelId, req.webUser.id);
  if (!result.ok) {
    redirectWithMessage(res, result.error);
    return;
  }
  const title = result.channel?.title || result.channel?.username || "Канал";
  redirectWithMessage(res, `Канал «${title}» удалён.`);
});

panelRouter.post("/draws", webAuth.requireAuth, requireOrganizer, upload.single("image"), async (req, res) => {
  try {
    const ownerId = req.webUser.id;
    const body = req.body || {};
    const selectedChannelId = (body.knownChannelId || "").trim();
    const channelId = selectedChannelId;
    const projectId = (body.projectId || "").trim();
    const prizeTypeRaw = body.prizeType || "money_rub";
    const prizeType =
      prizeTypeRaw === "custom" ? "custom" : prizeTypeRaw === "money_usd" ? "money_usd" : "money_rub";
    const prizeAmountRaw = String(body.prizeAmount || body.prizeAmountRub || "").replace(/\s+/g, "");
    const prizeAmount = Number(prizeAmountRaw);
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
      if (!Number.isFinite(prizeAmount) || prizeAmount <= 0) {
        redirectWithMessage(res, "Для денежного приза укажите корректную сумму в рублях.");
        return;
      }
      prize = formatRubAmount(prizeAmount);
    } else if (prizeType === "money_usd") {
      if (!Number.isFinite(prizeAmount) || prizeAmount <= 0) {
        redirectWithMessage(res, "Для денежного приза укажите корректную сумму в долларах.");
        return;
      }
      prize = formatUsdAmount(prizeAmount);
    } else {
      if (!prizeCustomText) {
        redirectWithMessage(res, "Для типа приза «Другое» укажите описание.");
        return;
      }
      prize = prizeCustomText;
    }

    if (!channelId || !projectId) {
      redirectWithMessage(res, "Выберите проект и канал. Каналы добавляются в Настройках.");
      return;
    }

    if (!findOwnedKnownChannel(channelId, ownerId)) {
      redirectWithMessage(res, "Выберите канал из списка «Мои каналы» или добавьте его в Настройках.");
      return;
    }

    if (!getProjectById(projectId, ownerId)) {
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
      upsertKnownChannel(chat, ownerId);
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
      prizeAmountRub: prizeType === "money_rub" ? Math.floor(prizeAmount) : null,
      prizeAmountUsd: prizeType === "money_usd" ? Math.floor(prizeAmount) : null,
      imagePath: drawImagePath,
      publishAt: publishAtISO,
      endAt: endAtISO,
      endAfterValue: normalizedEndAfterValue,
      endAfterUnit: normalizedEndAfterUnit,
      winnersCount,
      ownerId,
      createdBy: ownerId,
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

panelRouter.post("/draws/:id/publish-now", webAuth.requireAuth, requireOrganizer, async (req, res) => {
  const data = readData();
  const draw = findOwnedDrawInData(data, req.params.id, req.webUser.id);

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

panelRouter.post("/draws/:id/finish-now", webAuth.requireAuth, requireOrganizer, async (req, res) => {
  const data = readData();
  const draw = findOwnedDrawInData(data, req.params.id, req.webUser.id);

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

panelRouter.post("/draws/:id/delete", webAuth.requireAuth, requireOrganizer, async (req, res) => {
  const data = readData();
  const draw = findOwnedDrawInData(data, req.params.id, req.webUser.id);

  if (!draw) {
    redirectWithMessage(res, "Розыгрыш не найден.");
    return;
  }

  if (draw.status === DRAW_STATUS.ACTIVE) {
    redirectWithMessage(res, "Нельзя удалить активный розыгрыш. Сначала завершите его.");
    return;
  }

  if (draw.messageId && draw.channelId) {
    await safeDeleteMessage(draw.channelId, draw.messageId);
  }

  if (draw.imagePath && fs.existsSync(draw.imagePath)) {
    try {
      fs.unlinkSync(draw.imagePath);
    } catch (error) {
      console.warn("Не удалось удалить файл обложки розыгрыша:", error.message);
    }
  }

  data.draws = data.draws.filter((item) => item.id !== draw.id);
  writeData(data);
  redirectWithMessage(res, "Розыгрыш удалён.");
});

panelRouter.post("/draws/:id/notify/:userId", webAuth.requireAuth, requireOrganizer, async (req, res) => {
  const drawId = req.params.id;
  const userId = Number(req.params.userId);
  const ownerId = req.webUser.id;

  if (!Number.isInteger(userId)) {
    redirectWithMessage(res, "Некорректный userId победителя.");
    return;
  }

  const data = readData();
  const draw = findOwnedDrawInData(data, drawId, ownerId);
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
    await sendWinnerVerificationNotification(draw, userId, ownerId);
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

panelRouter.post("/draws/:id/pay/:userId", webAuth.requireAuth, requireOrganizer, async (req, res) => {
  const drawId = req.params.id;
  const userId = Number(req.params.userId);
  const ownerId = req.webUser.id;

  if (!Number.isInteger(userId)) {
    redirectWithMessage(res, "Некорректный userId победителя.");
    return;
  }

  const data = readData();
  const draw = findOwnedDrawInData(data, drawId, ownerId);
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
  draw.winnerNotifications[String(userId)].paidBy = ownerId;
  writeData(data);

  redirectWithMessage(res, `Победителю ${userId} отмечена выплата.`);
});

app.use(PANEL_BASE, panelRouter);

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
    upsertKnownChannel(payload.chat, payload.from?.id);
  }
});

bot.use(async (ctx, next) => {
  if (ctx.from?.id && ctx.chat?.type === "private") {
    upsertUserMeta(ctx.from);
  }
  await next();
});

bot.on("channel_post", async (ctx) => {
  if (ctx.chat?.type !== "channel") {
    return;
  }
  const known = findKnownChannel(String(ctx.chat.id));
  if (known) {
    upsertKnownChannel(ctx.chat);
  }
});

bot.command("link_channel", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Откройте личный чат с ботом и отправьте /link_channel");
    return;
  }

  await ctx.reply(
    [
      "🔗 Подключение канала",
      "",
      "1. Добавьте бота админом в канал",
      "2. Перешлите сюда любое сообщение из этого канала",
      "",
      "Канал появится в панели — вводить ID вручную не нужно.",
    ].join("\n"),
    getPanelKeyboardForUser(ctx.from?.id),
  );
  await syncOrganizerPanelUi(ctx.from?.id);
});

bot.on("message", async (ctx, next) => {
  const msg = ctx.message;
  const forwardedChat = msg?.forward_from_chat;
  if (ctx.chat?.type !== "private" || !forwardedChat || forwardedChat.type !== "channel") {
    return next();
  }

  const result = await linkChannelForUser(ctx, forwardedChat);
  await ctx.reply(result.message, getPanelKeyboardForUser(ctx.from?.id));
  await syncOrganizerPanelUi(ctx.from?.id);
});

bot.start(async (ctx) => {
  const payload = parseStartPayload(ctx);
  if (payload.startsWith("join_")) {
    const drawId = payload.replace(/^join_/, "");
    await startJoinFlow(ctx, drawId);
    return;
  }

  if (payload.startsWith("winners_")) {
    const drawId = payload.replace(/^winners_/, "");
    await startWinnersFlow(ctx, drawId);
    return;
  }

  if (payload === "panel") {
    if (!isOrganizer(ctx.from?.id)) {
      await ctx.reply("Панель доступна только организаторам розыгрышей.");
      return;
    }
    await syncOrganizerPanelUi(ctx.from.id);
    await ctx.reply("Нажмите кнопку «📱 Панель» ниже 👇", getPanelKeyboardForUser(ctx.from.id));
    return;
  }

  if (payload === "link_channel") {
    await ctx.reply(
      [
        "🔗 Подключение канала",
        "",
        "1. Добавьте бота админом в канал",
        "2. Перешлите сюда любое сообщение из этого канала",
        "",
        "Канал появится в панели: Настройки → Мои каналы.",
      ].join("\n"),
      getPanelKeyboardForUser(ctx.from?.id),
    );
    await syncOrganizerPanelUi(ctx.from?.id);
    return;
  }

  const userId = ctx.from?.id;
  if (isOrganizer(userId)) {
    await ctx.reply(
      [
        "🎁 Roller Bot — розыгрыши в Telegram-каналах",
        "",
        "1. Добавьте бота админом в свой канал",
        "2. Перешлите любой пост из канала боту (/link_channel)",
        "3. Нажмите «Панель» и создайте розыгрыш",
        "",
        "Участникам: кнопка «Участвовать» в посте канала.",
      ].join("\n"),
      getPanelKeyboardForUser(userId),
    );
    await syncOrganizerPanelUi(userId);
    return;
  }

  await ctx.reply(
    [
      "🎁 Roller Bot — розыгрыши в Telegram-каналах",
      "",
      "Участвуйте в розыгрышах через кнопку «Участвовать» в постах каналов.",
    ].join("\n"),
    getPanelKeyboardForUser(userId),
  );
});

bot.command("panel", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Откройте личный чат с ботом и отправьте /panel");
    return;
  }
  if (!isOrganizer(ctx.from?.id)) {
    await ctx.reply("Панель доступна только организаторам розыгрышей.");
    return;
  }
  await syncOrganizerPanelUi(ctx.from.id);
  await ctx.reply("Нажмите кнопку «Панель» ниже 👇", getPanelKeyboardForUser(ctx.from.id));
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
  const channels = filterByOwner(readKnownChannels().channels || [], ctx.from.id);
  if (channels.length === 0) {
    await ctx.reply(
      [
        "Пока нет подключенных каналов.",
        "",
        "1. Добавьте бота админом в канал",
        "2. Перешлите любой пост из канала сюда",
        "",
        "Или отправьте /link_channel для инструкции.",
      ].join("\n"),
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
  const data = readData();
  const myDraws = filterByOwner(data.draws, ctx.from.id)
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

  const autoJoin = await tryAutoJoinDraw(draw, ctx.from.id);
  if (autoJoin.joined) {
    await ctx.answerCbQuery(autoJoin.message || "Вы участвуете ✅", { show_alert: true });
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

bot.action(/^winners:(.+)$/, async (ctx) => {
  const drawId = ctx.match[1];
  const url = getWinnersChannelUrl(drawId);
  if (WEB_PUBLIC_URL.startsWith("https://") && url.startsWith("https://")) {
    await ctx.answerCbQuery({ url });
    return;
  }
  await ctx.answerCbQuery();
  await startWinnersFlow(ctx, drawId);
});

bot.action("draw_finished", async (ctx) => {
  await ctx.answerCbQuery("Нажмите кнопку «завершен» в посте — она откроет список победителей.");
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
  const userId = ctx.from.id;
  const sessionKey = winnerVerificationSessionKey(userId, drawId);

  try {
    const data = readData();
    const draw = data.draws.find((item) => item.id === drawId);
    if (!draw) {
      winnerVerificationSessions.delete(sessionKey);
      await ctx.answerCbQuery("Розыгрыш не найден.");
      return;
    }

    const notify = draw.winnerNotifications?.[String(userId)];
    if (!notify || notify.status === "expired") {
      await ctx.answerCbQuery("Сессия проверки устарела.");
      return;
    }

    if (notify.verifiedAt || notify.status === "confirmed") {
      await ctx.answerCbQuery("Вы уже прошли проверку ✅");
      return;
    }

    const expiresAtISO = notify.expiresAt;
    const isExpired = expiresAtISO
      ? DateTime.fromISO(expiresAtISO, { zone: TIMEZONE }) < DateTime.now().setZone(TIMEZONE)
      : false;
    if (isExpired) {
      await markWinnerNotificationExpired(draw, userId);
      writeData(data);
      await ctx.answerCbQuery("Время подтверждения истекло.");
      return;
    }

    const memorySession = winnerVerificationSessions.get(sessionKey);
    const correctAnswer = notify.captchaAnswer ?? memorySession?.correct;
    if (correctAnswer == null) {
      await ctx.answerCbQuery("Сессия проверки устарела. Попросите организатора отправить уведомление снова.");
      return;
    }

    if (selected !== correctAnswer) {
      await ctx.answerCbQuery("Неверно, попробуйте еще раз.");
      return;
    }

    winnerVerificationSessions.delete(sessionKey);
    notify.verifiedAt = new Date().toISOString();
    notify.status = "confirmed";
    writeData(data);

    await ctx.answerCbQuery("Проверка пройдена ✅");
    await ctx.reply("✅ Успешно! Ожидайте выплаты приза!");
  } catch (error) {
    console.error("Ошибка проверки победителя:", error);
    try {
      await ctx.answerCbQuery("Не удалось обработать ответ. Попробуйте ещё раз.");
    } catch {
      // ignore secondary callback errors
    }
  }
});

bot.catch((error) => {
  console.error("Ошибка бота:", error);
});

if (!WEB_ONLY) {
  setInterval(async () => {
    await schedulerTick();
  }, CHECK_INTERVAL_MS);
}

function printDesignPreviewUrls() {
  const base = `http://localhost:${WEB_PORT}`;
  console.log("");
  console.log("Режим WEB_ONLY — только веб для дизайна (бот не запущен).");
  console.log(`  Сайт:          ${base}/`);
  console.log(`  Панель:        ${base}${PANEL_BASE}`);
  console.log(`  Join Mini App: ${base}/dev/preview/join`);
  console.log(`  Winners:       ${base}/dev/preview/winners`);
  console.log(`  Gate:          ${base}/dev/preview/gate`);
  console.log("");
}

async function bootstrap() {
  ensureStorage();
  migrateLegacyOwnership();
  await ensureBotUsername();

  if (WEB_ONLY) {
    app.listen(WEB_PORT, "0.0.0.0", () => {
      printDesignPreviewUrls();
    });
    return;
  }

  if (WEB_PUBLIC_URL.startsWith("https://")) {
    try {
      await bot.telegram.setChatMenuButton({ menu_button: { type: "default" } });
    } catch (error) {
      console.warn("Не удалось сбросить Menu Button:", error.message);
    }
  }

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

if (!WEB_ONLY) {
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
