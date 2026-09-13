/**
 * Стили и init для Telegram Mini App.
 * Viewport: ширина ≈ ширина экрана телефона (320–430px), высота динамическая
 * (BottomSheet от ~40% до 100%). Ориентир для вёрстки: 360×640.
 * @see https://docs.telegram-mini-apps.com/platform/viewport
 * @see https://core.telegram.org/bots/webapps
 */

const MINIAPP_VIEWPORT =
  "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

function getMiniAppViewportMeta() {
  return `<meta name="viewport" content="${MINIAPP_VIEWPORT}" />`;
}

function getParticipantRowChevronIcon() {
  return `<svg class="participant-row-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
}

function getMiniAppFontLinks() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />`;
}

function getTelegramPanelAuthRedirectScript(panelPath = "/panel") {
  const enterPathJson = JSON.stringify(`${panelPath.replace(/\/$/, "")}/enter`);
  return `
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;
  tg.ready();
  tg.expand();

  function submitEnter() {
    var data = tg.initData;
    if (!data) return false;

    var existing = document.getElementById("panelEnterForm");
    if (existing) {
      var input = document.getElementById("panelEnterInitData");
      if (input) input.value = data;
      existing.submit();
      return true;
    }

    var form = document.createElement("form");
    form.id = "panelEnterForm";
    form.method = "POST";
    form.action = ${enterPathJson};
    form.style.display = "none";
    var input = document.createElement("input");
    input.type = "hidden";
    input.name = "initData";
    input.value = data;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    return true;
  }

  function boot() {
    if (submitEnter()) return;
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      if (submitEnter() || tries >= 25) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
`;
}

const THEME_STORAGE_KEY = "rollerbot-theme";
const THEME_CSS_KEYS = {
  bg_color: "--tg-theme-bg-color",
  text_color: "--tg-theme-text-color",
  hint_color: "--tg-theme-hint-color",
  link_color: "--tg-theme-link-color",
  button_color: "--tg-theme-button-color",
  button_text_color: "--tg-theme-button-text-color",
  secondary_bg_color: "--tg-theme-secondary-bg-color",
};
const MANUAL_LIGHT_THEME = {
  bg_color: "#eef3ff",
  text_color: "#151a2d",
  hint_color: "#65708a",
  link_color: "#325fff",
  button_color: "#325fff",
  button_text_color: "#ffffff",
  secondary_bg_color: "#ffffff",
};
const MANUAL_DARK_THEME = {
  bg_color: "#1c2536",
  text_color: "#eef1f7",
  hint_color: "#93a0b8",
  link_color: "#6b9aff",
  button_color: "#5b8cff",
  button_text_color: "#ffffff",
  secondary_bg_color: "#232f42",
};

const PANEL_FLUID_TYPOGRAPHY_VARS = `
      --panel-fs-xs: clamp(11px, 3.1vw, 12px);
      --panel-fs-sm: clamp(12px, 3.35vw, 13px);
      --panel-fs-md: clamp(13px, 3.6vw, 14px);
      --panel-fs-lg: clamp(14px, 3.95vw, 15px);
      --panel-fs-xl: clamp(15px, 4.25vw, 17px);
      --panel-fs-stat: clamp(17px, 5.1vw, 20px);
      --panel-fs-stat-rub: clamp(14px, 4.2vw, 17px);
      --panel-pad-compact: clamp(6px, 1.8vw, 8px) clamp(7px, 2.2vw, 10px);
      --panel-pad-stat: clamp(8px, 2.4vw, 10px);
`;

function getPanelFluidTypographyVars() {
  return PANEL_FLUID_TYPOGRAPHY_VARS;
}

function getMiniAppHeadScript() {
  return `
(function () {
  var KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
  var themeKeys = ${JSON.stringify(THEME_CSS_KEYS)};
  var manualLightTheme = ${JSON.stringify(MANUAL_LIGHT_THEME)};
  var manualDarkTheme = ${JSON.stringify(MANUAL_DARK_THEME)};

  function applyThemeParams(params) {
    if (!params) return;
    var root = document.documentElement;
    for (var key in themeKeys) {
      if (params[key]) {
        root.style.setProperty(themeKeys[key], params[key], "important");
      }
    }
  }

  function resolveMode() {
    var saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.colorScheme === "dark") return "dark";
    if (tg && tg.colorScheme === "light") return "light";
    return "light";
  }

  var mode = resolveMode();
  document.documentElement.setAttribute("data-app-theme", mode);
  applyThemeParams(mode === "dark" ? manualDarkTheme : manualLightTheme);
})();
`;
}

function getMiniAppStyles() {
  return `
    :root {
      --mini-vh: var(--tg-viewport-stable-height, var(--tg-viewport-height, 100dvh));
      --mini-vw: var(--tg-viewport-width, 100vw);
      --mini-pad-x: 12px;
      --mini-pad-top: max(6px, var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)));
      --mini-pad-bottom: max(10px, var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
      --panel-bottom-bar-space: calc(96px + env(safe-area-inset-bottom, 0px));
      --bg-dark: #152238;
      --app-bg-image-dark: url("/brand/background-dark.png");
${PANEL_FLUID_TYPOGRAPHY_VARS}
    }

    html[data-app-theme="light"] {
      --tg-theme-bg-color: ${MANUAL_LIGHT_THEME.bg_color} !important;
      --tg-theme-text-color: ${MANUAL_LIGHT_THEME.text_color} !important;
      --tg-theme-hint-color: ${MANUAL_LIGHT_THEME.hint_color} !important;
      --tg-theme-link-color: ${MANUAL_LIGHT_THEME.link_color} !important;
      --tg-theme-button-color: ${MANUAL_LIGHT_THEME.button_color} !important;
      --tg-theme-button-text-color: ${MANUAL_LIGHT_THEME.button_text_color} !important;
      --tg-theme-secondary-bg-color: ${MANUAL_LIGHT_THEME.secondary_bg_color} !important;
    }

    html[data-app-theme="dark"] {
      --tg-theme-bg-color: ${MANUAL_DARK_THEME.bg_color} !important;
      --tg-theme-text-color: ${MANUAL_DARK_THEME.text_color} !important;
      --tg-theme-hint-color: ${MANUAL_DARK_THEME.hint_color} !important;
      --tg-theme-link-color: ${MANUAL_DARK_THEME.link_color} !important;
      --tg-theme-button-color: ${MANUAL_DARK_THEME.button_color} !important;
      --tg-theme-button-text-color: ${MANUAL_DARK_THEME.button_text_color} !important;
      --tg-theme-secondary-bg-color: ${MANUAL_DARK_THEME.secondary_bg_color} !important;
    }

    html {
      overflow-x: hidden;
      max-width: 100%;
      overscroll-behavior-x: none;
      touch-action: manipulation;
      -ms-touch-action: manipulation;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body.mini-app-shell *,
    body.mini-app-shell *::before,
    body.mini-app-shell *::after {
      box-sizing: border-box;
    }

    body.mini-app-shell img,
    body.mini-app-shell video {
      max-width: 100%;
      height: auto;
    }

    body.mini-app-shell {
      touch-action: manipulation;
      -ms-touch-action: manipulation;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      scroll-padding-bottom: var(--panel-bottom-bar-space);
    }

    body.mini-app-shell input,
    body.mini-app-shell select,
    body.mini-app-shell textarea,
    body.mini-app-shell .draw-input {
      font-size: 16px !important;
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

    /* The doodle background drifts upwards, very slowly. Each loop moves it by
       exactly one tile - the tile is min(100vw, 760px) wide and both images are
       760x1280 - so the jump back to the start lands on the same picture and
       never shows. The layer is one tile taller than the screen so there is
       always something to slide into view. transform only: it is composited,
       with no repaint of a full-screen image on every frame. */
    body.mini-app-shell::before {
      --app-bg-tile-h: calc(min(100vw, 760px) * 1280 / 760);
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: calc(100% + var(--app-bg-tile-h));
      z-index: -1;
      background-color: var(--bg-active, var(--bg, #dbe8f8));
      background-image: var(--app-bg-active, var(--app-bg-image, url("/brand/background.jpg")));
      background-repeat: repeat-y;
      background-position: center top;
      background-size: min(100vw, 760px) auto;
      pointer-events: none;
      animation: app-bg-drift 160s linear infinite;
    }

    @keyframes app-bg-drift {
      from {
        transform: translate3d(0, 0, 0);
      }
      to {
        transform: translate3d(0, calc(-1 * var(--app-bg-tile-h)), 0);
      }
    }

    /* The wide-screen tiled backgrounds centre their strip with translateX,
       so their drift keeps it. */
    @keyframes app-bg-drift-strip {
      from {
        transform: translate3d(-50%, 0, 0);
      }
      to {
        transform: translate3d(-50%, calc(-1 * var(--app-bg-tile-h)), 0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body.mini-app-shell::before {
        animation: none;
      }
    }

    body.mini-app-shell.app-theme-dark {
      --bg-active: var(--bg-dark);
      --app-bg-active: var(--app-bg-image-dark);
    }

    body.mini-app-shell.app-theme-light {
      --bg-active: var(--bg, #dbe8f8);
      --app-bg-active: var(--app-bg-image, url("/brand/background.jpg"));
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
      padding-bottom: var(--panel-bottom-bar-space);
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
      width: 100%;
      max-width: 100%;
    }

    body.mini-app-shell .panel-bottom-bar {
      padding-left: max(16px, var(--mini-pad-x, 16px), env(safe-area-inset-left, 0px));
      padding-right: max(16px, var(--mini-pad-x, 16px), env(safe-area-inset-right, 0px));
    }

    body.mini-app-shell .panel-bottom-bar .quick-action {
      min-height: 64px;
      padding: 11px 8px;
    }

    body.mini-app-shell button.panel-sheet-close,
    body.mini-app-shell button.panel-sheet-backdrop {
      font-weight: 400;
      transform: none !important;
      filter: none !important;
      overflow: visible !important;
      box-sizing: border-box;
    }

    body.mini-app-shell button.panel-sheet-backdrop {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      min-height: 0 !important;
      max-height: none !important;
      height: 100% !important;
      border-radius: 0 !important;
      padding: 0 !important;
    }

    body.mini-app-shell button.panel-sheet-close {
      width: 32px !important;
      min-width: 32px !important;
      max-width: 32px !important;
      height: 32px !important;
      min-height: 32px !important;
      max-height: 32px !important;
      padding: 0 !important;
      flex-shrink: 0 !important;
    }

    body.mini-app-shell .draw-file-btn,
    body.mini-app-shell .draw-paste-btn {
      height: 38px;
      min-height: 38px;
      max-height: 38px;
      padding: 0 8px;
      line-height: 1;
      font-size: 13px;
      font-weight: 600;
    }

    body.mini-app-shell .quick-actions {
      overflow: hidden;
    }

    body.mini-app-shell .qa-label {
      font-size: var(--panel-fs-xs);
    }

    body.mini-app-shell .qa-icon svg {
      width: 20px;
      height: 20px;
    }

    body.mini-app-shell .card {
      padding: 12px;
      border-radius: 12px;
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

    body.mini-app-shell .card:not(.join-step-card):not(.winners-row):not(.winners-header):not(.winners-stat):not(.winners-viewer-banner),
    body.mini-app-shell img:not(.join-guide-img):not(.winners-avatar-img),
    body.mini-app-shell input,
    body.mini-app-shell select,
    body.mini-app-shell button:not(.theme-toggle-btn):not(.settings-action-btn):not(.winner-copy-btn):not(.join-btn):not(.panel-sheet-close):not(.panel-sheet-backdrop):not(.draw-submit):not(.draw-file-btn):not(.draw-paste-btn):not(.quick-action),
    body.mini-app-shell .history-list,
    body.mini-app-shell .history-card {
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      box-sizing: border-box;
    }

    body.mini-app-shell img.join-guide-img,
    body.mini-app-shell img.winners-avatar-img {
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      overflow: visible;
    }

    body.mini-app-shell .join-step-card,
    body.mini-app-shell .winners-row,
    body.mini-app-shell .winners-header,
    body.mini-app-shell .join-guide-img-wrap {
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    body.mini-app-shell .join-guide-img-wrap {
      overflow: hidden;
    }

    body.mini-app-shell .join-step-card,
    body.mini-app-shell .winners-row,
    body.mini-app-shell .winners-header {
      overflow: visible;
    }
    body.mini-app-shell .theme-toggle-btn {
      overflow: visible;
      max-width: 36px;
    }

    body.mini-app-shell .stats-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin: 0;
    }

    body.mini-app-shell .stat-card {
      padding: var(--panel-pad-stat);
      border-radius: 10px;
    }

    body.mini-app-shell .draw-history-title {
      margin: 0 0 8px;
    }

    body.mini-app-shell .history-list {
      gap: 8px;
    }

    body.mini-app-shell .history-card {
      padding: 10px;
    }
    body.mini-app-shell .history-card-active {
      overflow: visible;
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

    body.mini-app-shell .history-chips {
      grid-template-columns: 1fr 1fr;
    }

    body.mini-app-shell .history-chip {
      padding: var(--panel-pad-compact);
      gap: clamp(3px, 1vw, 5px);
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

    body.mini-app-shell .history-details summary {
      padding: clamp(8px, 2.2vw, 9px) clamp(9px, 2.5vw, 10px);
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
    body.mini-app-shell button.draw-submit {
      width: 100% !important;
      min-height: 48px;
      max-width: none;
      min-width: 0;
      overflow: visible !important;
      flex-shrink: 0;
    }

    body.mini-app-shell button:not(.settings-action-btn):not(.join-btn):not(.panel-sheet-close):not(.panel-sheet-backdrop):not(.draw-submit):not(.draw-file-btn):not(.draw-paste-btn):not(.quick-action) {
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

    body.mini-app-shell .draw-row-2 {
      gap: 10px;
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
  const THEME_KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
  const themeKeys = ${JSON.stringify(THEME_CSS_KEYS)};
  const manualLightTheme = ${JSON.stringify(MANUAL_LIGHT_THEME)};
  const manualDarkTheme = ${JSON.stringify(MANUAL_DARK_THEME)};
  let themeMode;

  function getInitialThemeMode() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    const mode = getTelegramDark() ? "dark" : "light";
    localStorage.setItem(THEME_KEY, mode);
    return mode;
  }

  function parseHexColor(value) {
    const raw = String(value || "").trim();
    if (!raw.startsWith("#")) return null;
    const hex = raw.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }

  function isColorDark(value) {
    const rgb = parseHexColor(value);
    if (!rgb) return false;
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return luminance < 0.5;
  }

  function applyThemeParams(params) {
    if (!params) return;
    const root = document.documentElement;
    for (const [key, cssVar] of Object.entries(themeKeys)) {
      if (params[key]) {
        root.style.setProperty(cssVar, params[key], "important");
      }
    }
  }

  function getTelegramDark() {
    if (tg?.colorScheme === "dark") return true;
    if (tg?.colorScheme === "light") return false;
    if (tg?.themeParams?.bg_color) {
      return isColorDark(tg.themeParams.bg_color);
    }
    return false;
  }

  function resolveDark() {
    return themeMode === "dark";
  }

  function updateToggleUi(isDark) {
    const btn = document.getElementById("themeToggleBtn");
    if (!btn) return;
    btn.title = isDark ? "Тема: тёмная" : "Тема: светлая";
    btn.setAttribute("aria-label", btn.title);
    btn.classList.toggle("is-dark-active", isDark);
  }

  function applyAppearance() {
    const isDark = resolveDark();
    document.documentElement.setAttribute("data-app-theme", isDark ? "dark" : "light");
    document.body.classList.toggle("app-theme-dark", isDark);
    document.body.classList.toggle("app-theme-light", !isDark);
    applyThemeParams(isDark ? manualDarkTheme : manualLightTheme);
    updateToggleUi(isDark);
  }

  function cycleTheme() {
    themeMode = themeMode === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, themeMode);
    applyAppearance();
  }

  function setupThemeToggle() {
    const btn = document.getElementById("themeToggleBtn");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", cycleTheme);
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
  }

  function enableShell() {
    themeMode = getInitialThemeMode();
    document.body.classList.add("mini-app-shell");
    applyAppearance();
    bindViewport();
    setupThemeToggle();
  }

  if (tg) {
    tg.ready();
    tg.expand();
    enableShell();
    tg.onEvent("themeChanged", () => {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved !== "light" && saved !== "dark") {
        themeMode = getTelegramDark() ? "dark" : "light";
        localStorage.setItem(THEME_KEY, themeMode);
      }
      applyAppearance();
    });
    ${authSession ? `
    if (tg.initData) {
      fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
        credentials: "same-origin",
      }).catch(function () {});
    }` : ""}
  } else {
    themeMode = getInitialThemeMode();
    setupThemeToggle();
    applyAppearance();
    if (${previewShell ? "true" : "false"}) {
      enableShell();
    }
  }
})();
`;
}

function renderThemeToggleButton() {
  return `<button type="button" class="theme-toggle-btn" id="themeToggleBtn" title="Переключить тему" aria-label="Переключить тему">
    <span class="theme-icon theme-icon-light" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></span>
    <span class="theme-icon theme-icon-dark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>
  </button>`;
}

function getPreviewDevStyles() {
  return `
    .preview-toolbar {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 12px;
    }
    .preview-toolbar .preview-nav {
      flex: 1;
      margin-bottom: 0;
    }
    .theme-toggle-btn {
      flex-shrink: 0;
      width: 36px;
      min-width: 36px;
      height: 36px;
      padding: 0;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      background: var(--tg-theme-secondary-bg-color, #fff);
      color: var(--tg-theme-button-color, #325fff);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 400;
    }
    .theme-toggle-btn:hover,
    .theme-toggle-btn:focus-visible {
      filter: brightness(1.04);
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
    body.app-theme-dark .theme-toggle-btn .theme-icon-light {
      display: none;
    }
    body.app-theme-dark .theme-toggle-btn .theme-icon-dark {
      display: block;
    }
  `;
}

const { JOIN_FLOW_STEPS, JOIN_FLOW_STEP_LABELS } = require("./join-flow-steps");

function getJoinFlowStyles() {
  return `
    body.join-flow.mini-app-shell {
      margin: 0;
      max-width: 100%;
      width: 100%;
      --join-pad-left: max(14px, var(--mini-pad-x), env(safe-area-inset-left, 0px));
      --join-pad-right: max(14px, var(--mini-pad-x), env(safe-area-inset-right, 0px));
      padding: var(--mini-pad-top) 0 var(--mini-pad-bottom);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-x: clip;
      box-sizing: border-box;
    }

    body.join-flow.mini-app-shell h1,
    body.join-flow.mini-app-shell h2,
    body.join-flow.mini-app-shell p,
    body.join-flow.mini-app-shell button,
    body.join-flow.mini-app-shell input,
    body.join-flow.mini-app-shell a,
    body.join-flow.mini-app-shell span {
      font-family: inherit;
    }

    body.join-flow .join-container {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      overflow-x: clip;
      padding-left: var(--join-pad-left);
      padding-right: var(--join-pad-right);
    }

    body.join-flow .join-step-body {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow-x: hidden;
    }

    /* A stepper in the same panel as the cards, so it reads as part of the
       flow rather than a line floating over the doodles. It has as many
       columns as the draw has stages (--join-progress-count, set on the
       element). The track runs from the centre of the first node to the centre
       of the last: with no column gap each column is 1/count of the content
       box, so the centres sit half a column in from either side. */
    body.join-flow .join-progress {
      --join-progress-pad-x: 4px;
      --join-progress-pad-top: 10px;
      --join-progress-node: 22px;
      position: relative;
      margin-bottom: 12px;
      padding: var(--join-progress-pad-top) var(--join-progress-pad-x) 8px;
      border-radius: 16px;
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #fff) 80%, transparent);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      box-shadow: 0 8px 24px rgba(27, 45, 94, 0.06);
    }

    body.join-flow .join-progress-track {
      position: absolute;
      top: calc(var(--join-progress-pad-top) + var(--join-progress-node) / 2 - 1.5px);
      left: calc(var(--join-progress-pad-x) + (100% - 2 * var(--join-progress-pad-x)) / (2 * var(--join-progress-count, 4)));
      right: calc(var(--join-progress-pad-x) + (100% - 2 * var(--join-progress-pad-x)) / (2 * var(--join-progress-count, 4)));
      height: 3px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      overflow: hidden;
    }

    body.join-flow .join-progress-fill {
      position: relative;
      height: 100%;
      width: 0;
      border-radius: inherit;
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 65%, #fff),
        var(--tg-theme-button-color, #325fff)
      );
      transition: width 0.55s cubic-bezier(0.22, 0.61, 0.36, 1);
      overflow: hidden;
    }

    /* A soft highlight running along the filled part now and then. */
    body.join-flow .join-progress-fill::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 45%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
      transform: translateX(-100%);
      animation: join-progress-shimmer 3.2s ease-in-out infinite;
    }

    @keyframes join-progress-shimmer {
      0% {
        transform: translateX(-100%);
      }
      55%,
      100% {
        transform: translateX(225%);
      }
    }

    body.join-flow .join-progress-dots {
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--join-progress-count, 4), minmax(0, 1fr));
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    body.join-flow .join-progress-dot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }

    /* Opaque, so the track passes behind the circle rather than through it. */
    /* flex: none and the min sizes are not decoration. On phones (WebKit) the
       node in this column flexbox was shrunk by a pixel or two to fit the grid
       row, and the circle came out cut flat at the bottom. */
    body.join-flow .join-progress-node {
      position: relative;
      display: grid;
      place-items: center;
      flex: none;
      width: var(--join-progress-node);
      height: var(--join-progress-node);
      min-width: var(--join-progress-node);
      min-height: var(--join-progress-node);
      box-sizing: border-box;
      border-radius: 999px;
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 40%, transparent);
      color: var(--tg-theme-hint-color, #65708a);
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      transition:
        background-color 0.3s ease,
        border-color 0.3s ease,
        color 0.3s ease,
        box-shadow 0.3s ease,
        transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    body.join-flow .join-progress-num,
    body.join-flow .join-progress-check {
      grid-area: 1 / 1;
      transition:
        opacity 0.25s ease,
        transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    body.join-flow .join-progress-check {
      width: 12px;
      height: 12px;
      opacity: 0;
      transform: scale(0.4);
    }

    body.join-flow .join-progress-label {
      flex: none;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 10.5px;
      font-weight: 600;
      line-height: 1.25;
      color: var(--tg-theme-hint-color, #65708a);
      transition: color 0.3s ease;
    }

    body.join-flow .join-progress-dot.is-active .join-progress-node {
      border-color: var(--tg-theme-button-color, #325fff);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 16%, var(--tg-theme-secondary-bg-color, #fff));
      color: var(--tg-theme-button-color, #325fff);
      transform: scale(1.08);
    }

    /* The current step breathes: a thin ring widening and fading out. */
    body.join-flow .join-progress-dot.is-active:not(.is-done) .join-progress-node::after {
      content: "";
      position: absolute;
      inset: -4px;
      border-radius: inherit;
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 60%, transparent);
      opacity: 0;
      pointer-events: none;
      animation: join-progress-pulse 2.4s ease-out infinite;
    }

    @keyframes join-progress-pulse {
      0% {
        opacity: 0.6;
        transform: scale(0.85);
      }
      100% {
        opacity: 0;
        transform: scale(1.3);
      }
    }

    body.join-flow .join-progress-dot.is-done .join-progress-node {
      border-color: var(--tg-theme-button-color, #325fff);
      background: var(--tg-theme-button-color, #325fff);
      color: var(--tg-theme-button-text-color, #fff);
      transform: none;
    }

    body.join-flow .join-progress-dot.is-done .join-progress-num {
      opacity: 0;
      transform: scale(0.4);
    }

    body.join-flow .join-progress-dot.is-done .join-progress-check {
      opacity: 1;
      transform: none;
    }

    body.join-flow .join-progress-dot.is-done .join-progress-label {
      color: color-mix(in srgb, var(--tg-theme-text-color, #151a2d) 70%, var(--tg-theme-hint-color, #65708a));
    }

    body.join-flow .join-progress-dot.is-active .join-progress-label {
      color: var(--tg-theme-text-color, #151a2d);
      font-weight: 700;
    }

    body.join-flow.app-theme-dark .join-progress {
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #232f42) 82%, transparent);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    }

    @media (prefers-reduced-motion: reduce) {
      body.join-flow .join-progress-fill::after,
      body.join-flow .join-progress-dot.is-active:not(.is-done) .join-progress-node::after {
        animation: none;
      }
    }

    body.join-flow .join-steps-viewport {
      position: relative;
      min-height: 180px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      /* clip, not hidden: hidden turns the viewport into a vertical scroll box,
         and a taller card sliding out would flash a scrollbar mid-swipe.
         hidden stays first as the fallback for engines without clip. */
      overflow-x: hidden;
      overflow-x: clip;
    }

    body.join-flow .join-step-card {
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(27, 45, 94, 0.06);
      /* A card waits off to the side it will arrive from. --join-step-dir is
         set by showStep: 1 going forward, -1 going back, 0 on the first show. */
      opacity: 0;
      transform: translateX(calc(28% * var(--join-step-dir, 1)));
      transition:
        opacity 0.34s cubic-bezier(0.22, 0.61, 0.36, 1),
        transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
      pointer-events: none;
      visibility: hidden;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    body.join-flow .join-step-card.is-active {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
      visibility: visible;
      position: relative;
    }

    body.join-flow .join-step-card.is-leaving {
      opacity: 0;
      /* Visible while it slides out. The base rule hides cards outright, which
         is why the old 4px nudge here was never actually seen by anyone. */
      visibility: visible;
      transform: translateX(calc(-28% * var(--join-step-dir, 1)));
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      body.join-flow .join-step-card,
      body.join-flow .join-step-card.is-leaving {
        transition: none;
        transform: none;
      }
    }

    /* A faint light in the top-right corner of every card. It lives on a
       pseudo-element behind the content (isolation keeps z-index -1 inside the
       card) and only its opacity moves, so it is composited rather than
       repainted and never reaches outside the card. No overflow: hidden on the
       card - that would clip the fixed chance modal and the focus rings. */
    body.join-flow .join-step-card {
      isolation: isolate;
    }

    body.join-flow .join-step-card::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      pointer-events: none;
      background: radial-gradient(
        120% 90% at 100% 0%,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 14%, transparent) 0%,
        transparent 62%
      );
      animation: join-card-light 9s ease-in-out infinite alternate;
    }

    body.join-flow.app-theme-dark .join-step-card::before {
      background: radial-gradient(
        120% 90% at 100% 0%,
        rgba(150, 180, 255, 0.16) 0%,
        transparent 62%
      );
    }

    /* Opacity only. It used to scale from the corner as well, but a transformed
       pseudo-element counts towards scrollable overflow even where it is fully
       transparent: on the last button it reached past the bottom of
       .join-step-body, which scrolls (overflow-y: auto), and a scrollbar
       appeared down the right side of the card. */
    @keyframes join-card-light {
      from {
        opacity: 0.7;
      }
      to {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body.join-flow .join-step-card::before {
        animation: none;
      }
    }

    /* The same corner light on buttons, fainter still. On the blue buttons the
       spot is a deeper blue, since a pale light on a pale button would not
       show; on the dark ones it is brighter. Gradient and disabled buttons keep
       their own look. position: relative anchors the pseudo-element to the
       button, and without offsets it does not move the button at all. */
    body.join-flow .join-btn-primary:not(:disabled):not(.join-btn-locked),
    body.join-flow .join-btn-secondary,
    body.join-flow .join-btn-outline {
      position: relative;
      isolation: isolate;
    }

    body.join-flow .join-btn-primary:not(:disabled):not(.join-btn-locked)::before,
    body.join-flow .join-btn-secondary::before,
    body.join-flow .join-btn-outline::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      pointer-events: none;
      animation: join-card-light 7s ease-in-out infinite alternate;
    }

    body.join-flow .join-btn-primary:not(:disabled):not(.join-btn-locked)::before {
      background: radial-gradient(90% 140% at 100% 0%, rgba(20, 45, 150, 0.22) 0%, transparent 60%);
    }

    body.join-flow .join-btn-secondary::before,
    body.join-flow .join-btn-outline::before {
      background: radial-gradient(
        90% 140% at 100% 0%,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 10%, transparent) 0%,
        transparent 60%
      );
    }

    body.join-flow.app-theme-dark .join-btn-secondary::before,
    body.join-flow.app-theme-dark .join-btn-outline::before {
      background: radial-gradient(90% 140% at 100% 0%, rgba(170, 195, 255, 0.14) 0%, transparent 60%);
    }

    /* The outline answers ("Я не реферал", "Я не зарегистрирован", "Продолжить")
       sit below the main action and should not draw the eye like it does, so
       their light is roughly half as strong. Declared after the shared rules
       above, at the same specificity, so these win. */
    body.join-flow .join-btn-outline::before {
      background: radial-gradient(
        90% 140% at 100% 0%,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 6%, transparent) 0%,
        transparent 60%
      );
    }

    body.join-flow.app-theme-dark .join-btn-outline::before {
      background: radial-gradient(90% 140% at 100% 0%, rgba(170, 195, 255, 0.08) 0%, transparent 60%);
    }

    @media (prefers-reduced-motion: reduce) {
      body.join-flow .join-btn-primary::before,
      body.join-flow .join-btn-secondary::before,
      body.join-flow .join-btn-outline::before {
        animation: none;
      }
    }

    body.join-flow .join-step-head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
    }

    /* The hint colour Telegram hands a dark theme is too close to the card to
       show at 14%; a lighter grey keeps the divider faint but actually there. */
    body.join-flow.app-theme-dark .join-step-head {
      border-bottom-color: color-mix(in srgb, #9aa6bd 16%, transparent);
    }

    /* Sets the two "not me" answers apart from the main action above them,
       with the same faint rule as under the card header. */
    body.join-flow .join-stack-divider {
      height: 1px;
      margin: 2px 0;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
    }

    body.join-flow.app-theme-dark .join-stack-divider {
      background: color-mix(in srgb, #9aa6bd 16%, transparent);
    }

    body.join-flow .join-step-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
      color: var(--tg-theme-button-color, #325fff);
    }

    body.join-flow .join-step-icon svg {
      width: 22px;
      height: 22px;
      display: block;
    }

    body.join-flow .join-step-badge {
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--tg-theme-hint-color, #65708a);
      margin-bottom: 4px;
    }

    body.join-flow .join-step-title {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      line-height: 1.25;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-step-text {
      margin: 0 0 14px;
      font-size: 14px;
      line-height: 1.55;
      color: var(--tg-theme-hint-color, #65708a);
    }

    /* The main text colour rather than literal white: white is what it looks
       like on a dark card, and it would vanish on a light one. */
    body.join-flow #walletIntroText {
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow.app-theme-dark #walletIntroText {
      color: var(--tg-theme-text-color, #eef1f7);
    }

    body.join-flow #walletIntroText b {
      font-weight: 800;
    }

    body.join-flow .join-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    body.join-flow .join-step-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    body.join-flow .join-btn-ghost {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: none;
      color: var(--tg-theme-hint-color, #65708a);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 10px;
      transition: color 0.18s ease, background 0.18s ease;
    }

    body.join-flow .join-btn-outline {
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #fff) 88%, var(--tg-theme-hint-color, #65708a));
      color: var(--tg-theme-text-color, #151a2d);
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 60%, transparent);
      font-weight: 600;
    }

    body.join-flow .join-btn-outline:active {
      transform: scale(0.98);
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 10%, var(--tg-theme-secondary-bg-color, #fff));
    }

    body.join-flow .join-guide-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 2px 0 6px;
      margin: -4px 0 2px;
      border: none;
      background: none;
      color: var(--tg-theme-text-color, #fff);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    body.join-flow .join-guide-link:active {
      opacity: 0.82;
    }

    /* Between the id field and "Проверить ID" now. The negative top margin was
       for sitting under the project link and would overlap the field here. */
    body.join-flow #registrationProjectIdMode .join-guide-link {
      /* Pulls up against the field: its 12px bottom margin still applies here
         (.join-trc20-field is declared after the compact override and wins),
         and the stack adds its own 10px gap on top of that. */
      margin: -18px 0 6px;
      padding: 2px 0 4px;
    }

    /* "ID на проекте: [поле]" on one line. Scoped to the id step so the wallet
       field keeps its label above. The colon comes from CSS because the label
       text is swapped per brand by applyProjectIdInputConfig and none of the
       texts carry one - this way every brand gets exactly one. */
    body.join-flow #registrationProjectIdMode .join-trc20-field-compact {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    body.join-flow #registrationProjectIdMode .join-field-label {
      margin: 0;
      flex-shrink: 0;
      white-space: nowrap;
      font-size: 16px;
    }

    body.join-flow #registrationProjectIdMode .join-field-label::after {
      content: ":";
    }

    body.join-flow #registrationProjectIdMode .join-id-input-row {
      flex: 1;
      width: auto;
      min-width: 0;
    }

    /* A plain flex item inside the bordered row, not an overlay: the input
       shrinks to make room, so a long pasted id never runs under the icon. */
    body.join-flow .join-id-paste-btn {
      flex: 0 0 44px;
      width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--tg-theme-link-color, #325fff);
      cursor: pointer;
    }

    body.join-flow .join-id-paste-btn svg {
      width: 20px;
      height: 20px;
    }

    body.join-flow .join-id-paste-btn:active {
      opacity: 0.7;
    }

    body.join-flow .join-btn-ghost:active {
      transform: scale(0.99);
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 8%, transparent);
      color: var(--tg-theme-link-color, #325fff);
    }

    body.join-flow .join-btn-guide {
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 10%, var(--tg-theme-secondary-bg-color, #fff));
      color: var(--tg-theme-link-color, #325fff);
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 34%, transparent);
      box-shadow: none;
      font-size: 14px;
      padding: 12px 14px;
    }

    body.join-flow .join-btn-guide[aria-expanded="true"] {
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 18%, var(--tg-theme-secondary-bg-color, #fff));
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 52%, transparent);
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-trc20-field-compact {
      margin-bottom: 0;
    }

    body.join-flow .join-id-input-row {
      display: flex;
      align-items: stretch;
      width: 100%;
      min-width: 0;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 24%, transparent);
      border-radius: 12px;
      overflow: hidden;
      background: var(--tg-theme-bg-color, #f5f8ff);
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }

    body.join-flow .join-id-input-row:focus-within {
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 50%, transparent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 14%, transparent);
    }

    body.join-flow .join-id-prefix {
      display: inline-flex;
      align-items: center;
      padding: 0 0 0 14px;
      font-size: 16px;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
      flex-shrink: 0;
      user-select: none;
    }

    body.join-flow .join-input.join-input-id {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      border: none;
      border-radius: 0;
      box-shadow: none;
      padding-left: 6px;
      letter-spacing: 0.04em;
      font-weight: 700;
    }

    body.join-flow .join-input.join-input-id:focus {
      box-shadow: none;
    }

    /* Every brand now hints "Введите ID сюда". The #XXXXX field types its
       value bold and spaced; the hint must not be, or it reads as an id. */
    body.join-flow .join-input.join-input-id::placeholder {
      font-weight: 400;
      letter-spacing: normal;
      color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 72%, var(--tg-theme-text-color, #151a2d));
      opacity: 1;
    }

    body.join-flow.app-theme-dark .join-input.join-input-id::placeholder {
      color: color-mix(in srgb, var(--tg-theme-hint-color, #8b95a8) 78%, var(--tg-theme-bg-color, #141a24));
    }

    body.join-flow .join-id-input-row-no-prefix .join-input.join-input-id {
      padding-left: 14px;
      letter-spacing: 0.01em;
      font-size: 15px;
    }

    body.join-flow .join-input.join-input-id.join-input-id-pokerdom {
      font-weight: 400;
      letter-spacing: normal;
      font-family: inherit;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-input.join-input-id.join-input-id-pokerdom::placeholder {
      color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 72%, var(--tg-theme-text-color, #151a2d));
      font-weight: 400;
      opacity: 1;
    }

    body.join-flow .join-field-status {
      margin: 0;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
      text-align: center;
      border-radius: 10px;
    }

    body.join-flow .join-field-status-error {
      color: #ff8a80;
      background: color-mix(in srgb, #a12626 16%, var(--tg-theme-secondary-bg-color, #232f42));
      border: 1px solid color-mix(in srgb, #e53935 28%, transparent);
    }

    body.join-flow .join-field-status-loading {
      color: var(--tg-theme-hint-color, #65708a);
      background: transparent;
      padding: 4px 0;
    }

    body.join-flow .join-btn-primary.is-done,
    body.join-flow .join-btn-secondary.is-done {
      background: color-mix(in srgb, #1f6a3c 16%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, #1f6a3c 45%, transparent);
      color: #3ecf7a;
      opacity: 1;
      cursor: default;
      box-shadow: none;
    }

    body.join-flow .join-btn {
      max-width: 100%;
      min-width: 0;
    }

    body.join-flow .join-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px 16px;
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.18s ease, filter 0.18s ease, background 0.18s ease;
    }

    body.join-flow .join-btn:active {
      transform: scale(0.98);
    }

    body.join-flow .join-btn-primary:not(:disabled) {
      background: linear-gradient(135deg, color-mix(in srgb, var(--tg-theme-button-color, #325fff) 88%, #fff) 0%, var(--tg-theme-button-color, #325fff) 100%);
      color: var(--tg-theme-button-text-color, #fff);
      box-shadow: none;
      border: 1px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 55%, transparent);
    }

    body.join-flow .join-btn-primary:disabled,
    body.join-flow .join-btn-primary.join-btn-locked {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, var(--tg-theme-secondary-bg-color, #232f42));
      color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 88%, transparent);
      border: 1.5px dashed color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 42%, transparent);
      box-shadow: none;
      opacity: 1;
    }

    body.join-flow .join-btn-secondary {
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 10%, var(--tg-theme-secondary-bg-color, #fff));
      color: var(--tg-theme-link-color, #325fff);
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 38%, transparent);
    }

    body.join-flow .join-btn-secondary.is-loading {
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 16%, var(--tg-theme-secondary-bg-color, #fff));
      border-color: var(--tg-theme-button-color, #325fff);
      color: var(--tg-theme-text-color, #eef1f7);
      opacity: 1;
      cursor: wait;
    }

    body.join-flow .join-btn-primary.is-loading {
      background: linear-gradient(135deg, color-mix(in srgb, var(--tg-theme-button-color, #325fff) 72%, #fff) 0%, var(--tg-theme-button-color, #325fff) 100%);
      border-color: var(--tg-theme-button-color, #325fff);
      color: var(--tg-theme-button-text-color, #fff);
      opacity: 0.92;
      cursor: wait;
      box-shadow: none;
    }

    body.join-flow .join-btn-secondary.is-done {
      background: color-mix(in srgb, #1f6a3c 16%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, #1f6a3c 45%, transparent);
      color: #3ecf7a;
      opacity: 1;
      cursor: default;
    }

    body.join-flow .join-btn-secondary:disabled:not(.is-loading):not(.is-done) {
      opacity: 0.72;
      cursor: not-allowed;
    }

    body.join-flow .join-btn-label {
      min-width: 0;
    }

    body.join-flow .join-btn-ico {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      display: block;
    }

    body.join-flow .join-btn-spinner {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      animation: join-btn-spin 0.75s linear infinite;
    }

    @keyframes join-btn-spin {
      to { transform: rotate(360deg); }
    }

    body.join-flow .join-input {
      width: 100%;
      max-width: 100%;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 24%, transparent);
      border-radius: 12px;
      padding: 13px 14px;
      font-size: 16px;
      margin: 0 0 12px;
      background: var(--tg-theme-bg-color, #f5f8ff);
      color: var(--tg-theme-text-color, #151a2d);
      box-sizing: border-box;
      word-break: break-all;
    }

    body.join-flow .join-input:focus {
      outline: none;
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 50%, transparent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 14%, transparent);
    }

    body.join-flow .join-btn:disabled {
      cursor: not-allowed;
      transform: none;
    }

    body.join-flow .join-btn.is-loading {
      cursor: wait;
    }

    body.join-flow .preview-toolbar {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    body.join-flow .join-ref-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      font-size: 13px;
      line-height: 1.45;
      padding: 14px 16px;
      border-radius: 14px;
      margin: 2px 0 0;
    }

    body.join-flow .join-ref-status-icon {
      width: 36px;
      height: 36px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    body.join-flow .join-ref-status-icon svg {
      width: 20px;
      height: 20px;
      display: block;
    }

    body.join-flow .join-ref-status-text {
      font-weight: 600;
      max-width: 260px;
    }

    body.join-flow .join-ref-status-error .join-ref-status-text {
      white-space: normal;
      max-width: 280px;
    }

    body.join-flow .join-btn-secondary.join-btn-locked {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, var(--tg-theme-secondary-bg-color, #232f42));
      color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 88%, transparent);
      border: 1.5px dashed color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 42%, transparent);
      box-shadow: none;
      opacity: 1;
      cursor: not-allowed;
    }

    body.join-flow .join-ref-status-error {
      background: color-mix(in srgb, #a12626 12%, var(--tg-theme-secondary-bg-color, #fff));
      color: #c62828;
      border: 1px solid color-mix(in srgb, #ffcaca 45%, transparent);
    }

    body.join-flow .join-ref-status-error .join-ref-status-icon {
      background: color-mix(in srgb, #a12626 14%, transparent);
      color: #e53935;
    }

    body.join-flow .join-ref-status-ok {
      background: color-mix(in srgb, #1f6a3c 12%, var(--tg-theme-secondary-bg-color, #fff));
      color: #1f6a3c;
      border: 1px solid color-mix(in srgb, #a7e6bc 45%, transparent);
    }

    body.join-flow .join-ref-status-ok .join-ref-status-icon {
      background: color-mix(in srgb, #1f6a3c 14%, transparent);
      color: #2e9d5a;
    }

    body.join-flow .join-network-warning {
      margin: 0 0 12px;
      color: #c0262d;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.45;
    }

    /* Without its pale plate the warning sits straight on the card, where the
       light-theme red is unreadable on a dark background. */
    body.join-flow.app-theme-dark .join-network-warning {
      color: #ff8f8f;
    }

    body.join-flow .join-network-warning b {
      font-weight: 800;
    }

    body.join-flow .join-trc20-field {
      margin-bottom: 12px;
    }

    body.join-flow .join-trc20-submit {
      width: 100%;
      margin: 0;
    }

    body.join-flow .join-field-label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-input-row {
      display: flex;
      gap: 8px;
      align-items: stretch;
      width: 100%;
      min-width: 0;
    }

    body.join-flow .join-input.join-input-trc20 {
      flex: 1 1 auto;
      margin: 0;
      min-width: 0;
    }

    body.join-flow .join-paste-btn {
      flex: 0 0 48px;
      width: 48px;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 38%, transparent);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 10%, var(--tg-theme-secondary-bg-color, #fff));
      color: var(--tg-theme-link-color, #325fff);
      cursor: pointer;
      padding: 0;
      transition: transform 0.18s ease, filter 0.18s ease;
    }

    body.join-flow .join-paste-btn:active {
      transform: scale(0.96);
    }

    body.join-flow .join-guide-heading {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-guide {
      margin-bottom: 14px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
    }

    /* The main text colour, not the hint grey: these lines are the
       instructions themselves, and grey was hard to read on the dark sheet. */
    body.join-flow .join-guide-step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--tg-theme-text-color, #151a2d);
      margin: 0 0 8px;
    }

    body.join-flow.app-theme-dark .join-guide-step {
      color: var(--tg-theme-text-color, #eef1f7);
    }

    body.join-flow .join-guide-step-num {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
      color: var(--tg-theme-button-color, #325fff);
      flex-shrink: 0;
    }

    body.join-flow .join-guide-img-wrap {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      border-radius: 10px;
      margin: 0 0 12px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 16%, transparent);
      background: var(--tg-theme-bg-color, #f5f8ff);
      line-height: 0;
    }

    body.join-flow .join-guide img.join-guide-img {
      width: 100%;
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      object-fit: contain;
      object-position: center top;
    }

    body.join-flow .join-done-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 8px 4px 4px;
    }

    /* The mark on the last step. Without .is-playing it simply stands there
       finished, which is also what reduced motion gets. With it, once per
       visit: the disc pops in as the card arrives, the tick draws itself, two
       rings and a few sparks go out, and the title rises in. Afterwards only a
       faint halo breathes. Everything sits in one grid cell, so the layers
       stack on the centre without any absolute offsets. */
    body.join-flow .join-done-mark {
      --join-done-green: #25ad5f;
      --join-done-green-hi: #4ddb8f;
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      margin: 0 auto 8px;
    }

    body.join-flow .join-done-mark > span {
      grid-area: 1 / 1;
    }

    body.join-flow .join-done-mark-disc {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 999px;
      background: linear-gradient(150deg, var(--join-done-green-hi) 0%, var(--join-done-green) 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 10px 24px color-mix(in srgb, var(--join-done-green) 30%, transparent);
    }

    body.join-flow .join-done-mark-disc svg {
      width: 100%;
      height: 100%;
    }

    body.join-flow .join-done-mark-tick {
      stroke: #fff;
      stroke-width: 4.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 0;
    }

    body.join-flow .join-done-mark-halo {
      width: 86px;
      height: 86px;
      border-radius: 999px;
      background: radial-gradient(circle, color-mix(in srgb, var(--join-done-green-hi) 30%, transparent) 0%, transparent 70%);
      animation: join-done-halo 3.2s ease-in-out infinite alternate;
    }

    body.join-flow .join-done-mark-wave {
      width: 64px;
      height: 64px;
      box-sizing: border-box;
      border-radius: 999px;
      border: 2px solid color-mix(in srgb, var(--join-done-green-hi) 60%, transparent);
      opacity: 0;
    }

    /* A zero-size point on the centre; each spark is turned to its own angle
       and flies out along it. */
    body.join-flow .join-done-mark-sparks {
      position: relative;
      width: 0;
      height: 0;
    }

    body.join-flow .join-done-mark-sparks i {
      position: absolute;
      left: 0;
      top: 0;
    }

    body.join-flow .join-done-mark-sparks i::before {
      content: "";
      position: absolute;
      left: -3px;
      top: -3px;
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--join-done-green-hi);
      opacity: 0;
    }

    body.join-flow .join-done-mark-sparks i:nth-child(even)::before {
      left: -2px;
      top: -2px;
      width: 4px;
      height: 4px;
      background: var(--tg-theme-button-color, #325fff);
    }

    body.join-flow .join-done-mark-sparks i:nth-child(1) { transform: rotate(0deg); }
    body.join-flow .join-done-mark-sparks i:nth-child(2) { transform: rotate(45deg); }
    body.join-flow .join-done-mark-sparks i:nth-child(3) { transform: rotate(90deg); }
    body.join-flow .join-done-mark-sparks i:nth-child(4) { transform: rotate(135deg); }
    body.join-flow .join-done-mark-sparks i:nth-child(5) { transform: rotate(180deg); }
    body.join-flow .join-done-mark-sparks i:nth-child(6) { transform: rotate(225deg); }
    body.join-flow .join-done-mark-sparks i:nth-child(7) { transform: rotate(270deg); }
    body.join-flow .join-done-mark-sparks i:nth-child(8) { transform: rotate(315deg); }

    body.join-flow .join-done-mark.is-playing .join-done-mark-disc {
      animation: join-done-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.18s both;
    }

    body.join-flow .join-done-mark.is-playing .join-done-mark-tick {
      animation: join-done-draw 0.42s cubic-bezier(0.65, 0, 0.35, 1) 0.5s both;
    }

    body.join-flow .join-done-mark.is-playing .join-done-mark-wave {
      animation: join-done-wave 1s cubic-bezier(0.2, 0.6, 0.35, 1) 0.42s both;
    }

    body.join-flow .join-done-mark.is-playing .join-done-mark-wave-late {
      animation-delay: 0.64s;
    }

    body.join-flow .join-done-mark.is-playing .join-done-mark-sparks i::before {
      animation: join-done-spark 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) 0.52s both;
    }

    body.join-flow .join-done-mark.is-playing + .join-done-title {
      animation: join-done-rise 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) 0.6s both;
    }

    @keyframes join-done-pop {
      from {
        opacity: 0;
        transform: scale(0.3);
      }
      60% {
        opacity: 1;
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes join-done-draw {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }

    @keyframes join-done-wave {
      0% {
        opacity: 0;
        transform: scale(1);
      }
      12% {
        opacity: 0.75;
      }
      100% {
        opacity: 0;
        transform: scale(1.75);
      }
    }

    @keyframes join-done-spark {
      0% {
        opacity: 0;
        transform: translateY(-28px) scale(0.4);
      }
      25% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: translateY(-50px) scale(1);
      }
    }

    @keyframes join-done-rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @keyframes join-done-halo {
      from {
        opacity: 0.5;
        transform: scale(0.94);
      }
      to {
        opacity: 1;
        transform: scale(1.06);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body.join-flow .join-done-mark-halo,
      body.join-flow .join-done-mark.is-playing .join-done-mark-disc,
      body.join-flow .join-done-mark.is-playing .join-done-mark-tick,
      body.join-flow .join-done-mark.is-playing .join-done-mark-wave,
      body.join-flow .join-done-mark.is-playing .join-done-mark-sparks i::before,
      body.join-flow .join-done-mark.is-playing + .join-done-title {
        animation: none;
      }
    }

    body.join-flow .join-done-badge {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-done-title {
      margin: 0 0 16px;
      font-size: 22px;
      line-height: 1.25;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-done-sub {
      margin: 0 0 16px;
      font-size: 14px;
      line-height: 1.5;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-done-stats {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 12px;
      padding: 12px 10px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #eef1f7) 88%, transparent);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
    }

    body.join-flow .join-done-stat-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 4px;
      min-width: 0;
    }

    body.join-flow .join-done-stat-label {
      font-size: 10px;
      line-height: 1.2;
      min-height: 12px;
      color: var(--tg-theme-hint-color, #65708a);
      text-align: center;
      white-space: nowrap;
    }

    body.join-flow .join-done-stat-label-chance {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-height: 12px;
    }

    body.join-flow .join-done-stat-label-text {
      line-height: 1.2;
    }

    body.join-flow .join-done-info-btn {
      width: 14px;
      height: 14px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 16%, transparent);
      color: var(--tg-theme-hint-color, #65708a);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body.join-flow .join-done-info-btn svg {
      width: 12px;
      height: 12px;
      display: block;
    }

    body.join-flow .join-done-info-btn:active {
      transform: scale(0.92);
      opacity: 0.85;
    }

    body.join-flow .join-done-stat-value {
      font-size: 17px;
      line-height: 1.15;
      min-height: 20px;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
      text-align: center;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body.join-flow .join-done-stat-value-accent {
      color: var(--tg-theme-link-color, #2d49cc);
    }

    /* The chance figure in blues that slowly flow through it. The gradient
       reads c0 c1 c2 c1 c0, so one tile ends on the colour the next begins
       with, and sliding it by a whole tile per loop never shows a seam. Only
       one short line of text is repainted. Without background-clip: text the
       plain link colour above stays. */
    @supports ((-webkit-background-clip: text) or (background-clip: text)) {
      body.join-flow .join-done-stat-value-accent {
        background-image: linear-gradient(
          100deg,
          #2d5bff 0%,
          #1da1f2 25%,
          #5b7cff 50%,
          #1da1f2 75%,
          #2d5bff 100%
        );
        background-size: 200% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
        animation: join-chance-flow 4.5s linear infinite;
      }

      body.join-flow.app-theme-dark .join-done-stat-value-accent {
        background-image: linear-gradient(
          100deg,
          #6f9bff 0%,
          #8fe3ff 25%,
          #b3c3ff 50%,
          #8fe3ff 75%,
          #6f9bff 100%
        );
      }
    }

    @keyframes join-chance-flow {
      from {
        background-position: 0% 50%;
      }
      to {
        background-position: 200% 50%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body.join-flow .join-done-stat-value-accent {
        animation: none;
      }
    }

    body.join-flow .join-done-stat-value-timer {
      color: var(--tg-theme-text-color, #151a2d);
      font-variant-numeric: tabular-nums;
    }

    body.join-flow .join-done-info-modal {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px 16px;
    }

    body.join-flow .join-done-info-modal.hidden {
      display: none !important;
    }

    body.join-flow .join-done-info-backdrop {
      position: absolute;
      inset: 0;
      border: 0;
      padding: 0;
      background: rgba(8, 12, 24, 0.55);
      cursor: pointer;
    }

    body.join-flow .join-done-info-card {
      position: relative;
      z-index: 1;
      width: min(100%, 340px);
      padding: 18px 16px 16px;
      border-radius: 16px;
      background: var(--tg-theme-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
    }

    body.join-flow .join-done-info-title {
      margin: 0 0 10px;
      font-size: 16px;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-done-info-text {
      margin: 0 0 14px;
      font-size: 14px;
      line-height: 1.55;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-done-info-text b {
      color: var(--tg-theme-text-color, #151a2d);
      font-weight: 700;
    }

    body.join-flow .join-done-info-close {
      width: 100%;
    }

    body.join-flow .join-done-participants {
      width: 100%;
      margin: 0 0 14px;
      text-align: left;
    }

    /* The two reminders on the done step, as one quiet block: plain icons with
       no tile behind them, smaller type, no card per line. They are worth
       reading once, not worth a third of the screen. */
    body.join-flow .join-done-tips {
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 2px 0 14px;
      padding: 10px 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 8%, transparent);
    }

    body.join-flow .join-done-participants-title {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 700;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-done-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 220px;
      overflow-y: auto;
      padding-right: 2px;
    }

    body.join-flow .join-done-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #eef1f7) 88%, transparent);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
    }

    body.join-flow .join-done-row-you {
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 28%, transparent);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 8%, transparent);
    }

    body.join-flow .join-done-avatar {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      overflow: hidden;
      flex-shrink: 0;
    }

    body.join-flow .join-done-avatar-img,
    body.join-flow .join-done-avatar-fallback {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    body.join-flow .join-done-avatar-fallback.hidden {
      display: none;
    }

    body.join-flow .join-done-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      background: linear-gradient(180deg, var(--avatar-grad-top, #7BD3FF) 0%, var(--avatar-grad-bottom, #2AABEE) 100%);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }

    body.join-flow .join-done-row-body {
      min-width: 0;
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    body.join-flow .join-done-row-text {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    body.join-flow .join-done-row-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--tg-theme-text-color, #151a2d);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    body.join-flow .join-done-row-name-line {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      min-width: 0;
      max-width: 100%;
    }

    body.join-flow .join-done-row-chevron {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      color: var(--tg-theme-hint-color, #65708a);
      opacity: 0.8;
    }

    body.join-flow .join-done-row-chevron .participant-row-chevron {
      width: 14px;
      height: 14px;
      display: block;
    }

    body.join-flow .join-done-row-handle {
      font-size: 12px;
      line-height: 1.2;
      color: var(--tg-theme-hint-color, #65708a);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    body.join-flow .join-done-row-handle-muted {
      font-style: italic;
      opacity: 0.75;
    }

    body.join-flow .join-done-you {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--tg-theme-link-color, #2d49cc);
      padding: 2px 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
    }

    body.join-flow .join-done-empty {
      margin: 0;
      font-size: 13px;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-done-tip {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      text-align: left;
    }

    /* Nudged down a pixel to sit on the first line of text rather than above it. */
    body.join-flow .join-done-tip-icon {
      flex: none;
      display: inline-flex;
      width: 15px;
      height: 15px;
      margin-top: 1px;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-done-tip-icon svg {
      width: 15px;
      height: 15px;
      display: block;
    }

    body.join-flow .join-done-tip-text {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.4;
      color: color-mix(in srgb, var(--tg-theme-text-color, #151a2d) 80%, var(--tg-theme-hint-color, #65708a));
    }

    body.join-flow .join-done-card .join-step-head {
      display: none;
    }

    body.join-flow .join-done-card .join-step-body {
      padding-top: 8px;
    }

    body.join-flow .join-channel-card .join-step-head {
      display: none;
    }

    body.join-flow .join-channel-card .join-step-body {
      padding-top: 12px;
    }

    body.join-flow .join-channel-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
      text-align: center;
    }

    body.join-flow .join-channel-lead {
      margin: 0;
      width: 100%;
      font-size: 14px;
      line-height: 1.45;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-channel-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    body.join-flow .join-channel-avatar-wrap {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      overflow: hidden;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, #e8ecf8);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body.join-flow .join-channel-avatar {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    body.join-flow .join-channel-avatar-fallback {
      font-size: 28px;
      line-height: 1;
    }

    body.join-flow .join-channel-name {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-channel-actions {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    body.join-flow .join-notify-panel .join-channel-avatar-wrap svg {
      width: 32px;
      height: 32px;
      color: var(--tg-theme-button-color, #325fff);
    }

    body.join-flow .join-notify-panel .join-step-title {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
    }

    body.join-flow .join-notify-error {
      margin: 0;
      width: 100%;
      font-size: 13px;
      line-height: 1.4;
      color: #d93025;
    }

    body.join-flow .join-done-boost-btn {
      width: 100%;
      margin-top: 8px;
      margin-bottom: 10px;
    }

    body.join-flow .join-done-anon-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    body.join-flow .join-done-anon-icon {
      display: inline-flex;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    body.join-flow .join-done-anon-icon svg {
      width: 100%;
      height: 100%;
    }

    body.join-flow .join-done-anon-btn.is-on {
      background: #f3ecff;
      border-color: #c4a7ee;
      color: #5b32a0;
    }

    body.join-flow .join-done-anon-btn.is-loading {
      opacity: 0.65;
      pointer-events: none;
    }

    body.join-flow .join-done-anon-note {
      margin: 0 0 18px;
      font-size: 12px;
      line-height: 1.45;
      text-align: center;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-done-anon-note-error {
      color: #cf222e;
    }

    body.join-flow.app-theme-dark .join-done-anon-btn.is-on {
      background: color-mix(in srgb, #a97bff 20%, transparent);
      border-color: color-mix(in srgb, #a97bff 42%, transparent);
      color: #d9c2ff;
    }

    @keyframes join-btn-gradient-shift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    body.join-flow .join-btn-gradient:not(:disabled) {
      background: linear-gradient(
        90deg,
        #ff6b9d 0%,
        #e07da8 18%,
        #b88ae8 42%,
        #5b7cfa 62%,
        #8b9cf5 82%,
        #ff6b9d 100%
      );
      background-size: 220% 100%;
      animation: join-btn-gradient-shift 3.2s ease-in-out infinite;
      color: #fff;
      border: none;
      border-radius: 999px;
      box-shadow: none;
    }

    body.join-flow .join-btn-gradient:not(:disabled):active {
      filter: brightness(0.96);
    }

    body.join-flow .join-btn-gradient:disabled {
      background: linear-gradient(135deg, #ff6b9d, #5b7cfa);
      background-size: 100% 100%;
      animation: none;
      color: #fff;
      border: none;
      border-radius: 999px;
      opacity: 0.55;
      box-shadow: none;
      cursor: wait;
    }

    @media (prefers-reduced-motion: reduce) {
      body.join-flow .join-btn-gradient:not(:disabled) {
        animation: none;
        background-size: 100% 100%;
      }
    }

    body.join-flow .join-done-row-link {
      cursor: pointer;
    }

    body.join-flow .join-done-row-link .join-done-row-name {
      color: var(--tg-theme-link-color, #2d49cc);
    }

    body.join-flow .join-done-row-link .join-done-row-chevron {
      color: var(--tg-theme-link-color, #2d49cc);
      opacity: 0.65;
    }

    body.join-flow .join-boost-backdrop {
      position: fixed;
      inset: 0;
      z-index: 120;
      background: rgba(0, 0, 0, 0.45);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }

    body.join-flow .join-boost-backdrop.is-open {
      opacity: 1;
      pointer-events: auto;
    }

    body.join-flow .join-boost-sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 130;
      max-width: 100%;
      margin: 0 auto;
      padding: 0 var(--join-pad-right) max(18px, env(safe-area-inset-bottom, 0px)) var(--join-pad-left);
      transform: translateY(110%);
      transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
      pointer-events: none;
    }

    body.join-flow .join-boost-sheet.is-open {
      transform: translateY(0);
      pointer-events: auto;
    }

    body.join-flow .join-boost-card {
      position: relative;
      background: var(--tg-theme-bg-color, #fff);
      border-radius: 20px 20px 16px 16px;
      padding: 28px 18px 18px;
      box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
    }

    body.join-flow .join-boost-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 50%;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
      color: var(--tg-theme-text-color, #151a2d);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    body.join-flow .join-boost-badge {
      position: absolute;
      top: -14px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 15px;
      font-weight: 800;
      color: #fff;
      background: linear-gradient(135deg, #ff6b9d, #5b7cfa);
      box-shadow: 0 4px 14px rgba(91, 124, 250, 0.35);
    }

    body.join-flow .join-boost-badge-icon {
      width: 14px;
      height: 14px;
      display: block;
    }

    body.join-flow .join-boost-title {
      margin: 8px 0 6px;
      font-size: 20px;
      font-weight: 800;
      text-align: center;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-boost-counter {
      margin: 0 0 12px;
      text-align: center;
      font-size: 14px;
      font-weight: 600;
      color: var(--tg-theme-link-color, #5b7cfa);
    }

    body.join-flow .join-boost-text {
      margin: 0 0 16px;
      font-size: 14px;
      line-height: 1.5;
      text-align: center;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow .join-boost-text b {
      color: var(--tg-theme-text-color, #151a2d);
      font-weight: 700;
    }

    body.join-flow .join-boost-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    body.join-flow .join-boost-link-preview {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.4;
      word-break: break-all;
      text-align: center;
      color: var(--tg-theme-hint-color, #65708a);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 6%, var(--tg-theme-secondary-bg-color, #fff));
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      user-select: all;
      cursor: pointer;
    }

    body.join-flow .join-boost-link-notice {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.35;
      text-align: center;
      border: 1px solid transparent;
    }

    body.join-flow .join-boost-link-notice.is-ok {
      background: color-mix(in srgb, #1f6a3c 10%, var(--tg-theme-secondary-bg-color, #fff));
      color: #1f6a3c;
      border-color: color-mix(in srgb, #a7e6bc 40%, transparent);
    }

    body.join-flow .join-boost-link-notice.is-error {
      background: color-mix(in srgb, #a12626 10%, var(--tg-theme-secondary-bg-color, #fff));
      color: #c62828;
      border-color: color-mix(in srgb, #ffcaca 40%, transparent);
    }

    body.join-flow .join-guide-sheet-backdrop {
      position: fixed;
      inset: 0;
      z-index: 120;
      background: rgba(0, 0, 0, 0.45);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }

    body.join-flow .join-guide-sheet-backdrop.is-open {
      opacity: 1;
      pointer-events: auto;
    }

    body.join-flow .join-guide-sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 130;
      max-width: 100%;
      margin: 0 auto;
      padding: 0 var(--join-pad-right) max(18px, env(safe-area-inset-bottom, 0px)) var(--join-pad-left);
      transform: translateY(110%);
      transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
      pointer-events: none;
    }

    body.join-flow .join-guide-sheet.is-open {
      transform: translateY(0);
      pointer-events: auto;
    }

    body.join-flow .join-guide-sheet-card {
      position: relative;
      display: flex;
      flex-direction: column;
      max-height: min(88vh, 760px);
      background: var(--tg-theme-secondary-bg-color, var(--tg-theme-bg-color, #fff));
      border-radius: 16px 16px 0 0;
      padding: 18px 16px 16px;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.22);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
      border-bottom: 0;
    }

    body.join-flow .join-guide-sheet-close {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 2;
      width: 32px;
      height: 32px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 24%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 10%, transparent);
      color: var(--tg-theme-text-color, #151a2d);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    body.join-flow .join-guide-sheet-title {
      margin: 0 36px 12px 0;
      font-size: 18px;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-guide-sheet-scroll {
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
      margin: 0;
    }

    body.join-flow .msg {
      padding: 11px 13px;
      border-radius: 12px;
      font-size: 13px;
      margin-bottom: 12px;
      border: 1px solid transparent;
    }

    body.join-flow .msg.error {
      background: color-mix(in srgb, #a12626 10%, var(--tg-theme-secondary-bg-color, #fff));
      color: #c62828;
      border-color: color-mix(in srgb, #ffcaca 40%, transparent);
    }

    body.join-flow .msg.ok {
      background: color-mix(in srgb, #1f6a3c 10%, var(--tg-theme-secondary-bg-color, #fff));
      color: #1f6a3c;
      border-color: color-mix(in srgb, #a7e6bc 40%, transparent);
    }

    body.join-flow .loading {
      text-align: center;
      color: var(--tg-theme-hint-color, #65708a);
      padding: 32px 16px;
      font-size: 14px;
    }

    body.join-flow .loading-retry-text {
      margin: 0 0 12px;
      font-size: 14px;
      line-height: 1.45;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.join-flow #loadingRetry {
      text-align: center;
      padding: 24px 16px;
    }

    body.join-flow #loadingRetry .join-btn {
      max-width: 220px;
      margin: 0 auto;
    }

    body.join-flow.app-theme-dark .join-step-card {
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    }

    body.join-flow.app-theme-dark .join-btn-secondary:not(.is-loading):not(.is-done),
    body.join-flow.app-theme-dark a.join-btn.join-btn-secondary {
      color: #ffffff;
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 22%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 45%, transparent);
    }

    body.join-flow.app-theme-dark .join-btn-outline {
      background: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #232f42) 92%, #000);
      color: var(--tg-theme-text-color, #eef1f7);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #8f9ab0) 42%, transparent);
    }
    /* The outline never actually showed: "body.join-flow .join-btn" further down
       sets border: none at the same specificity and wins on source order. These
       rules only restore the border, one class stronger, and leave the button
       backgrounds alone. :not(.is-on) keeps the anonymous toggle's own colour. */
    body.join-flow .join-btn.join-btn-outline {
      border-style: solid;
      border-width: 1.5px;
    }

    body.join-flow .join-btn.join-btn-outline:not(.is-on) {
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 60%, transparent);
    }

    /* Dimmer than the light theme's: on the dark card a pale border was the
       brightest line on screen and pulled the eye off the main action. */
    body.join-flow.app-theme-dark .join-btn.join-btn-outline:not(.is-on) {
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #8f9ab0) 42%, transparent);
    }

    body.join-flow .join-step-head-text {
      min-width: 0;
    }

    body.join-flow .join-brand-logo {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      align-self: center;
      flex-shrink: 0;
      height: 44px;
      max-width: 132px;
      margin-left: auto;
    }

    body.join-flow .join-brand-logo.hidden {
      display: none !important;
    }

    body.join-flow .join-brand-logo-img {
      height: 100%;
      max-width: 100%;
      object-fit: contain;
    }

    .brand-logo-dark {
      display: none !important;
    }

    body.app-theme-dark .brand-logo-light {
      display: none !important;
    }

    body.app-theme-dark .brand-logo-dark {
      display: block !important;
    }

    body.join-flow .join-unregistered-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    body.join-flow .join-unregistered-actions .join-btn {
      width: 100%;
    }

    body.join-flow.app-theme-dark .join-guide-sheet-card {
      background: var(--tg-theme-secondary-bg-color, #232f42);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 28%, transparent);
    }

    body.join-flow.app-theme-dark .join-paste-btn {
      color: #ffffff;
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 22%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 45%, transparent);
    }

    body.join-flow.app-theme-dark .join-ref-status-error {
      color: #ff8a80;
      border-color: color-mix(in srgb, #ff8a80 35%, transparent);
    }

    body.join-flow.app-theme-dark .join-ref-status-error .join-ref-status-icon {
      color: #ff8a80;
    }

    body.join-flow.app-theme-dark .join-ref-status-ok {
      color: #9dffb8;
      border-color: color-mix(in srgb, #9dffb8 35%, transparent);
    }

    body.join-flow.app-theme-dark .join-ref-status-ok .join-ref-status-icon {
      color: #9dffb8;
    }

    body.join-flow.app-theme-dark .join-btn-guide {
      color: #ffffff;
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 18%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 42%, transparent);
    }

    body.join-flow.app-theme-dark .join-btn-guide[aria-expanded="true"] {
      color: #ffffff;
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 28%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 58%, transparent);
    }

    body.join-flow.app-theme-dark .join-field-status-error {
      color: #ff8a80;
      background: color-mix(in srgb, #a12626 22%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, #e53935 32%, transparent);
    }

    body.join-flow.app-theme-dark .join-id-input-row {
      background: var(--tg-theme-bg-color, #141a24);
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 30%, transparent);
    }

    body.join-flow.app-theme-dark .join-input.join-input-id.join-input-id-pokerdom::placeholder {
      color: color-mix(in srgb, var(--tg-theme-hint-color, #8b95a8) 78%, var(--tg-theme-bg-color, #141a24));
    }

    body.join-flow.app-theme-dark .join-done-mark {
      --join-done-green: #22a85c;
      --join-done-green-hi: #62e6a0;
    }

    body.join-flow.app-theme-dark .join-done-title {
      color: var(--tg-theme-text-color, #eef1f7);
    }

    body.join-flow.app-theme-dark .join-done-tips {
      background: color-mix(in srgb, #9aa6bd 8%, transparent);
    }
  `;
}

const JOIN_PROGRESS_CHECK = `<svg class="join-progress-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

// One node of the stepper. The client rebuilds the stepper from these when the
// app mode page learns its draw, so `number` may be a placeholder it fills in.
function renderJoinProgressDot(step, number) {
  return `<li class="join-progress-dot" data-step="${step}">
        <span class="join-progress-node" aria-hidden="true"><span class="join-progress-num">${number}</span>${JOIN_PROGRESS_CHECK}</span>
        <span class="join-progress-label">${JOIN_FLOW_STEP_LABELS[step] || ""}</span>
      </li>`;
}

// `steps` is what getJoinFlowSteps says this draw has. The column count goes
// into a custom property, which the grid and the track both read.
function renderJoinProgressMarkup(steps = JOIN_FLOW_STEPS, { hidden = false } = {}) {
  const dots = steps
    .map((step, i) => renderJoinProgressDot(step, i + 1).replace('class="join-progress-dot"', `class="join-progress-dot${i === 0 ? " is-active" : ""}"`))
    .join("");
  return `<div class="join-progress${hidden ? " hidden" : ""}" id="joinProgress" style="--join-progress-count: ${steps.length}">
    <div class="join-progress-track" aria-hidden="true"><div class="join-progress-fill" id="joinProgressFill"></div></div>
    <ol class="join-progress-dots" id="joinProgressDots">${dots}</ol>
  </div>`;
}

function renderDesktopTiledBackground() {
  const tiles = Array.from({ length: 9 }, (_, index) =>
    `<span class="app-desktop-bg-tile${index % 2 === 1 ? " app-desktop-bg-tile-mirror" : ""}" aria-hidden="true"></span>`,
  ).join("");
  return `<div class="app-desktop-bg" aria-hidden="true"><div class="app-desktop-bg-strip">${tiles}</div><div class="app-desktop-bg-overlay"></div></div>`;
}

function getWinnersPageStyles() {
  return `
    body.winners-page.mini-app-shell {
      margin: 0;
      max-width: 100%;
      width: 100%;
      --winners-pad-left: max(14px, var(--mini-pad-x), env(safe-area-inset-left, 0px));
      --winners-pad-right: max(14px, var(--mini-pad-x), env(safe-area-inset-right, 0px));
      padding: var(--mini-pad-top) 0 var(--mini-pad-bottom);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-x: clip;
      box-sizing: border-box;
    }

    body.winners-page .winners-shell {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      overflow-x: clip;
      padding-left: var(--winners-pad-left);
      padding-right: var(--winners-pad-right);
      opacity: 1;
      transform: none;
    }

    @media (prefers-reduced-motion: no-preference) {
      body.winners-page .winners-shell {
        transform: translateY(10px);
        animation: winners-page-in 0.26s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
    }

    @keyframes winners-page-in {
      to { transform: translateY(0); }
    }

    body.winners-page .winners-header {
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 14px;
      padding: 12px;
      margin-bottom: 8px;
      box-shadow: 0 6px 18px rgba(27, 45, 94, 0.05);
    }

    body.winners-page .winners-header-top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    body.winners-page .winners-header-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
      color: var(--tg-theme-button-color, #325fff);
    }

    body.winners-page .winners-header-icon svg {
      width: 18px;
      height: 18px;
    }

    body.winners-page .winners-title {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      font-size: 16px;
      font-weight: 800;
      line-height: 1.3;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.winners-page .winners-viewer-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0 0 10px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid transparent;
    }

    body.winners-page .winners-viewer-banner-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    body.winners-page .winners-viewer-banner-icon svg {
      width: 20px;
      height: 20px;
      display: block;
    }

    body.winners-page .winners-viewer-banner-copy {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    body.winners-page .winners-viewer-banner-title {
      font-size: 14px;
      font-weight: 800;
      line-height: 1.25;
    }

    body.winners-page .winners-viewer-banner-sub {
      font-size: 12px;
      font-weight: 500;
      line-height: 1.35;
      opacity: 0.88;
    }

    body.winners-page .winners-viewer-banner-sub.hidden {
      display: none;
    }

    body.winners-page .winners-viewer-banner.is-won {
      background: color-mix(in srgb, #1f6a3c 12%, var(--tg-theme-secondary-bg-color, #fff));
      border-color: color-mix(in srgb, #1f6a3c 28%, transparent);
    }

    body.winners-page .winners-viewer-banner.is-won .winners-viewer-banner-icon {
      background: color-mix(in srgb, #1f6a3c 16%, transparent);
      color: #1f6a3c;
    }

    body.winners-page .winners-viewer-banner.is-won .winners-viewer-banner-title {
      color: #1f6a3c;
    }

    body.winners-page .winners-viewer-banner.is-won .winners-viewer-banner-sub {
      color: color-mix(in srgb, #1f6a3c 75%, var(--tg-theme-text-color, #151a2d));
    }

    body.winners-page .winners-viewer-banner.is-lost {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 10%, var(--tg-theme-secondary-bg-color, #fff));
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
    }

    body.winners-page .winners-viewer-banner.is-lost .winners-viewer-banner-icon {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.winners-page .winners-viewer-banner.is-lost .winners-viewer-banner-title {
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.winners-page .winners-viewer-banner.is-lost .winners-viewer-banner-sub {
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.winners-page .winners-viewer-banner.is-none {
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 8%, var(--tg-theme-secondary-bg-color, #fff));
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 18%, transparent);
    }

    body.winners-page .winners-viewer-banner.is-none .winners-viewer-banner-icon {
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
      color: var(--tg-theme-button-color, #325fff);
    }

    body.winners-page .winners-viewer-banner.is-none .winners-viewer-banner-title {
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.winners-page .winners-viewer-banner.is-none .winners-viewer-banner-sub {
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.winners-page .winners-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    body.winners-page .winners-stat {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      padding: 8px 9px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 6%, var(--tg-theme-secondary-bg-color, #fff));
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
      min-width: 0;
      min-height: 40px;
    }

    body.winners-page .winners-stat-btn {
      width: 100%;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
    }

    body.winners-page .winners-stat-btn:active {
      transform: scale(0.98);
    }

    body.winners-page .winners-stat-btn:not(.is-active) {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 5%, var(--tg-theme-secondary-bg-color, #fff));
      border-color: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 10%, transparent);
    }

    body.winners-page .winners-stat-btn:not(.is-active) .winners-stat-value {
      color: var(--tg-theme-hint-color, #65708a);
      font-weight: 700;
    }

    body.winners-page .winners-stat-btn:not(.is-active) .winners-stat-icon {
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 10%, transparent);
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.winners-page .winners-stat-btn.is-active {
      border-color: var(--tg-theme-button-color, #325fff);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 18%, var(--tg-theme-secondary-bg-color, #fff));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 28%, transparent);
    }

    body.winners-page .winners-stat-btn.is-active .winners-stat-value {
      color: var(--tg-theme-button-color, #325fff);
    }

    body.winners-page .winners-stat-btn.is-active .winners-stat-icon {
      background: var(--tg-theme-button-color, #325fff);
      color: var(--tg-theme-button-text-color, #fff);
    }

    body.winners-page .winners-stat-btn:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 45%, transparent);
      outline-offset: 2px;
    }

    body.winners-page .winners-stat-icon {
      width: 24px;
      height: 24px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
      color: var(--tg-theme-button-color, #325fff);
    }

    body.winners-page .winners-stat-icon svg {
      width: 13px;
      height: 13px;
    }

    body.winners-page .winners-stat-value {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 11px;
      font-weight: 800;
      color: var(--tg-theme-text-color, #151a2d);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    body.winners-page .winners-panel {
      width: 100%;
      min-width: 0;
    }

    body.winners-page .winners-tab-panel {
      width: 100%;
      min-width: 0;
    }

    body.winners-page .winners-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    body.winners-page .winners-row {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 12px;
      padding: 10px;
      box-shadow: 0 4px 12px rgba(27, 45, 94, 0.04);
      opacity: 1;
      transform: none;
      min-width: 0;
    }

    @media (prefers-reduced-motion: no-preference) {
      body.winners-page .winners-row {
        transform: translateY(6px);
        animation: winners-card-in 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      body.winners-page .winners-list .winners-row:nth-child(1) { animation-delay: 0.03s; }
      body.winners-page .winners-list .winners-row:nth-child(2) { animation-delay: 0.06s; }
      body.winners-page .winners-list .winners-row:nth-child(3) { animation-delay: 0.09s; }
      body.winners-page .winners-list .winners-row:nth-child(4) { animation-delay: 0.12s; }
      body.winners-page .winners-list .winners-row:nth-child(n + 5) { animation-delay: 0.15s; }
    }

    @keyframes winners-card-in {
      to { transform: translateY(0); }
    }

    body.winners-page .winners-avatar {
      width: 38px;
      height: 38px;
      min-width: 38px;
      min-height: 38px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 22%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body.winners-page .winners-avatar-img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      border-radius: 50%;
    }

    body.winners-page .winners-avatar-fallback.hidden {
      display: none;
    }

    body.winners-page .winners-avatar-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      border: none;
      border-radius: 50%;
      background: linear-gradient(180deg, var(--avatar-grad-top, #7BD3FF) 0%, var(--avatar-grad-bottom, #2AABEE) 100%);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }

    body.winners-page .winners-row-body {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
    }

    body.winners-page .winners-row-identity {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }

    body.winners-page .winners-row-name-line {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      min-width: 0;
      max-width: 100%;
    }

    body.winners-page .winners-row-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--tg-theme-text-color, #151a2d);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      line-height: 1.2;
    }

    body.winners-page .winners-row-chevron {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      color: var(--tg-theme-hint-color, #65708a);
      opacity: 0.8;
    }

    body.winners-page .winners-row-chevron .participant-row-chevron {
      width: 14px;
      height: 14px;
      display: block;
    }

    body.winners-page .winners-row-handle {
      font-size: 12px;
      font-weight: 500;
      color: var(--tg-theme-hint-color, #65708a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
    }

    body.winners-page .winners-row-prize {
      flex-shrink: 0;
      align-self: center;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: 2px;
      text-align: right;
      padding-left: 6px;
      min-height: 38px;
    }

    body.winners-page .winners-row-prize-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--tg-theme-hint-color, #65708a);
      line-height: 1;
    }

    body.winners-page .winners-row-prize-value {
      font-size: 17px;
      font-weight: 800;
      color: var(--tg-theme-button-color, #325fff);
      line-height: 1.1;
      white-space: nowrap;
    }

    body.winners-page .winners-row-link {
      cursor: pointer;
    }

    body.winners-page .winners-row-hit {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
      text-decoration: none;
      color: inherit;
    }

    body.winners-page .winners-row-hit:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 50%, transparent);
      outline-offset: 2px;
      border-radius: 12px;
    }

    body.winners-page .winners-row-compact {
      padding: 9px 10px;
    }

    body.winners-page .winners-empty-compact {
      padding: 18px 12px;
      margin: 0;
    }

    body.winners-page .winners-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 20px 14px;
      border-radius: 14px;
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
    }

    body.winners-page .winners-empty-icon {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.winners-page .winners-empty-icon svg {
      width: 22px;
      height: 22px;
    }

    body.winners-page .winners-empty-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.winners-page.app-theme-dark .winners-header,
    body.winners-page.app-theme-dark .winners-row,
    body.winners-page.app-theme-dark .winners-empty {
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    }

    body.winners-page.app-theme-dark .winners-viewer-banner.is-won {
      background: color-mix(in srgb, #9dffb8 10%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, #9dffb8 24%, transparent);
    }

    body.winners-page.app-theme-dark .winners-viewer-banner.is-won .winners-viewer-banner-icon {
      color: #9dffb8;
    }

    body.winners-page.app-theme-dark .winners-viewer-banner.is-won .winners-viewer-banner-title {
      color: #9dffb8;
    }

    body.winners-page .app-desktop-bg {
      display: none;
    }

    @media (min-width: 761px) {
      body.winners-page.mini-app-shell::before {
        display: none;
      }

      body.winners-page .app-desktop-bg {
        display: block;
        position: fixed;
        inset: 0;
        z-index: -2;
        overflow: hidden;
        pointer-events: none;
        background-color: #152238;
      }

      body.winners-page .app-desktop-bg-strip {
        --app-bg-tile-h: calc(min(760px, 100vw) * 1280 / 760);
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        height: calc(100% + var(--app-bg-tile-h));
        min-width: 100vw;
        animation: app-bg-drift-strip 160s linear infinite;
      }

      body.winners-page .app-desktop-bg-tile {
        --app-desktop-tile-width: min(760px, 100vw);
        width: var(--app-desktop-tile-width);
        flex: 0 0 var(--app-desktop-tile-width);
        height: 100%;
        background-image: url("/brand/background-dark.png");
        background-repeat: repeat-y;
        background-size: 100% auto;
        background-position: center top;
        opacity: 0.58;
      }

      body.winners-page .app-desktop-bg-tile-mirror {
        transform: scaleX(-1);
      }

      @media (prefers-reduced-motion: reduce) {
        body.winners-page .app-desktop-bg-strip {
          animation: none;
        }
      }

      body.winners-page .app-desktop-bg-overlay {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 80% 60% at 50% -10%, rgba(91, 140, 255, 0.22) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 50% 110%, rgba(50, 95, 255, 0.14) 0%, transparent 55%),
          linear-gradient(180deg, rgba(21, 34, 56, 0.28) 0%, rgba(21, 34, 56, 0.84) 100%);
      }

      body.winners-page .winners-shell {
        max-width: 520px;
        margin-left: auto;
        margin-right: auto;
      }
    }
  `;
}

function getJoinPreviewThemeStyles() {
  return `
    body.join-preview.join-flow.mini-app-shell {
      background: transparent !important;
      background-color: var(--bg-active, var(--bg, #dbe8f8)) !important;
    }
    body.join-preview.join-flow.mini-app-shell.app-theme-dark .mock-recaptcha {
      background: #303030;
      border-color: #525252;
      box-shadow: none;
    }
    body.join-preview.mini-app-shell.app-theme-dark .mock-recaptcha-label {
      color: #f1f1f1;
    }
    body.join-preview.mini-app-shell.app-theme-dark .mock-recaptcha-check {
      background: #222;
      border-color: #666;
    }
    body.join-preview.mini-app-shell.app-theme-dark .mock-recaptcha-brand-text {
      color: #bbb;
    }
    body.join-preview.join-flow.mini-app-shell.app-theme-dark .mock-recaptcha-brand-text small {
      color: #888;
    }
  `;
}

function getGatePageStyles() {
  return `
    body.gate-page.mini-app-shell {
      margin: 0;
      max-width: 100%;
      width: 100%;
      --gate-pad-left: max(14px, var(--mini-pad-x), env(safe-area-inset-left, 0px));
      --gate-pad-right: max(14px, var(--mini-pad-x), env(safe-area-inset-right, 0px));
      padding: var(--mini-pad-top) 0 var(--mini-pad-bottom);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-x: clip;
      box-sizing: border-box;
    }

    body.gate-page .gate-shell {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      padding-left: var(--gate-pad-left);
      padding-right: var(--gate-pad-right);
      animation: gate-page-in 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      opacity: 0;
      transform: translateY(8px);
    }

    @keyframes gate-page-in {
      to { opacity: 1; transform: translateY(0); }
    }

    body.gate-page .preview-toolbar {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 12px;
      width: 100%;
      box-sizing: border-box;
    }

    body.gate-page .gate-card {
      position: relative;
      overflow: hidden;
      text-align: center;
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 20px;
      padding: 24px 18px 18px;
      box-shadow: 0 12px 32px rgba(27, 45, 94, 0.08);
    }

    body.gate-page .gate-card::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 120px;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 10%, transparent) 0%,
        transparent 100%
      );
      pointer-events: none;
    }

    body.gate-page .gate-hero {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 18px;
    }

    body.gate-page .gate-lock-ring {
      position: relative;
      width: 84px;
      height: 84px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body.gate-page .gate-lock-ring::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: conic-gradient(
        from 210deg,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 70%, #fff),
        color-mix(in srgb, #7c5cff 55%, var(--tg-theme-button-color, #325fff)),
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 70%, #fff)
      );
      animation: gate-ring-spin 8s linear infinite;
      opacity: 0.35;
    }

    body.gate-page .gate-lock-ring::after {
      content: "";
      position: absolute;
      inset: 3px;
      border-radius: 999px;
      background: var(--tg-theme-secondary-bg-color, #fff);
    }

    @keyframes gate-ring-spin {
      to { transform: rotate(360deg); }
    }

    body.gate-page .gate-lock-icon {
      position: relative;
      z-index: 1;
      width: 56px;
      height: 56px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(
        145deg,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 18%, var(--tg-theme-secondary-bg-color, #fff)),
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 8%, var(--tg-theme-secondary-bg-color, #fff))
      );
      color: var(--tg-theme-button-color, #325fff);
      box-shadow: 0 10px 24px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 24%, transparent);
      animation: gate-lock-bob 2.8s ease-in-out infinite;
    }

    @keyframes gate-lock-bob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }

    body.gate-page .gate-lock-icon svg {
      width: 28px;
      height: 28px;
      display: block;
    }

    body.gate-page .gate-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--tg-theme-button-color, #325fff);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 22%, transparent);
      margin-bottom: 10px;
    }

    body.gate-page .gate-title {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 900;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.gate-page .gate-title-smile {
      display: inline-block;
      animation: gate-smile-wink 3s ease-in-out infinite;
    }

    @keyframes gate-smile-wink {
      0%, 88%, 100% { transform: scale(1) rotate(0deg); }
      92% { transform: scale(1.08) rotate(-6deg); }
      96% { transform: scale(1) rotate(0deg); }
    }

    body.gate-page .gate-lead {
      margin: 0;
      max-width: 280px;
      font-size: 15px;
      line-height: 1.5;
      font-weight: 600;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.gate-page .gate-lead-site {
      display: inline-block;
      margin-top: 4px;
      font-weight: 800;
      color: var(--tg-theme-link-color, #325fff);
    }

    body.gate-page .gate-actions {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }

    body.gate-page .gate-cta-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px 16px;
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 800;
      text-decoration: none;
      cursor: pointer;
      color: var(--tg-theme-button-text-color, #fff);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--tg-theme-button-color, #325fff) 88%, #fff) 0%,
        var(--tg-theme-button-color, #325fff) 100%
      );
      box-shadow: none;
      border: 1px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 55%, transparent);
      transition: transform 0.18s ease, filter 0.18s ease;
    }

    body.gate-page .gate-cta-btn:active {
      transform: scale(0.98);
    }

    body.gate-page .gate-cta-btn svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    body.gate-page .gate-tip {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      text-align: left;
      padding: 12px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 8%, var(--tg-theme-secondary-bg-color, #fff));
      border: 1px dashed color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 24%, transparent);
    }

    body.gate-page .gate-tip-icon {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 12%, transparent);
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.gate-page .gate-tip-icon svg {
      width: 16px;
      height: 16px;
      display: block;
    }

    body.gate-page .gate-tip-text {
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
      font-weight: 600;
      color: var(--tg-theme-hint-color, #65708a);
    }

    body.gate-page.app-theme-dark .gate-card {
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
    }

    body.gate-page.app-theme-dark .gate-lock-ring::after {
      background: var(--tg-theme-secondary-bg-color, #232f42);
    }
  `;
}

// Shown on the public results and participants lists for people who chose to
// join anonymously. What sits under the blur is already the mask the channel
// post prints - the real name never reaches this page - so the blur is there to
// look like a hidden name, not to be the thing hiding it. A blur is CSS; on a
// desktop it comes off in two clicks.
function getAnonymousIdentityStyles() {
  return `
    .is-anon-name {
      filter: blur(4.5px);
      opacity: 0.85;
      letter-spacing: 0.14em;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }
    .is-anon-avatar {
      filter: blur(5px) saturate(0.65);
      opacity: 0.9;
    }
    .is-anon-handle {
      font-style: italic;
      opacity: 0.7;
    }
    @media (prefers-reduced-motion: reduce) {
      .is-anon-name { filter: blur(3px); }
    }
  `;
}

module.exports = {
  getPanelFluidTypographyVars,
  getAnonymousIdentityStyles,
  getMiniAppStyles,
  getMiniAppInitScript,
  getMiniAppHeadScript,
  getMiniAppViewportMeta,
  getParticipantRowChevronIcon,
  getMiniAppFontLinks,
  getTelegramPanelAuthRedirectScript,
  getPreviewDevStyles,
  getJoinFlowStyles,
  getWinnersPageStyles,
  renderDesktopTiledBackground,
  getGatePageStyles,
  getJoinPreviewThemeStyles,
  renderJoinProgressMarkup,
  renderJoinProgressDot,
  renderThemeToggleButton,
  JOIN_FLOW_STEPS,
  MINIAPP_VIEWPORT,
  MANUAL_DARK_THEME,
  MANUAL_LIGHT_THEME,
};
