const {
  getMiniAppStyles,
  getMiniAppInitScript,
  getMiniAppViewportMeta,
  getMiniAppHeadScript,
  getMiniAppFontLinks,
  getPreviewDevStyles,
  getWinnersPageStyles,
  renderThemeToggleButton,
} = require("./miniapp-ui");

const GIFT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`;
const TROPHY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M17 4v3a5 5 0 0 1-10 0V4"/><path d="M5 5H3v1a3 3 0 0 0 3 3"/><path d="M19 5h2v1a3 3 0 0 1-3 3"/></svg>`;
const USER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const USERS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const EMPTY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;
const VIEWER_WON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>`;
const VIEWER_LOST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 15h8"/><circle cx="9" cy="9" r="0.5" fill="currentColor"/><circle cx="15" cy="9" r="0.5" fill="currentColor"/></svg>`;
const VIEWER_NONE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;

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

function buildWinnerViewModel(winnerId, draw, deps) {
  const userProfiles = deps.readUserProjectProfiles();
  const { meta } = deps.getUserProfileBundle(userProfiles, winnerId, draw.projectId);
  const displayName = deps.getWinnerDisplayName(meta, winnerId);
  const username = meta.username ? `@${meta.username}` : "";
  const initial = (displayName.replace(/^@/, "") || String(winnerId)).charAt(0).toUpperCase() || "?";
  const avatarUrl = meta.avatarFileId ? `/winners/avatar/${encodeURIComponent(String(winnerId))}` : "";
  const profileUrl = deps.getTelegramUserProfileUrl(winnerId, meta.username);
  const prize = deps.getPerWinnerPrizeText(draw);

  return {
    id: String(winnerId),
    displayName,
    username,
    initial,
    avatarUrl,
    profileUrl,
    prize,
  };
}

function renderWinnerCard(winner, index) {
  const avatar = winner.avatarUrl
    ? `<img src="${escapeHtml(winner.avatarUrl)}" alt="" class="winners-avatar" loading="lazy" />`
    : `<div class="winners-avatar winners-avatar-fallback">${escapeHtml(winner.initial)}</div>`;
  const handle = winner.username || "без username";

  return `<article class="winners-row" style="animation-delay:${Math.min(index * 0.04 + 0.03, 0.24)}s">
    ${avatar}
    <div class="winners-row-body">
      <div class="winners-row-identity">
        <span class="winners-row-name">${escapeHtml(winner.displayName)}</span>
        <a href="${escapeHtml(winner.profileUrl)}" class="winners-profile-btn" title="Профиль" aria-label="Перейти в профиль">${USER_ICON}</a>
      </div>
      <div class="winners-row-handle">${escapeHtml(handle)}</div>
    </div>
    <div class="winners-row-prize">
      <span class="winners-row-prize-label">Приз:</span>
      <span class="winners-row-prize-value">${escapeHtml(winner.prize)}</span>
    </div>
  </article>`;
}

function renderWinnersStats(winnersCount, participantCount) {
  const parts = [];
  parts.push(`<div class="winners-stat">
    <span class="winners-stat-icon">${TROPHY_ICON}</span>
    <span class="winners-stat-text">
      <span class="winners-stat-value">${escapeHtml(formatWinnersLabel(winnersCount))}</span>
    </span>
  </div>`);
  if (participantCount != null) {
    parts.push(`<div class="winners-stat">
      <span class="winners-stat-icon">${USERS_ICON}</span>
      <span class="winners-stat-text">
        <span class="winners-stat-value">${escapeHtml(formatParticipantsLabel(participantCount))}</span>
      </span>
    </div>`);
  }
  return `<div class="winners-stats">${parts.join("")}</div>`;
}

function renderWinnersPage(draw, winners, options = {}) {
  const isPreview = options.isPreview === true;
  const prizeTitle = escapeHtml(draw?.prize || "приз");
  const winnersCount = winners.length;
  const participantCount = draw?.participantIds?.length ?? options.participantCount ?? null;
  const winnerIds = (draw?.winnerIds || []).map(String);
  const participantIds = (draw?.participantIds || []).map(String);

  const listHtml =
    winnersCount > 0
      ? `<div class="winners-list">${winners.map((w, i) => renderWinnerCard(w, i)).join("")}</div>`
      : `<div class="winners-empty">
          <span class="winners-empty-icon">${EMPTY_ICON}</span>
          <p class="winners-empty-title">Победители не определены</p>
        </div>`;

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
      ${renderWinnersStats(winnersCount, participantCount)}
    </header>
    ${listHtml}
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

      document.querySelectorAll(".winners-profile-btn").forEach((link) => {
        link.addEventListener("click", (event) => {
          const href = link.getAttribute("href") || "";
          if (!href.startsWith("tg://") || !tg?.openTelegramLink) return;
          event.preventDefault();
          tg.openTelegramLink(href);
        });
      });
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
    bot,
    designPreview,
  } = deps;

  function getFinishedDraw(drawId) {
    const data = readData();
    const draw = data.draws.find((item) => item.id === drawId);
    if (!draw || draw.status !== DRAW_STATUS.FINISHED) {
      return null;
    }
    return draw;
  }

  function buildWinnersList(draw) {
    return (draw.winnerIds || []).map((winnerId) =>
      buildWinnerViewModel(winnerId, draw, {
        readUserProjectProfiles,
        getUserProfileBundle,
        getWinnerDisplayName,
        getPerWinnerPrizeText,
        getTelegramUserProfileUrl,
      }),
    );
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

  app.get("/winners/:drawId", (req, res) => {
    const draw = getFinishedDraw(req.params.drawId);
    if (!draw) {
      res.status(404).type("html").send("<h1>Розыгрыш не найден или ещё не завершён</h1>");
      return;
    }
    const winners = buildWinnersList(draw);
    res.type("html").send(renderWinnersPage(draw, winners));
  });

  app.get("/api/winners/:drawId", (req, res) => {
    const draw = getFinishedDraw(req.params.drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш не найден или ещё не завершён." });
      return;
    }
    res.json({
      drawId: draw.id,
      prize: draw.prize,
      winnersCount: (draw.winnerIds || []).length,
      winners: buildWinnersList(draw),
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
      participantIds: ["1001", "1002", "1003", "1004", "1005"],
    };
    const mockWinners = [
      {
        id: "1001",
        displayName: "Алексей",
        username: "@alex_winner",
        initial: "А",
        avatarUrl: "",
        profileUrl: "https://t.me/alex_winner",
        prize: "10$",
      },
      {
        id: "1002",
        displayName: "Maria",
        username: "@maria_p",
        initial: "M",
        avatarUrl: "",
        profileUrl: "https://t.me/maria_p",
        prize: "10$",
      },
    ];

    app.get("/dev/preview/winners", (_req, res) => {
      res.type("html").send(
        renderWinnersPage(mockDraw, mockWinners, {
          isPreview: true,
          previewViewerId: "1003",
        }),
      );
    });
  }
}

module.exports = { registerWinnersMiniApp, renderWinnersPage };
