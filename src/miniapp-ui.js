/**
 * Стили и init для Telegram Mini App.
 * Viewport: ширина ≈ ширина экрана телефона (320–430px), высота динамическая
 * (BottomSheet от ~40% до 100%). Ориентир для вёрстки: 360×640.
 * @see https://docs.telegram-mini-apps.com/platform/viewport
 * @see https://core.telegram.org/bots/webapps
 */
function getMiniAppStyles() {
  return `
    :root {
      --mini-vh: var(--tg-viewport-stable-height, var(--tg-viewport-height, 100dvh));
      --mini-vw: var(--tg-viewport-width, 100vw);
      --mini-pad-x: 12px;
      --mini-pad-top: max(6px, var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)));
      --mini-pad-bottom: max(10px, var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
      --tg-theme-bg-color: #eef3ff;
      --tg-theme-text-color: #151a2d;
      --tg-theme-hint-color: #65708a;
      --tg-theme-link-color: #325fff;
      --tg-theme-button-color: #325fff;
      --tg-theme-button-text-color: #ffffff;
      --tg-theme-secondary-bg-color: #ffffff;
    }

    html {
      overflow-x: hidden;
      max-width: 100%;
      overscroll-behavior-x: none;
    }

    body.mini-app-shell {
      max-width: 100%;
      width: 100%;
      min-height: var(--mini-vh);
      margin: 0;
      background-color: var(--bg, #dbe8f8) !important;
      color: var(--tg-theme-text-color);
      -webkit-text-size-adjust: 100%;
      overflow-x: hidden;
      overscroll-behavior-x: none;
      position: relative;
    }

    body.mini-app-shell::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      background-color: var(--bg, #dbe8f8);
      background-image: var(--app-bg-image, url("/brand/background.jpg"));
      background-repeat: repeat-y;
      background-position: center top;
      background-size: min(100vw, 760px) auto;
      pointer-events: none;
    }

    body.mini-app-shell .site-header {
      background: var(--tg-theme-secondary-bg-color, #fff);
      border-bottom: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 16%, transparent);
      padding-top: env(safe-area-inset-top);
    }

    body.mini-app-shell .site-header-inner {
      padding: 10px var(--mini-pad-x);
      min-height: 48px;
      gap: 8px;
      align-items: center;
    }

    body.mini-app-shell .container {
      max-width: 100%;
      width: 100%;
      padding-left: var(--mini-pad-x);
      padding-right: var(--mini-pad-x);
      padding-top: 12px;
      padding-bottom: var(--mini-pad-bottom);
      overflow-x: hidden;
      box-sizing: border-box;
    }

    body.mini-app-shell .grid {
      gap: 10px;
      max-width: 100%;
      min-width: 0;
      width: 100%;
      overflow-x: hidden;
    }

    body.mini-app-shell .page-logo {
      width: 34px;
      height: 34px;
      border-radius: 8px;
    }

    body.mini-app-shell .page-title {
      margin: 0;
      font-size: 15px;
      gap: 5px;
      line-height: 1;
      align-items: center;
    }

    body.mini-app-shell .page-title-brand {
      font-weight: 800;
      color: var(--tg-theme-text-color);
    }

    body.mini-app-shell .page-title-sub {
      font-size: 12px;
      font-weight: 500;
    }

    body.mini-app-shell .mini-hide { display: none !important; }

    body.mini-app-shell .create-panel,
    body.mini-app-shell .draw-block,
    body.mini-app-shell .draw-media-row,
    body.mini-app-shell .project-card,
    body.mini-app-shell .projects-list,
    body.mini-app-shell .project-form-footer,
    body.mini-app-shell .access-card,
    body.mini-app-shell .access-list {
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      box-sizing: border-box;
    }

    body.mini-app-shell .project-card-head {
      grid-template-columns: 44px minmax(0, 1fr) auto;
      width: 100%;
    }

    body.mini-app-shell .access-card-head {
      grid-template-columns: 48px minmax(0, 1fr);
      width: 100%;
    }

    body.mini-app-shell .access-card-head-removable {
      grid-template-columns: auto 48px minmax(0, 1fr);
    }

    body.mini-app-shell .quick-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      width: 100%;
      max-width: 100%;
    }

    body.mini-app-shell .quick-action {
      flex: 1 1 0;
      width: auto;
      min-width: 0;
      min-height: 56px;
      padding: 9px 4px;
    }

    body.mini-app-shell .quick-actions {
      overflow: hidden;
    }

    body.mini-app-shell .qa-label {
      font-size: 10px;
    }

    body.mini-app-shell .qa-icon svg {
      width: 20px;
      height: 20px;
    }

    body.mini-app-shell .card {
      padding: 12px;
      border-radius: 12px;
      background: var(--tg-theme-secondary-bg-color);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color) 22%, transparent);
      box-shadow: none;
    }

    body.mini-app-shell h2 {
      font-size: 16px;
      margin-bottom: 10px;
      color: var(--tg-theme-text-color);
    }

    body.mini-app-shell .subtitle {
      font-size: 12px;
      margin-bottom: 10px;
      color: var(--tg-theme-hint-color);
    }

    body.mini-app-shell .card,
    body.mini-app-shell img,
    body.mini-app-shell input,
    body.mini-app-shell select,
    body.mini-app-shell button,
    body.mini-app-shell .history-list,
    body.mini-app-shell .history-card {
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      box-sizing: border-box;
    }

    body.mini-app-shell .stats-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin: 0;
    }

    body.mini-app-shell .stat-card {
      padding: 8px 9px;
      border-radius: 10px;
      background: var(--tg-theme-bg-color);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color) 18%, transparent);
    }

    body.mini-app-shell .stat-card-label {
      font-size: 10px;
      margin-bottom: 2px;
    }

    body.mini-app-shell .stat-card-value {
      font-size: 15px;
    }

    body.mini-app-shell .stat-card-value-rub {
      font-size: 13px;
    }

    body.mini-app-shell .draw-history-title {
      font-size: 15px;
      margin: 0 0 8px;
    }

    body.mini-app-shell .history-list {
      gap: 8px;
    }

    body.mini-app-shell .history-card {
      padding: 10px;
    }

    body.mini-app-shell .history-cover-side {
      width: 92px;
      min-height: 92px;
      padding: 4px;
    }

    body.mini-app-shell .history-body {
      gap: 8px;
    }

    body.mini-app-shell .history-prize {
      font-size: 16px;
    }

    body.mini-app-shell .history-times {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    body.mini-app-shell .history-time-text {
      font-size: 10px;
      white-space: normal;
      line-height: 1.3;
    }

    body.mini-app-shell .history-chips {
      grid-template-columns: 1fr 1fr;
    }

    body.mini-app-shell .history-chip {
      font-size: 9px;
      padding: 4px 6px;
      gap: 3px;
    }

    body.mini-app-shell .history-chip-label {
      white-space: nowrap;
    }

    body.mini-app-shell .history-chip-value {
      font-size: 11px;
    }

    body.mini-app-shell .winner-details-content {
      gap: 6px;
    }

    body.mini-app-shell .winner-card {
      padding: 8px;
    }

    body.mini-app-shell .winner-card-name {
      font-size: 13px;
    }

    body.mini-app-shell .winner-address-text {
      font-size: 10px;
    }

    body.mini-app-shell .winner-action-btn {
      font-size: 11px;
      padding: 7px 8px;
    }

    body.mini-app-shell .winner-card-qr {
      width: 64px;
      height: 64px;
      padding: 3px;
    }

    body.mini-app-shell .history-details summary {
      font-size: 12px;
      padding: 8px 9px;
    }

    body.mini-app-shell .history-action-btn {
      font-size: 13px;
      padding: 10px 12px;
    }

    body.mini-app-shell .project-layout {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    body.mini-app-shell .compact-grid-2,
    body.mini-app-shell .compact-grid-3,
    body.mini-app-shell .row,
    body.mini-app-shell .row-3 {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    body.mini-app-shell input,
    body.mini-app-shell select,
    body.mini-app-shell button {
      font-size: 14px;
    }

    body.mini-app-shell .actions form {
      width: 100%;
      min-width: 0;
    }

    body.mini-app-shell .form-footer button {
      max-width: none;
    }

    body.mini-app-shell .create-panel {
      max-width: 100%;
      margin: 0;
    }

    body.mini-app-shell .msg {
      padding: 9px 11px;
      font-size: 13px;
      margin-bottom: 10px;
    }

    body.mini-app-shell .access-avatar {
      width: 40px;
      height: 40px;
    }

    body.mini-app-shell .access-remove-form {
      margin-left: 52px;
    }

    body.mini-app-shell .hero {
      padding: 14px;
      margin-bottom: 10px;
      border-radius: 14px;
    }

    body.mini-app-shell .hero h1 {
      font-size: 18px;
    }

    body.mini-app-shell .captcha-q {
      font-size: 22px;
      margin: 8px 0;
    }

    body.mini-app-shell .guide img {
      max-height: 120px;
      object-fit: contain;
    }

    body.mini-app-shell .draw-block {
      padding: 8px;
    }

    body.mini-app-shell .draw-block-confirm {
      margin-top: 0;
    }

    body.mini-app-shell .project-card-name {
      font-size: 14px;
    }

    body.mini-app-shell .project-card-link {
      font-size: 11px;
    }

    body.mini-app-shell .projects-list-title,
    body.mini-app-shell .access-list-title {
      font-size: 12px;
      margin-top: 10px;
    }

    body.mini-app-shell .access-card-name {
      font-size: 14px;
    }

    body.mini-app-shell .access-card-meta {
      font-size: 11px;
    }

    body.mini-app-shell .preview-nav button {
      min-width: 52px;
      padding: 6px 8px;
      font-size: 11px;
    }
  `;
}

function getMiniAppInitScript(options = {}) {
  const authSession = options.authSession !== false;
  const previewShell = options.previewShell === true;

  return `
(function () {
  const tg = window.Telegram?.WebApp;
  const themeKeys = {
    bg_color: "--tg-theme-bg-color",
    text_color: "--tg-theme-text-color",
    hint_color: "--tg-theme-hint-color",
    link_color: "--tg-theme-link-color",
    button_color: "--tg-theme-button-color",
    button_text_color: "--tg-theme-button-text-color",
    secondary_bg_color: "--tg-theme-secondary-bg-color",
  };

  function applyTheme() {
    if (!tg?.themeParams) return;
    const root = document.documentElement;
    for (const [key, cssVar] of Object.entries(themeKeys)) {
      if (tg.themeParams[key]) {
        root.style.setProperty(cssVar, tg.themeParams[key]);
      }
    }
  }

  function bindViewport() {
    if (!tg) return;
    const root = document.documentElement;
    const sync = () => {
      if (tg.viewportHeight) {
        root.style.setProperty("--tg-viewport-height", tg.viewportHeight + "px");
      }
      if (tg.viewportStableHeight) {
        root.style.setProperty("--tg-viewport-stable-height", tg.viewportStableHeight + "px");
      }
      if (tg.viewportWidth) {
        root.style.setProperty("--tg-viewport-width", tg.viewportWidth + "px");
      }
      const sa = tg.safeAreaInset || tg.contentSafeAreaInset;
      if (sa) {
        if (sa.top != null) root.style.setProperty("--tg-safe-area-inset-top", sa.top + "px");
        if (sa.bottom != null) root.style.setProperty("--tg-safe-area-inset-bottom", sa.bottom + "px");
      }
    };
    sync();
    tg.onEvent("viewportChanged", sync);
    tg.onEvent("safeAreaChanged", sync);
    tg.onEvent("contentSafeAreaChanged", sync);
    tg.onEvent("themeChanged", applyTheme);
  }

  function enableShell() {
    document.body.classList.add("mini-app-shell");
    applyTheme();
    bindViewport();
  }

  if (tg) {
    tg.ready();
    tg.expand();
    enableShell();
    ${authSession ? `
    if (tg.initData) {
      fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
        credentials: "same-origin",
      }).catch(function () {});
    }` : ""}
  } else if (${previewShell ? "true" : "false"}) {
    enableShell();
  }
})();
`;
}

module.exports = { getMiniAppStyles, getMiniAppInitScript };
