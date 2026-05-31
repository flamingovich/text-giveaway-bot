const {
  getMiniAppStyles,
  getMiniAppInitScript,
  getMiniAppViewportMeta,
  getMiniAppHeadScript,
  getMiniAppFontLinks,
  getPreviewDevStyles,
  getWinnersPageStyles,
  renderDesktopTiledBackground,
  renderThemeToggleButton,
} = require("./miniapp-ui");
const { getAvatarFallbackStyle } = require("./avatar-fallback");

const GIFT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`;
const TROPHY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M17 4v3a5 5 0 0 1-10 0V4"/><path d="M5 5H3v1a3 3 0 0 0 3 3"/><path d="M19 5h2v1a3 3 0 0 1-3 3"/></svg>`;
const USER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const USERS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const EMPTY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;
const VIEWER_WON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>`;
const VIEWER_LOST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 15h8"/><circle cx="9" cy="9" r="0.5" fill="currentColor"/><circle cx="15" cy="9" r="0.5" fill="currentColor"/></svg>`;
const VIEWER_NONE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
const PREVIEW_MOCK_USERS = {
  "1001": { meta: { first_name: "Алексей", username: "alex_winner" } },
  "1002": { meta: { first_name: "Мария", username: "maria_p" } },
  "1003": { meta: { first_name: "Дмитрий", username: "dmitry_k" } },
  "1004": { meta: { first_name: "Елена", username: "elena_v" } },
  "1005": { meta: { first_name: "Иван", username: "ivan_stream" } },
  "999001": { meta: { first_name: "Сервис", username: "roller_admin" } },
};

function buildPreviewUserProfiles() {
  return { users: { ...PREVIEW_MOCK_USERS } };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWinnersLabel(count) {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} победитель`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} победителя`;
  return `${n} победителей`;
}

function formatParticipantsLabel(count) {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
}

function renderAvatar(user) {
  const inner = user.avatarUrl
    ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" class="winners-avatar-img" loading="lazy" />`
    : `<div class="winners-avatar-fallback" style="${getAvatarFallbackStyle(user.id)}">${escapeHtml(user.initial)}</div>`;
  return `<div class="winners-avatar">${inner}</div>`;
}
function buildUserViewModel(userId, draw, deps, options = {}) {
  const userProfiles = deps.readUserProjectProfiles();
  const { meta } = deps.getUserProfileBundle(userProfiles, userId, draw.projectId);
  const displayName = deps.getWinnerDisplayName(meta, userId);
  const username = meta.username ? `@${meta.username}` : "";
  const initial = (displayName.replace(/^@/, "") || String(userId)).charAt(0).toUpperCase() || "?";
  const avatarUrl = meta.avatarFileId ? `/winners/avatar/${encodeURIComponent(String(userId))}` : "";
  const profileUrl = deps.getTelegramUserProfileUrl(userId, meta.username);
  const prize = options.includePrize ? deps.getPerWinnerPrizeText(draw) : "";

  return {
    id: String(userId),
    displayName,
    username,
    initial,
    avatarUrl,
    profileUrl,
    prize,
  };
}

function buildWinnerViewModel(winnerId, draw, deps) {
  return buildUserViewModel(winnerId, draw, deps, { includePrize: true });
}

function buildParticipantsList(draw, deps) {
  const hideParticipant = deps.shouldHideParticipant || (() => false);
  return (draw.participantIds || [])
    .filter((userId) => !hideParticipant(userId))
    .map((userId) => buildUserViewModel(userId, draw, deps));
}

function renderUserRow(user, options = {}) {
  const showPrize = options.showPrize === true;
  const handle = user.username || "без username";
  const delayStyle =
    options.animationDelay != null ? ` style="animation-delay:${options.animationDelay}s"` : "";
  const prizeBlock = showPrize
    ? `<div class="winners-row-prize">
        <span class="winners-row-prize-label">Приз:</span>
        <span class="winners-row-prize-value">${escapeHtml(user.prize)}</span>
      </div>`
    : "";

  return `<article class="winners-row${showPrize ? "" : " winners-row-compact"}"${delayStyle}>
    ${renderAvatar(user)}
    <div class="winners-row-body">
      <div class="winners-row-identity">
        <span class="winners-row-name">${escapeHtml(user.displayName)}</span>
        <a href="${escapeHtml(user.profileUrl)}" class="winners-profile-btn" title="Профиль" aria-label="Перейти в профиль">${USER_ICON}</a>
      </div>
      <div class="winners-row-handle">${escapeHtml(handle)}</div>
    </div>
    ${prizeBlock}
  </article>`;
}

function renderWinnerCard(winner, index) {
  return renderUserRow(winner, {
    showPrize: true,
    animationDelay: Math.min(index * 0.04 + 0.03, 0.24),
  });
}

function renderParticipantCard(participant, index) {
  return renderUserRow(participant, {
    showPrize: false,
    animationDelay: Math.min(index * 0.03 + 0.02, 0.2),
  });
}

function renderWinnersStats(winnersCount, participantCount, activeTab = "participants") {
  const parts = [];
  parts.push(`<button type="button" class="winners-stat winners-stat-btn${activeTab === "winners" ? " is-active" : ""}" data-winners-tab="winners" aria-pressed="${activeTab === "winners"}">
    <span class="winners-stat-icon">${TROPHY_ICON}</span>
    <span class="winners-stat-value">${escapeHtml(formatWinnersLabel(winnersCount))}</span>
  </button>`);
  if (participantCount != null) {
    parts.push(`<button type="button" class="winners-stat winners-stat-btn${activeTab === "participants" ? " is-active" : ""}" data-winners-tab="participants" aria-pressed="${activeTab === "participants"}">
      <span class="winners-stat-icon">${USERS_ICON}</span>
      <span class="winners-stat-value">${escapeHtml(formatParticipantsLabel(participantCount))}</span>
    </button>`);
  }
  return `<div class="winners-stats">${parts.join("")}</div>`;
}

function renderWinnersTabPanel(id, rowsHtml, emptyText, isVisible) {
  return `<div id="${id}" class="winners-tab-panel${isVisible ? "" : " hidden"}" role="tabpanel">
    ${
      rowsHtml
        ? `<div class="winners-list">${rowsHtml}</div>`
        : `<div class="winners-empty winners-empty-compact">
            <span class="winners-empty-icon">${EMPTY_ICON}</span>
            <p class="winners-empty-title">${escapeHtml(emptyText)}</p>
          </div>`
    }
  </div>`;
}

function renderWinnersPage(draw, winners, participants, options = {}) {
  const isPreview = options.isPreview === true;
  const prizeTitle = escapeHtml(draw?.prize || "приз");
  const winnersCount = winners.length;
  const participantCount = participants.length;
  const winnerIds = (draw?.winnerIds || []).map(String);
  const participantIds = (draw?.participantIds || []).map(String);

  const defaultTab = "winners";
  const winnersRowsHtml = winnersCount > 0 ? winners.map((w, i) => renderWinnerCard(w, i)).join("") : "";
  const participantsRowsHtml =
    participantCount > 0 ? participants.map((p, i) => renderParticipantCard(p, i)).join("") : "";

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  ${getMiniAppFontLinks()}
  <title>Победители — ${prizeTitle}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>${getMiniAppHeadScript()}</script>
  <style>
    .hidden { display: none !important; }
    .preview-toolbar { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; width: 100%; box-sizing: border-box; }
    ${isPreview ? getPreviewDevStyles() : ""}
    ${getWinnersPageStyles()}
    ${getMiniAppStyles()}
  </style>
</head>
<body class="winners-page mini-app-shell${isPreview ? " join-preview" : ""}">
  ${renderDesktopTiledBackground()}
  <div class="winners-shell">
    ${isPreview ? `<div class="preview-toolbar">${renderThemeToggleButton()}</div>` : ""}
    <header class="winners-header">
      <div class="winners-header-top">
        <h1 class="winners-title">Розыгрыш на ${prizeTitle} завершён</h1>
        <div class="winners-header-icon">${GIFT_ICON}</div>
      </div>
      <div id="viewerStatus" class="winners-viewer-banner hidden" role="status">
        <span class="winners-viewer-banner-icon" aria-hidden="true"></span>
        <div class="winners-viewer-banner-copy">
          <span class="winners-viewer-banner-title"></span>
          <span class="winners-viewer-banner-sub"></span>
        </div>
      </div>
      ${renderWinnersStats(winnersCount, participantCount, defaultTab)}
    </header>
    <section class="winners-panel" aria-live="polite">
      ${renderWinnersTabPanel("winnersTabWinners", winnersRowsHtml, "Победители не определены", defaultTab === "winners")}
      ${renderWinnersTabPanel("winnersTabParticipants", participantsRowsHtml, "Участников нет", defaultTab === "participants")}
    </section>
  </div>
  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: true })}
    (function () {
      const DRAW_VIEW = {
        winnerIds: ${JSON.stringify(winnerIds)},
        participantIds: ${JSON.stringify(participantIds)},
        previewViewerId: ${options.previewViewerId != null ? JSON.stringify(String(options.previewViewerId)) : "null"},
      };

      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }

      function applyViewerStatus() {
        const el = document.getElementById("viewerStatus");
        if (!el) return;
        const iconEl = el.querySelector(".winners-viewer-banner-icon");
        const titleEl = el.querySelector(".winners-viewer-banner-title");
        const subEl = el.querySelector(".winners-viewer-banner-sub");
        let userId = DRAW_VIEW.previewViewerId;
        if (!userId && tg?.initDataUnsafe?.user?.id) {
          userId = String(tg.initDataUnsafe.user.id);
        }
        if (!userId) {
          el.classList.add("hidden");
          return;
        }
        el.classList.remove("hidden", "is-won", "is-lost", "is-none");
        const winners = new Set(DRAW_VIEW.winnerIds);
        const participants = new Set(DRAW_VIEW.participantIds);
        if (winners.has(userId)) {
          el.classList.add("is-won");
          if (iconEl) iconEl.innerHTML = ${JSON.stringify(VIEWER_WON_ICON)};
          if (titleEl) titleEl.textContent = "Вы выиграли";
          if (subEl) {
            subEl.textContent = "Проверьте личные сообщения бота";
            subEl.classList.remove("hidden");
          }
        } else if (participants.has(userId)) {
          el.classList.add("is-lost");
          if (iconEl) iconEl.innerHTML = ${JSON.stringify(VIEWER_LOST_ICON)};
          if (titleEl) titleEl.textContent = "Вы не выиграли";
          if (subEl) {
            subEl.textContent = "В этот раз не повезло — удачи в следующих розыгрышах";
            subEl.classList.remove("hidden");
          }
        } else {
          el.classList.add("is-none");
          if (iconEl) iconEl.innerHTML = ${JSON.stringify(VIEWER_NONE_ICON)};
          if (titleEl) titleEl.textContent = "Вы не участвовали";
          if (subEl) {
            subEl.textContent = "Следите за новыми розыгрышами в канале";
            subEl.classList.remove("hidden");
          }
        }
      }

      applyViewerStatus();

      function bindProfileLinks(root) {
        (root || document).querySelectorAll(".winners-profile-btn").forEach((link) => {
          if (link.dataset.bound === "1") return;
          link.dataset.bound = "1";
          link.addEventListener("click", (event) => {
            const href = link.getAttribute("href") || "";
            if (!href.startsWith("tg://") || !tg?.openTelegramLink) return;
            event.preventDefault();
            tg.openTelegramLink(href);
          });
        });
      }

      function switchWinnersTab(tab) {
        const winnersPanel = document.getElementById("winnersTabWinners");
        const participantsPanel = document.getElementById("winnersTabParticipants");
        if (winnersPanel) winnersPanel.classList.toggle("hidden", tab !== "winners");
        if (participantsPanel) participantsPanel.classList.toggle("hidden", tab !== "participants");
        document.querySelectorAll(".winners-stat-btn").forEach((btn) => {
          const isActive = btn.getAttribute("data-winners-tab") === tab;
          btn.classList.toggle("is-active", isActive);
          btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
        bindProfileLinks(document.querySelector(".winners-panel"));
      }

      document.querySelectorAll(".winners-stat-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tab = btn.getAttribute("data-winners-tab");
          if (tab) switchWinnersTab(tab);
        });
      });

      bindProfileLinks(document);
    })();
  </script>
</body>
</html>`;
}

function renderWinnersAppLauncherPage() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  ${getMiniAppFontLinks()}
  <title>Победители</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>${getMiniAppHeadScript()}</script>
  <style>
    .hidden { display: none !important; }
    ${getWinnersPageStyles()}
    ${getMiniAppStyles()}
    body.winners-page .winners-app-status {
      margin: 24px auto 0;
      max-width: 320px;
      text-align: center;
      font-size: 15px;
      line-height: 1.45;
      color: var(--tg-theme-hint-color, #65708a);
    }
    body.winners-page .winners-app-error {
      color: #cf222e;
    }
  </style>
</head>
<body class="winners-page mini-app-shell">
  ${renderDesktopTiledBackground()}
  <div class="winners-shell">
    <p id="winnersLoading" class="winners-app-status">Загрузка итогов...</p>
    <p id="winnersError" class="winners-app-status winners-app-error hidden"></p>
  </div>
  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: true })}
    (function () {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }
      const drawId = String(tg?.initDataUnsafe?.start_param || "").trim();
      const loading = document.getElementById("winnersLoading");
      const err = document.getElementById("winnersError");
      if (!drawId) {
        if (loading) loading.classList.add("hidden");
        if (err) {
          err.textContent = "Не указан розыгрыш. Нажмите кнопку в посте канала.";
          err.classList.remove("hidden");
        }
        return;
      }
      location.replace("/winners/" + encodeURIComponent(drawId));
    })();
  </script>
</body>
</html>`;
}

function registerWinnersMiniApp(app, deps) {
  const {
    readData,
    DRAW_STATUS,
    readUserProjectProfiles,
    getUserProfileBundle,
    getWinnerDisplayName,
    getPerWinnerPrizeText,
    getTelegramUserProfileUrl,
    shouldHideParticipant,
    bot,
    designPreview,
  } = deps;

  const viewDeps = {
    readUserProjectProfiles,
    getUserProfileBundle,
    getWinnerDisplayName,
    getPerWinnerPrizeText,
    getTelegramUserProfileUrl,
    shouldHideParticipant:
      shouldHideParticipant ||
      (designPreview ? (userId) => String(userId) === "999001" : () => false),
  };

  function getFinishedDraw(drawId) {
    const data = readData();
    const draw = data.draws.find((item) => item.id === drawId);
    if (!draw || draw.status !== DRAW_STATUS.FINISHED) {
      return null;
    }
    return draw;
  }

  function buildWinnersList(draw) {
    return (draw.winnerIds || []).map((winnerId) => buildWinnerViewModel(winnerId, draw, viewDeps));
  }

  function buildParticipantsForPage(draw) {
    return buildParticipantsList(draw, viewDeps);
  }

  app.get("/winners/avatar/:userId", async (req, res) => {
    const userProfiles = readUserProjectProfiles();
    const fileId = userProfiles.users?.[String(req.params.userId)]?.meta?.avatarFileId;
    if (!fileId || !bot) {
      res.status(404).send("No avatar");
      return;
    }
    try {
      const url = await bot.telegram.getFileLink(fileId);
      res.redirect(String(url));
    } catch {
      res.status(404).send("Avatar unavailable");
    }
  });

  app.get("/winners/app", (_req, res) => {
    res.type("html").send(renderWinnersAppLauncherPage());
  });

  app.get("/winners/:drawId", (req, res) => {
    if (req.params.drawId === "app") {
      res.redirect(301, "/winners/app");
      return;
    }
    const draw = getFinishedDraw(req.params.drawId);
    if (!draw) {
      res.status(404).type("html").send("<h1>Розыгрыш не найден или ещё не завершён</h1>");
      return;
    }
    const winners = buildWinnersList(draw);
    const participants = buildParticipantsForPage(draw);
    res.type("html").send(renderWinnersPage(draw, winners, participants));
  });

  app.get("/api/winners/:drawId", (req, res) => {
    const draw = getFinishedDraw(req.params.drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш не найден или ещё не завершён." });
      return;
    }
    const participants = buildParticipantsForPage(draw);
    res.json({
      drawId: draw.id,
      prize: draw.prize,
      winnersCount: (draw.winnerIds || []).length,
      participantsCount: participants.length,
      winners: buildWinnersList(draw),
      participants,
    });
  });

  if (designPreview) {
    const mockDraw = {
      id: "preview-finished",
      prize: "10$",
      status: DRAW_STATUS.FINISHED,
      winnerIds: ["1001", "1002"],
      winnersCount: 2,
      prizeType: "money_usd",
      prizeAmount: 20,
      participantIds: ["1001", "1002", "1003", "1004", "1005", "999001"],
      projectId: "demo",
    };
    const previewViewDeps = {
      ...viewDeps,
      readUserProjectProfiles: () => buildPreviewUserProfiles(),
    };
    const mockWinners = (mockDraw.winnerIds || []).map((winnerId) =>
      buildWinnerViewModel(winnerId, mockDraw, previewViewDeps),
    );
    const mockParticipants = buildParticipantsList(mockDraw, previewViewDeps);

    app.get("/dev/preview/winners", (_req, res) => {
      res.type("html").send(
        renderWinnersPage(mockDraw, mockWinners, mockParticipants, {
          isPreview: true,
          previewViewerId: "1003",
        }),
      );
    });
  }
}

module.exports = { registerWinnersMiniApp, renderWinnersPage, renderWinnersAppLauncherPage };
