const {
  getMiniAppStyles,
  getMiniAppInitScript,
  getMiniAppViewportMeta,
  getMiniAppHeadScript,
  getMiniAppFontLinks,
  getPreviewDevStyles,
  renderThemeToggleButton,
} = require("./miniapp-ui");
const { getAvatarFallbackStyle } = require("./avatar-fallback");
const { getReferralInviteCount } = require("./join-referrals");

const LEVEL_ICON = "🔥";
const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`;
const TG_PROFILE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M18 8l2-2"/><path d="M21 6h-3"/><path d="M21 6v3"/></svg>`;
const STAT_ICONS = {
  participations: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  wins: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M17 4v3a5 5 0 0 1-10 0V4"/></svg>`,
  boosts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>`,
  registered: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PROFILE_MONTHS_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function formatProfileRegistrationDate(iso) {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const day = date.getDate();
  const monthName = PROFILE_MONTHS_RU[date.getMonth()] || "";
  const year = date.getFullYear();
  return `${day} ${monthName} ${year} г.`;
}

function computeUserLevel(participationCount) {
  const count = Math.max(0, Number(participationCount) || 0);
  return Math.max(1, 1 + Math.floor(count / 3));
}

function computeUserWinningsSummary(draws, userId, deps) {
  if (!deps?.getWinnerPayoutAmount || !deps?.isMoneyPrizeType) {
    return { rubFormatted: "", extraText: "" };
  }
  const key = String(userId);
  const userProfiles = deps.readUserProjectProfiles();
  let totalRub = 0;
  const otherPrizes = [];

  for (const draw of draws || []) {
    if (deps.DRAW_STATUS && draw.status !== deps.DRAW_STATUS.FINISHED) {
      continue;
    }
    const winnerIds = (draw.winnerIds || []).map((id) => String(id));
    if (!winnerIds.includes(key)) {
      continue;
    }

    if (deps.isMoneyPrizeType(draw.prizeType)) {
      const { projectData } = deps.getUserProfileBundle(userProfiles, userId, draw.projectId);
      const fraud = deps.getWinnerAntiFraud
        ? deps.getWinnerAntiFraud(draw, userId, userProfiles)
        : { hasFraudFlag: false };
      const amount = deps.getWinnerPayoutAmount(draw, projectData, {
        hasFraudFlag: fraud.hasFraudFlag,
      });
      if (draw.prizeType === "money_usd" && deps.convertUsdToRub) {
        totalRub += deps.convertUsdToRub(amount);
      } else {
        totalRub += amount;
      }
    } else if (draw.prize) {
      otherPrizes.push(String(draw.prize).trim());
    }
  }

  const rubFormatted = totalRub > 0 && deps.formatRubAmount ? deps.formatRubAmount(totalRub) : "";
  const extraText = otherPrizes.length ? [...new Set(otherPrizes)].join(", ") : "";
  return { rubFormatted, extraText };
}

function computeUserGiveawayStats(draws, userId, deps = null) {
  const key = String(userId);
  let participations = 0;
  let wins = 0;
  let boosts = 0;
  let firstParticipationAt = null;

  for (const draw of draws || []) {
    const participantIds = (draw.participantIds || []).map((id) => String(id));
    if (participantIds.includes(key)) {
      participations += 1;
      const joinedAt = draw.participantMeta?.[key]?.updatedAt;
      if (joinedAt && (!firstParticipationAt || joinedAt < firstParticipationAt)) {
        firstParticipationAt = joinedAt;
      }
    }
    const winnerIds = (draw.winnerIds || []).map((id) => String(id));
    if (winnerIds.includes(key)) {
      wins += 1;
    }
    boosts += getReferralInviteCount(draw, userId);
  }

  const winnings = deps ? computeUserWinningsSummary(draws, userId, deps) : { rubFormatted: "", extraText: "" };
  const winningsParenParts = [winnings.rubFormatted, winnings.extraText].filter(Boolean);
  const winningsParen = winningsParenParts.length ? winningsParenParts.join(" + ") : "";

  return {
    participations,
    wins,
    winningsParen,
    boosts,
    level: computeUserLevel(participations),
    firstParticipationAt,
  };
}

function getTelegramProfileUrl(userId, username) {
  const cleanUsername = String(username || "").replace(/^@/, "").trim();
  if (cleanUsername) {
    return `https://t.me/${encodeURIComponent(cleanUsername)}`;
  }
  return `tg://user?id=${userId}`;
}

function buildParticipantProfileUrl(userId, backUrl = "") {
  const base = `/user/${encodeURIComponent(String(userId))}`;
  if (!backUrl) {
    return base;
  }
  return `${base}?back=${encodeURIComponent(backUrl)}`;
}

function isInternalMiniAppHref(href) {
  const value = String(href || "").trim();
  if (!value) {
    return false;
  }
  if (value.startsWith("/")) {
    return true;
  }
  try {
    const pathname = new URL(value).pathname;
    return /^\/(user|winners|join|panel|dev\/preview)(\/|$)/.test(pathname);
  } catch {
    return false;
  }
}

function isTelegramMessengerHref(href) {
  const value = String(href || "").trim();
  return value.startsWith("tg://") || /^https:\/\/t\.me\//i.test(value);
}

function getMiniAppProfileNavigateScript() {
  return `
function navigateMiniAppProfileUrl(href) {
  var url = String(href || "").trim();
  if (!url) return;
  var tg = window.Telegram && window.Telegram.WebApp;
  var isInternal = url.charAt(0) === "/" || /\\/user\\//.test(url) || /\\/winners\\//.test(url) || /\\/join\\//.test(url) || /\\/panel/.test(url);
  if (isInternal) {
    location.href = url;
    return;
  }
  if ((url.indexOf("tg://") === 0 || /^https:\\/\\/t\\.me\\//i.test(url)) && tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }
  if (tg && tg.openLink) {
    tg.openLink(url);
    return;
  }
  location.href = url;
}
`.trim();
}

function buildParticipantProfileViewModel(userId, deps, options = {}) {
  const data = deps.readData();
  const userProfiles = deps.readUserProjectProfiles();
  const { meta } = deps.getUserProfileBundle(userProfiles, userId, null);
  const displayName = deps.getWinnerDisplayName(meta, userId);
  const username = meta.username ? `@${meta.username}` : "";
  const initial = (displayName.replace(/^@/, "") || String(userId)).charAt(0).toUpperCase() || "?";
  const avatarUrl = meta.avatarFileId ? `/winners/avatar/${encodeURIComponent(String(userId))}` : "";
  const stats = computeUserGiveawayStats(data.draws || [], userId, deps);
  const registeredAt = meta.firstSeenAt || meta.updatedAt || stats.firstParticipationAt;
  const telegramProfileUrl = getTelegramProfileUrl(userId, meta.username);

  return {
    id: String(userId),
    displayName,
    username,
    usernameLine: meta.username ? `@${meta.username}` : "",
    initial,
    avatarUrl,
    fallbackStyle: avatarUrl ? "" : getAvatarFallbackStyle(userId),
    telegramProfileUrl,
    profileUrl: buildParticipantProfileUrl(userId, options.backUrl || ""),
    level: stats.level,
    participations: stats.participations,
    wins: stats.wins,
    winningsParen: stats.winningsParen,
    boosts: stats.boosts,
    registeredAt: formatProfileRegistrationDate(registeredAt),
    registeredAtIso: registeredAt || null,
  };
}

function getParticipantProfileStyles() {
  return `
    body.profile-page.mini-app-shell {
      margin: 0;
      max-width: 100%;
      width: 100%;
      box-sizing: border-box;
      overflow-x: clip;
      --profile-fs-name: clamp(18px, 5.4vw, 22px);
      --profile-fs-level: clamp(12px, 3.4vw, 14px);
      --profile-fs-stat: clamp(15px, 4.5vw, 22px);
      --profile-fs-stat-date: clamp(12px, 3.5vw, 16px);
      --profile-pad-x: max(16px, var(--mini-pad-x, 12px));
      padding: var(--mini-pad-top) 0 var(--mini-pad-bottom);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body.profile-page .profile-shell {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      padding-left: max(var(--profile-pad-x), env(safe-area-inset-left, 0px));
      padding-right: max(var(--profile-pad-x), env(safe-area-inset-right, 0px));
    }

    body.profile-page .profile-toolbar {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    body.profile-page .profile-back-btn {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 12px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 10%, transparent);
      color: var(--tg-theme-text-color, #151a2d);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    body.profile-page .profile-back-btn svg {
      width: 20px;
      height: 20px;
    }
    body.profile-page .profile-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 8px 0 18px;
    }
    body.profile-page .profile-avatar {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      overflow: hidden;
      position: relative;
      margin-bottom: 12px;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, #e8ecf8);
    }
    body.profile-page .profile-avatar img,
    body.profile-page .profile-avatar-fallback {
      width: 100%;
      height: 100%;
      display: block;
    }
    body.profile-page .profile-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: clamp(28px, 8vw, 36px);
      font-weight: 800;
      color: #fff;
    }
    body.profile-page .profile-name-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      max-width: 100%;
      margin-bottom: 4px;
      padding: 0 4px;
      box-sizing: border-box;
    }
    body.profile-page .profile-name {
      margin: 0;
      min-width: 0;
      flex: 0 1 auto;
      max-width: calc(100% - 44px);
      font-size: var(--profile-fs-name);
      font-weight: 800;
      line-height: 1.2;
      color: var(--tg-theme-text-color, #151a2d);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body.profile-page .profile-tg-btn {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      color: var(--tg-theme-button-color, #325fff);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 22%, transparent);
    }
    body.profile-page .profile-tg-btn svg {
      width: 18px;
      height: 18px;
      display: block;
    }
    body.profile-page .profile-username {
      margin: 0 0 10px;
      max-width: 100%;
      font-size: var(--panel-fs-sm);
      line-height: 1.3;
      color: var(--tg-theme-hint-color, #65708a);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 0 4px;
    }
    body.profile-page .profile-level {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: clamp(6px, 1.8vw, 8px) clamp(10px, 3vw, 14px);
      border-radius: 999px;
      background: #1a2744;
      color: #fff;
      font-size: var(--profile-fs-level);
      font-weight: 700;
      border: none;
      max-width: 100%;
    }
    body.profile-page .profile-stats {
      margin-top: 18px;
      padding: clamp(14px, 4vw, 18px) clamp(10px, 3vw, 14px);
      border-radius: 18px;
      background: var(--tg-theme-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: clamp(14px, 4vw, 18px) clamp(8px, 2.5vw, 12px);
      width: 100%;
      box-sizing: border-box;
    }
    body.profile-page .profile-stat {
      text-align: center;
      min-width: 0;
      padding: 0 clamp(2px, 1vw, 6px);
      box-sizing: border-box;
    }
    body.profile-page .profile-stat-value {
      display: block;
      max-width: 100%;
      font-size: var(--profile-fs-stat);
      font-weight: 800;
      line-height: 1.15;
      color: var(--tg-theme-text-color, #151a2d);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body.profile-page .profile-stat-value-date {
      font-size: var(--profile-fs-stat-date);
      letter-spacing: -0.02em;
    }
    body.profile-page .profile-stat-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      margin-top: 4px;
      max-width: 100%;
      font-size: var(--panel-fs-xs);
      line-height: 1.35;
      color: var(--tg-theme-hint-color, #65708a);
      overflow-wrap: anywhere;
      hyphens: auto;
    }
    body.profile-page .profile-stat-ico {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--tg-theme-button-color, #325fff);
      opacity: 0.9;
    }
    body.profile-page .profile-stat-ico svg {
      width: 13px;
      height: 13px;
      display: block;
    }
    body.profile-page .profile-stat-wins-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 0;
    }
    body.profile-page .profile-stat-wins-value {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      flex-wrap: nowrap;
      gap: clamp(3px, 1vw, 6px);
      max-width: 100%;
      width: 100%;
      line-height: 1.15;
    }
    body.profile-page .profile-wins-gold-text {
      background: linear-gradient(
        165deg,
        #fff4d6 0%,
        #f0d070 22%,
        #d4a017 48%,
        #b8860b 72%,
        #f5e6a8 100%
      );
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
    }
    body.profile-page .profile-wins-count {
      font-size: var(--profile-fs-stat);
      font-weight: 800;
      line-height: 1.1;
      flex-shrink: 0;
    }
    body.profile-page .profile-wins-sum {
      font-size: clamp(11px, 3.1vw, var(--panel-fs-sm));
      font-weight: 400;
      line-height: 1.1;
      flex-shrink: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: linear-gradient(
        165deg,
        #e8d4a8 0%,
        #c9a04a 40%,
        #9a7424 75%,
        #d4b86a 100%
      );
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
    }
    body.profile-page .profile-stat-label-wins {
      color: #808080;
    }
    body.profile-page.app-theme-dark .profile-stat-label-wins {
      color: #8b97ab;
    }
  `;
}

function renderProfileWinsValue(profile) {
  const wins = Math.max(0, Number(profile.wins) || 0);
  if (wins <= 0) {
    return `<span class="profile-stat-value">0</span>`;
  }

  const count = escapeHtml(String(wins));
  const sumHtml = profile.winningsParen
    ? `<span class="profile-wins-sum profile-wins-gold-text">(${escapeHtml(profile.winningsParen)})</span>`
    : "";

  return `<div class="profile-stat-wins-value">
    <span class="profile-wins-count profile-wins-gold-text">${count}</span>${sumHtml}
  </div>`;
}

function renderProfileStatLabel(iconKey, text, extraClass = "") {
  const icon = STAT_ICONS[iconKey] || "";
  const cls = extraClass ? `profile-stat-label ${extraClass}` : "profile-stat-label";
  return `<span class="${cls}"><span class="profile-stat-ico">${icon}</span>${escapeHtml(text)}</span>`;
}

function renderParticipantProfilePage(profile, options = {}) {
  const isPreview = options.isPreview === true;
  const backUrl = String(options.backUrl || "");
  const avatarInner = profile.avatarUrl
    ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" onerror="this.classList.add('hidden');var f=this.nextElementSibling;if(f)f.classList.remove('hidden')" /><div class="profile-avatar-fallback hidden" style="${profile.fallbackStyle}">${escapeHtml(profile.initial)}</div>`
    : `<div class="profile-avatar-fallback" style="${profile.fallbackStyle}">${escapeHtml(profile.initial)}</div>`;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  ${getMiniAppFontLinks()}
  <title>${escapeHtml(profile.displayName)}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>${getMiniAppHeadScript()}</script>
  <style>
    .hidden { display: none !important; }
    ${isPreview ? getPreviewDevStyles() : ""}
    ${getParticipantProfileStyles()}
    ${getMiniAppStyles()}
  </style>
</head>
<body class="profile-page mini-app-shell${isPreview ? " join-preview" : ""}">
  <div class="profile-shell">
  ${isPreview ? `<div class="preview-toolbar">${renderThemeToggleButton()}</div>` : ""}
  <div class="profile-toolbar">
    <button type="button" class="profile-back-btn" id="profileBackBtn" aria-label="Назад">${BACK_ICON}</button>
  </div>
  <div class="profile-hero">
    <div class="profile-avatar">${avatarInner}</div>
    <div class="profile-name-row">
      <h1 class="profile-name">${escapeHtml(profile.displayName)}</h1>
      <a href="${escapeHtml(profile.telegramProfileUrl)}" class="profile-tg-btn" id="profileTgBtn" title="Профиль в Telegram" aria-label="Профиль в Telegram">${TG_PROFILE_ICON}</a>
    </div>
    ${profile.usernameLine ? `<p class="profile-username">${escapeHtml(profile.usernameLine)}</p>` : ""}
    <div class="profile-level">${LEVEL_ICON} ${profile.level} уровень</div>
  </div>
  <section class="profile-stats" aria-label="Статистика">
    <div class="profile-stat">
      <span class="profile-stat-value">${escapeHtml(String(profile.participations))}</span>
      ${renderProfileStatLabel("participations", "Участий")}
    </div>
    <div class="profile-stat profile-stat-wins-cell">
      ${renderProfileWinsValue(profile)}
      ${renderProfileStatLabel("wins", "Побед", "profile-stat-label-wins")}
    </div>
    <div class="profile-stat">
      <span class="profile-stat-value">${escapeHtml(String(profile.boosts))}</span>
      ${renderProfileStatLabel("boosts", "Бустов")}
    </div>
    <div class="profile-stat">
      <span class="profile-stat-value profile-stat-value-date">${escapeHtml(profile.registeredAt)}</span>
      ${renderProfileStatLabel("registered", "Дата регистрации")}
    </div>
  </section>
  </div>
  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: true })}
    (function () {
      const tg = window.Telegram?.WebApp;
      const params = new URLSearchParams(location.search);
      const back = params.get("back") || ${JSON.stringify(backUrl)} || "";

      document.getElementById("profileBackBtn")?.addEventListener("click", () => {
        if (back) {
          location.href = back;
          return;
        }
        if (history.length > 1) {
          history.back();
          return;
        }
        tg?.close?.();
      });

      document.getElementById("profileTgBtn")?.addEventListener("click", (event) => {
        const href = ${JSON.stringify(profile.telegramProfileUrl)};
        if (!href || !tg?.openTelegramLink) return;
        if (href.startsWith("tg://") || href.startsWith("https://t.me/")) {
          event.preventDefault();
          tg.openTelegramLink(href);
        }
      });
    })();
  </script>
</body>
</html>`;
}

function registerParticipantProfile(app, deps) {
  const {
    readData,
    readUserProjectProfiles,
    getUserProfileBundle,
    getWinnerDisplayName,
    shouldHideParticipant = () => false,
    findKnownChannel,
    bot,
    designPreview,
  } = deps;

  const viewDeps = {
    readData,
    readUserProjectProfiles,
    getUserProfileBundle,
    getWinnerDisplayName,
    isMoneyPrizeType: deps.isMoneyPrizeType,
    getWinnerPayoutAmount: deps.getWinnerPayoutAmount,
    getWinnerAntiFraud: deps.getWinnerAntiFraud,
    formatRubAmount: deps.formatRubAmount,
    convertUsdToRub: deps.convertUsdToRub,
    DRAW_STATUS: deps.DRAW_STATUS,
  };

  app.get("/user/:userId", (req, res) => {
    const userId = req.params.userId;
    if (shouldHideParticipant(userId)) {
      res.status(404).type("html").send("<h1>Профиль недоступен</h1>");
      return;
    }
    const backUrl = String(req.query.back || "");
    const profile = buildParticipantProfileViewModel(userId, viewDeps, { backUrl });
    res.type("html").send(renderParticipantProfilePage(profile, { backUrl }));
  });

  app.get("/api/user/:userId", (req, res) => {
    const userId = req.params.userId;
    if (shouldHideParticipant(userId)) {
      res.status(404).json({ error: "Профиль недоступен." });
      return;
    }
    res.json(buildParticipantProfileViewModel(userId, viewDeps, { backUrl: req.query.back || "" }));
  });

  app.get("/channel-avatar/:channelKey", async (req, res) => {
    const known = findKnownChannel ? findKnownChannel(req.params.channelKey) : null;
    const fileId = known?.photoFileId;
    if (!fileId || !bot) {
      res.status(404).send("No photo");
      return;
    }
    try {
      const url = await bot.telegram.getFileLink(fileId);
      res.redirect(String(url));
    } catch {
      res.status(404).send("Unavailable");
    }
  });

  if (designPreview) {
    const mockProfile = {
      id: "1003",
      displayName: "Дмитрий",
      username: "@dmitry_k",
      usernameLine: "@dmitry_k",
      initial: "Д",
      avatarUrl: "",
      fallbackStyle: getAvatarFallbackStyle("1003"),
      telegramProfileUrl: "https://t.me/dmitry_k",
      profileUrl: "/user/1003",
      level: 4,
      participations: 9,
      wins: 1,
      winningsParen: "715₽",
      boosts: 0,
      registeredAt: "13 мар 2025 г.",
    };
    app.get("/dev/preview/profile", (_req, res) => {
      res.type("html").send(renderParticipantProfilePage(mockProfile, { isPreview: true }));
    });
  }
}

module.exports = {
  computeUserLevel,
  computeUserGiveawayStats,
  buildParticipantProfileUrl,
  buildParticipantProfileViewModel,
  renderParticipantProfilePage,
  registerParticipantProfile,
  getTelegramProfileUrl,
  formatProfileRegistrationDate,
  isInternalMiniAppHref,
  isTelegramMessengerHref,
  getMiniAppProfileNavigateScript,
};
