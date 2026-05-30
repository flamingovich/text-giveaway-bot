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
      --bg-dark: #152238;
      --app-bg-image-dark: url("/brand/background-dark.png");
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

    body.mini-app-shell::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      background-color: var(--bg-active, var(--bg, #dbe8f8));
      background-image: var(--app-bg-active, var(--app-bg-image, url("/brand/background.jpg")));
      background-repeat: repeat-y;
      background-position: center top;
      background-size: min(100vw, 760px) auto;
      pointer-events: none;
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
      font-size: 10px;
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
    body.mini-app-shell img:not(.join-guide-img):not(.winners-avatar),
    body.mini-app-shell input,
    body.mini-app-shell select,
    body.mini-app-shell button:not(.theme-toggle-btn):not(.settings-action-btn):not(.winner-copy-btn):not(.join-btn),
    body.mini-app-shell .history-list,
    body.mini-app-shell .history-card {
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      box-sizing: border-box;
    }

    body.mini-app-shell img.join-guide-img,
    body.mini-app-shell img.winners-avatar {
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
      padding: 8px 9px;
      border-radius: 10px;
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
    body.mini-app-shell button:not(.settings-action-btn):not(.join-btn) {
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

const JOIN_FLOW_STEPS = ["captcha", "registration", "trc20", "done"];

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

    body.join-flow .join-progress {
      margin-bottom: 14px;
    }

    body.join-flow .join-progress-bar {
      height: 4px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent);
      overflow: hidden;
    }

    body.join-flow .join-progress-fill {
      height: 100%;
      width: 25%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--tg-theme-button-color, #325fff), color-mix(in srgb, var(--tg-theme-button-color, #325fff) 70%, #fff));
      transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    }

    body.join-flow .join-progress-dots {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
      margin-top: 10px;
      width: 100%;
    }

    body.join-flow .join-progress-dot {
      min-width: 0;
      text-align: center;
      font-size: 9px;
      font-weight: 600;
      color: var(--tg-theme-hint-color, #65708a);
      line-height: 1.2;
      transition: color 0.2s ease;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    body.join-flow .join-progress-dot.is-active,
    body.join-flow .join-progress-dot.is-done {
      color: var(--tg-theme-button-color, #325fff);
    }

    body.join-flow .join-steps-viewport {
      position: relative;
      min-height: 180px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow-x: hidden;
    }

    body.join-flow .join-step-card {
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(27, 45, 94, 0.06);
      opacity: 0;
      transform: translateX(4px);
      transition: opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
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
      transform: translateX(-4px);
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
    }

    body.join-flow .join-step-head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
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
      font-weight: 700;
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

    body.join-flow .join-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
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
      box-shadow: 0 8px 22px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 32%, transparent);
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
      margin: 0;
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

    body.join-flow .join-trc20-field {
      margin-bottom: 12px;
    }

    body.join-flow .join-trc20-submit {
      width: 100%;
      margin: 0 0 16px;
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

    body.join-flow .join-guide-step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--tg-theme-hint-color, #65708a);
      margin: 0 0 8px;
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

    body.join-flow .join-done-icon-ring {
      width: 72px;
      height: 72px;
      border-radius: 999px;
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle, color-mix(in srgb, #1f6a3c 18%, transparent) 0%, transparent 72%);
      border: 2px solid color-mix(in srgb, #1f6a3c 28%, transparent);
      box-shadow: 0 0 0 6px color-mix(in srgb, #1f6a3c 8%, transparent);
    }

    body.join-flow .join-done-icon {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, #1f6a3c 16%, transparent);
      color: #1f6a3c;
    }

    body.join-flow .join-done-icon svg {
      width: 24px;
      height: 24px;
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
      margin: 0 0 6px;
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

    body.join-flow .join-done-tips {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    body.join-flow .join-done-tip {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      text-align: left;
      padding: 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 6%, var(--tg-theme-secondary-bg-color, #fff));
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 14%, transparent);
    }

    body.join-flow .join-done-tip-icon {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
      color: var(--tg-theme-button-color, #325fff);
    }

    body.join-flow .join-done-tip-icon svg {
      width: 16px;
      height: 16px;
      display: block;
    }

    body.join-flow .join-done-tip-text {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--tg-theme-text-color, #151a2d);
    }

    body.join-flow .join-done-card .join-step-head {
      display: none;
    }

    body.join-flow .join-done-card .join-step-body {
      padding-top: 8px;
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

    body.join-flow.app-theme-dark .join-step-card {
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    }

    body.join-flow.app-theme-dark .join-btn-secondary:not(.is-loading):not(.is-done),
    body.join-flow.app-theme-dark a.join-btn.join-btn-secondary {
      color: #ffffff;
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 22%, var(--tg-theme-secondary-bg-color, #232f42));
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 45%, transparent);
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

    body.join-flow.app-theme-dark .join-done-icon-ring {
      border-color: color-mix(in srgb, #9dffb8 35%, transparent);
      box-shadow: 0 0 0 6px color-mix(in srgb, #9dffb8 10%, transparent);
    }

    body.join-flow.app-theme-dark .join-done-icon {
      background: color-mix(in srgb, #9dffb8 14%, transparent);
      color: #9dffb8;
    }

    body.join-flow.app-theme-dark .join-done-title {
      color: var(--tg-theme-text-color, #eef1f7);
    }

    body.join-flow.app-theme-dark .join-done-tip {
      background: color-mix(in srgb, var(--tg-theme-button-color, #5b8cff) 10%, var(--tg-theme-secondary-bg-color, #232f42));
    }
  `;
}

function renderJoinProgressMarkup() {
  const labels = ["Проверка", "Регистрация", "Кошелёк", "Готово"];
  return `<div class="join-progress" id="joinProgress">
    <div class="join-progress-bar"><div class="join-progress-fill" id="joinProgressFill"></div></div>
    <div class="join-progress-dots">
      ${labels.map((label, i) => `<span class="join-progress-dot${i === 0 ? " is-active" : ""}" data-step-index="${i}">${label}</span>`).join("")}
    </div>
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
      opacity: 0;
      transform: translateY(10px);
      animation: winners-page-in 0.26s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    @keyframes winners-page-in {
      to { opacity: 1; transform: translateY(0); }
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
      box-shadow:
        0 0 0 1px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 28%, transparent),
        0 4px 14px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 16%, transparent);
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
      opacity: 0;
      transform: translateY(6px);
      animation: winners-card-in 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      min-width: 0;
    }

    body.winners-page .winners-row:nth-child(1) { animation-delay: 0.03s; }
    body.winners-page .winners-row:nth-child(2) { animation-delay: 0.06s; }
    body.winners-page .winners-row:nth-child(3) { animation-delay: 0.09s; }
    body.winners-page .winners-row:nth-child(4) { animation-delay: 0.12s; }
    body.winners-page .winners-row:nth-child(n+5) { animation-delay: 0.15s; }

    @keyframes winners-card-in {
      to { opacity: 1; transform: translateY(0); }
    }

    body.winners-page .winners-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      border: 1.5px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 22%, transparent);
    }

    body.winners-page .winners-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      border: none;
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

    body.winners-page .winners-profile-btn {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      color: var(--tg-theme-button-color, #325fff);
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--tg-theme-button-color, #325fff) 16%, transparent);
      margin: 0;
    }

    body.winners-page .winners-profile-btn svg {
      width: 11px;
      height: 11px;
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
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        height: 100%;
        min-width: 100vw;
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
      box-shadow: 0 10px 26px color-mix(in srgb, var(--tg-theme-button-color, #325fff) 34%, transparent);
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

module.exports = {
  getMiniAppStyles,
  getMiniAppInitScript,
  getMiniAppHeadScript,
  getMiniAppViewportMeta,
  getMiniAppFontLinks,
  getTelegramPanelAuthRedirectScript,
  getPreviewDevStyles,
  getJoinFlowStyles,
  getWinnersPageStyles,
  renderDesktopTiledBackground,
  getGatePageStyles,
  getJoinPreviewThemeStyles,
  renderJoinProgressMarkup,
  renderThemeToggleButton,
  JOIN_FLOW_STEPS,
  MINIAPP_VIEWPORT,
  MANUAL_DARK_THEME,
  MANUAL_LIGHT_THEME,
};
