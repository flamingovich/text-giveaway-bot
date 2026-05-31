const express = require("express");
const {
  getMiniAppStyles,
  getMiniAppInitScript,
  getMiniAppViewportMeta,
  getMiniAppHeadScript,
  getMiniAppFontLinks,
  getPreviewDevStyles,
  getJoinFlowStyles,
  getGatePageStyles,
  renderThemeToggleButton,
  renderJoinProgressMarkup,
  JOIN_FLOW_STEPS,
} = require("./miniapp-ui");

const NON_REFERRAL_CHANCE = 0.35;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDesignBanner() {
  return "";
}

function renderDesignBannerStyles() {
  return `
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
  `;
}

function renderOrganizerGatePage(_botUsername, options = {}) {
  const isPreview = options.isPreview === true;
  const siteUrl = "https://rollerbot.pro";

  const GATE_LOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
  const GATE_EXTERNAL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>`;
  const GATE_TIP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  ${getMiniAppFontLinks()}
  <title>Доступ закрыт</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>${getMiniAppHeadScript()}</script>
  <style>
    ${renderDesignBannerStyles()}
    ${isPreview ? getPreviewDevStyles() : ""}
    ${getGatePageStyles()}
    ${getMiniAppStyles()}
  </style>
</head>
<body class="gate-page mini-app-shell${isPreview ? " gate-preview" : ""}">
  ${renderDesignBanner()}
  <div class="gate-shell">
    ${isPreview ? `<div class="preview-toolbar">${renderThemeToggleButton()}</div>` : ""}
    <article class="gate-card">
      <div class="gate-hero">
        <div class="gate-lock-ring">
          <div class="gate-lock-icon">${GATE_LOCK_ICON}</div>
        </div>
        <span class="gate-badge">Доступ закрыт</span>
        <h1 class="gate-title">Вам сюда нельзя <span class="gate-title-smile">:)</span></h1>
        <p class="gate-lead">
          Оплатите подписку на сайте
          <span class="gate-lead-site">rollerbot.pro</span>
        </p>
      </div>
      <div class="gate-actions">
        <a href="${siteUrl}" class="gate-cta-btn" id="gateSubscribeBtn" target="_blank" rel="noopener noreferrer">
          ${GATE_EXTERNAL_ICON}
          Перейти на rollerbot.pro
        </a>
      </div>
      <div class="gate-tip">
        <span class="gate-tip-icon">${GATE_TIP_ICON}</span>
        <p class="gate-tip-text">Если вы участник розыгрыша — нажимайте «Участвовать» в посте канала, а не «Панель».</p>
      </div>
    </article>
  </div>
  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: isPreview || process.env.WEB_ONLY === "true" })}
    (function () {
      const btn = document.getElementById("gateSubscribeBtn");
      if (!btn) return;
      btn.addEventListener("click", function (event) {
        const tg = window.Telegram?.WebApp;
        if (!tg?.openLink) return;
        event.preventDefault();
        tg.openLink("${siteUrl}");
      });
    })();
  </script>
</body>
</html>`;
}

function renderRecaptchaWidgetMarkup() {
  return `<div id="mockRecaptcha" class="mock-recaptcha" role="group" aria-label="reCAPTCHA">
    <div class="mock-recaptcha-main">
      <div class="mock-recaptcha-check" id="recaptchaCheckBox" aria-hidden="true">
        <svg class="mock-recaptcha-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.8 12.5l1.4-1.4 2.3 2.3 6.3-6.3 1.4 1.4z"/></svg>
        <span class="mock-recaptcha-spinner"></span>
      </div>
      <span class="mock-recaptcha-label">Я не робот</span>
    </div>
    <div class="mock-recaptcha-brand" aria-hidden="true">
      <svg class="mock-recaptcha-logo" viewBox="0 0 64 64" aria-hidden="true">
        <path fill="#1c3aa9" d="M32 6a26 26 0 1 0 0 52 26 26 0 0 0 0-52zm-8.2 36.5-7.3-7.3 3.2-3.2 4.1 4.1 11.8-11.8 3.2 3.2z"/>
        <path fill="#4285f4" d="M32 6v10.4A15.6 15.6 0 0 1 47.6 32H58A26 26 0 0 0 32 6z"/>
        <path fill="#ab3928" d="M32 58V47.6A15.6 15.6 0 0 1 16.4 32H6A26 26 0 0 0 32 58z"/>
        <path fill="#008000" d="M58 32A26 26 0 0 1 32 58V47.6A15.6 15.6 0 0 0 47.6 32H58z"/>
      </svg>
      <div class="mock-recaptcha-brand-text">
        <span>reCAPTCHA</span>
        <small>Конфиденциальность · Условия</small>
      </div>
    </div>
  </div>
  <div id="googleRecaptcha" class="google-recaptcha hidden"></div>`;
}

function getRecaptchaStyles() {
  return `
    .mock-recaptcha {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 74px;
      padding: 0 12px 0 14px;
      border: 1px solid #d3d3d3;
      border-radius: 3px;
      background: #f9f9f9;
      box-shadow: 0 0 1px rgba(0, 0, 0, 0.08);
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .mock-recaptcha-main {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .mock-recaptcha-check {
      width: 28px;
      height: 28px;
      border: 2px solid #c1c1c1;
      border-radius: 2px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      position: relative;
    }
    .mock-recaptcha-mark {
      width: 22px;
      height: 22px;
      fill: #fff;
      opacity: 0;
      transform: scale(0.7);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .mock-recaptcha-spinner {
      position: absolute;
      inset: 3px;
      border: 2px solid #c1c1c1;
      border-top-color: #4285f4;
      border-radius: 50%;
      opacity: 0;
      animation: none;
    }
    .mock-recaptcha-label {
      font-size: 14px;
      line-height: 1.2;
      color: #000;
    }
    .mock-recaptcha-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      flex-shrink: 0;
      width: 72px;
      text-align: center;
    }
    .mock-recaptcha-logo {
      width: 32px;
      height: 32px;
      display: block;
    }
    .mock-recaptcha-brand-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      color: #555;
    }
    .mock-recaptcha-brand-text span {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1;
    }
    .mock-recaptcha-brand-text small {
      font-size: 8px;
      line-height: 1.1;
      color: #777;
    }
    .mock-recaptcha.is-loading {
      cursor: wait;
    }
    .mock-recaptcha.is-loading .mock-recaptcha-check {
      border-color: transparent;
      background: transparent;
    }
    .mock-recaptcha.is-loading .mock-recaptcha-spinner {
      opacity: 1;
      animation: recaptcha-spin 0.8s linear infinite;
    }
    .mock-recaptcha.is-checked {
      cursor: default;
    }
    .mock-recaptcha.is-checked .mock-recaptcha-check {
      border-color: #00a550;
      background: #00a550;
    }
    .mock-recaptcha.is-checked .mock-recaptcha-mark {
      opacity: 1;
      transform: scale(1);
    }
    .mock-recaptcha.is-error .mock-recaptcha-check {
      border-color: #d93025;
      animation: recaptcha-shake 0.35s ease;
    }
    .google-recaptcha {
      display: flex;
      justify-content: center;
    }
    @keyframes recaptcha-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes recaptcha-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
  `;
}

const JOIN_BTN_SPINNER = `<svg class="join-btn-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="42" stroke-dashoffset="12"/></svg>`;
const JOIN_BTN_LOCK = `<svg class="join-btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const JOIN_BTN_CHECK = `<svg class="join-btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
const JOIN_BTN_PASTE = `<svg class="join-btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`;
const JOIN_REF_STATUS_ERROR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
const JOIN_REF_STATUS_OK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>`;
const JOIN_DONE_BELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
const JOIN_DONE_CLOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

const JOIN_STEP_ICONS = {
  captcha: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  registration: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  trc20: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`,
  done: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>`,
};

function renderJoinStepCard(stepId, stepNum, title, bodyHtml, extraClass = "") {
  return `<div id="step-${stepId}" class="card join-step-card join-step hidden ${extraClass}" data-step="${stepId}">
    <div class="join-step-head">
      <div class="join-step-icon">${JOIN_STEP_ICONS[stepId] || ""}</div>
      <div>
        <div class="join-step-badge">Шаг ${stepNum} из 3</div>
        <h2 class="join-step-title">${title}</h2>
      </div>
    </div>
    <div class="join-step-body">${bodyHtml}</div>
  </div>`;
}

function renderJoinPage(drawId, draw, project, options = {}) {
  const isPreview = drawId === "preview";
  const recaptchaSiteKey = options.recaptchaSiteKey || "";
  const refLink = escapeHtml(project?.refLink || "");
  const projectName = escapeHtml(project?.name || "проект");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  ${getMiniAppFontLinks()}
  <title>Участие в розыгрыше</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  ${recaptchaSiteKey ? '<script src="https://www.google.com/recaptcha/api.js?render=explicit" async defer></script>' : ""}
  <script>${getMiniAppHeadScript()}</script>
  <style>
    ${getRecaptchaStyles()}
    ${renderDesignBannerStyles()}
    .preview-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .preview-nav button {
      width: auto;
      flex: 1 1 auto;
      min-width: 72px;
      padding: 8px 10px;
      font-size: 12px;
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      color: var(--tg-theme-text-color, #334);
      border-radius: 10px;
      cursor: pointer;
    }
    .preview-nav button.active {
      background: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 12%, transparent);
      border-color: color-mix(in srgb, var(--tg-theme-button-color, #325fff) 35%, transparent);
      color: var(--tg-theme-link-color, #2d49cc);
    }
    .hidden { display: none !important; }
    ${getJoinFlowStyles()}
    ${isPreview ? getPreviewDevStyles() : ""}
    ${isPreview ? getJoinPreviewThemeStyles() : ""}
    ${getMiniAppStyles()}
  </style>
</head>
<body class="join-flow mini-app-shell${isPreview ? " join-preview" : ""}">
  ${renderDesignBanner()}
  <div class="join-container">
    <div id="previewToolbar" class="preview-toolbar hidden">
      <div id="previewNav" class="preview-nav"></div>
      ${isPreview ? renderThemeToggleButton() : ""}
    </div>
    ${renderJoinProgressMarkup()}
    <div id="message" class="msg hidden"></div>
    <div id="loading" class="loading">Загрузка...</div>
    <div class="join-steps-viewport" id="joinStepsViewport">

      ${renderJoinStepCard("captcha", 1, "Проверка", renderRecaptchaWidgetMarkup())}

      ${renderJoinStepCard(
        "registration",
        2,
        "Регистрация",
        `<p class="join-step-text">Зарегистрируйтесь на проекте, затем вернитесь сюда и подтвердите.</p>
        <div class="join-actions">
          <a class="join-btn join-btn-secondary" id="projectLink" href="${refLink}" target="_blank" rel="noopener">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span class="join-btn-label">Перейти на ${projectName}</span>
          </a>
          <button type="button" class="join-btn join-btn-secondary" id="refConfirmBtn"><span class="join-btn-label">Подтвердить статус реферала</span></button>
          <div id="refConfirmStatus" class="join-ref-status hidden" role="status"></div>
          <button type="button" class="join-btn join-btn-primary join-btn-locked" id="registrationDoneBtn" disabled>${JOIN_BTN_LOCK}<span class="join-btn-label">Я зарегистрировался</span></button>
        </div>`,
      )}

      ${renderJoinStepCard(
        "trc20",
        3,
        "TRC-20 адрес",
        `<p class="join-step-text">Отправьте TRC-20 адрес с проекта.</p>
        <div class="join-trc20-field">
          <label class="join-field-label" for="trc20Input">TRC-20 адрес</label>
          <div class="join-input-row">
            <input class="join-input join-input-trc20" id="trc20Input" placeholder="T..." autocomplete="off" />
            <button type="button" class="join-paste-btn" id="trc20PasteBtn" title="Вставить" aria-label="Вставить">${JOIN_BTN_PASTE}</button>
          </div>
        </div>
        <button type="button" class="join-btn join-btn-primary join-trc20-submit" id="trc20SubmitBtn">Участвовать</button>
        <p class="join-guide-heading">Инструкция</p>
        <div class="join-guide">
          <p class="join-guide-step"><span class="join-guide-step-num">1</span> Откройте депозит на проекте</p>
          <div class="join-guide-img-wrap"><img class="join-guide-img" src="/assets/trc20-guide/step-1.png" alt="Шаг 1" /></div>
          <p class="join-guide-step"><span class="join-guide-step-num">2</span> Выберите Tether TRC-20</p>
          <div class="join-guide-img-wrap"><img class="join-guide-img" src="/assets/trc20-guide/step-2.png" alt="Шаг 2" /></div>
          <p class="join-guide-step"><span class="join-guide-step-num">3</span> Скопируйте адрес</p>
          <div class="join-guide-img-wrap"><img class="join-guide-img" src="/assets/trc20-guide/step-3.png" alt="Шаг 3" /></div>
        </div>`,
      )}

      ${renderJoinStepCard(
        "done",
        3,
        "Готово",
        `<div class="join-done-panel">
          <div class="join-done-icon-ring">
            <div class="join-done-icon">${JOIN_STEP_ICONS.done}</div>
          </div>
          <p class="join-done-badge">Участие принято</p>
          <h3 id="doneText" class="join-done-title">Вы участвуете!</h3>
          <p class="join-done-sub">Ждём результатов розыгрыша.</p>
          <div class="join-done-tips">
            <div class="join-done-tip">
              <span class="join-done-tip-icon">${JOIN_DONE_BELL_ICON}</span>
              <p class="join-done-tip-text">При победе вам придёт уведомление о выигрыше.</p>
            </div>
            <div class="join-done-tip">
              <span class="join-done-tip-icon">${JOIN_DONE_CLOCK_ICON}</span>
              <p class="join-done-tip-text">Не забудьте отметиться вовремя, чтобы подтвердить участие и забрать приз.</p>
            </div>
          </div>
        </div>`,
        "join-done-card",
      )}

    </div>
  </div>

  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: true })}
    const PAGE_MODE = ${JSON.stringify(drawId === "app" ? "app" : drawId === "preview" ? "preview" : "draw")};
    let drawId = PAGE_MODE === "draw" ? ${JSON.stringify(drawId)} : "";
    let projectName = ${JSON.stringify(project?.name || "проект")};
    const RECAPTCHA_SITE_KEY = ${JSON.stringify(recaptchaSiteKey)};
    const tg = window.Telegram?.WebApp;

    function resolveDrawIdFromTelegram() {
      if (PAGE_MODE === "draw") return drawId;
      return String(tg?.initDataUnsafe?.start_param || "").trim();
    }

    function applyProjectMeta(meta) {
      projectName = meta?.project?.name || projectName;
      const refLink = meta?.project?.refLink || "";
      const link = document.getElementById("projectLink");
      if (link) {
        if (refLink) link.href = refLink;
        const label = link.querySelector(".join-btn-label");
        if (label) label.textContent = "Перейти на " + projectName;
      }
    }

    async function loadDrawMeta() {
      const res = await fetch("/api/join/" + encodeURIComponent(drawId) + "/meta");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Розыгрыш недоступен.");
      }
      applyProjectMeta(data);
    }
    let googleRecaptchaWidgetId = null;
    let mockRecaptchaBound = false;
    let refConfirmAttempts = 0;
    let refConfirmed = false;
    const REF_CONFIRM_LABEL = "Подтвердить статус реферала";
    const JOIN_BTN_SPINNER = ${JSON.stringify(JOIN_BTN_SPINNER)};
    const JOIN_BTN_LOCK = ${JSON.stringify(JOIN_BTN_LOCK)};
    const JOIN_BTN_CHECK = ${JSON.stringify(JOIN_BTN_CHECK)};
    const JOIN_REF_STATUS_ERROR_ICON = ${JSON.stringify(JOIN_REF_STATUS_ERROR_ICON)};
    const JOIN_REF_STATUS_OK_ICON = ${JSON.stringify(JOIN_REF_STATUS_OK_ICON)};

    function showRefStatus(kind, message) {
      const status = document.getElementById("refConfirmStatus");
      if (!status) return;
      const icon = kind === "error" ? JOIN_REF_STATUS_ERROR_ICON : JOIN_REF_STATUS_OK_ICON;
      status.className = "join-ref-status join-ref-status-" + kind;
      status.innerHTML =
        '<span class="join-ref-status-icon" aria-hidden="true">' + icon + "</span>" +
        '<span class="join-ref-status-text">' + message + "</span>";
      status.classList.remove("hidden");
    }

    function hideRefStatus() {
      const status = document.getElementById("refConfirmStatus");
      if (!status) return;
      status.className = "join-ref-status hidden";
      status.innerHTML = "";
    }

    function setRefConfirmIdle() {
      const btn = document.getElementById("refConfirmBtn");
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove("is-loading", "is-done");
      btn.innerHTML = '<span class="join-btn-label">' + REF_CONFIRM_LABEL + "</span>";
    }

    function setRefConfirmLoading() {
      const btn = document.getElementById("refConfirmBtn");
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.classList.remove("is-done");
      btn.innerHTML = JOIN_BTN_SPINNER + '<span class="join-btn-label">Проверка базы данных ' + projectName + "...</span>";
    }

    function setRefConfirmDone() {
      const btn = document.getElementById("refConfirmBtn");
      if (!btn) return;
      btn.disabled = true;
      btn.classList.remove("is-loading");
      btn.classList.add("is-done");
      btn.innerHTML = JOIN_BTN_CHECK + '<span class="join-btn-label">Реферал подтверждён</span>';
    }

    function setRegistrationLocked(locked) {
      const btn = document.getElementById("registrationDoneBtn");
      if (!btn) return;
      btn.disabled = locked;
      btn.classList.toggle("join-btn-locked", locked);
      btn.innerHTML = locked
        ? JOIN_BTN_LOCK + '<span class="join-btn-label">Я зарегистрировался</span>'
        : '<span class="join-btn-label">Я зарегистрировался</span>';
    }

    function initData() {
      return tg?.initData || "";
    }

    function resetMockRecaptcha() {
      const widget = document.getElementById("mockRecaptcha");
      if (!widget) return;
      widget.classList.remove("is-loading", "is-checked", "is-error");
      widget.dataset.state = "idle";
    }

    async function submitCaptcha(payload) {
      const data = await api("/api/join/" + encodeURIComponent(drawId) + "/captcha", payload);
      hideMessage();
      handleStep(data.step, data);
    }

    async function onMockRecaptchaActivate() {
      const widget = document.getElementById("mockRecaptcha");
      if (!widget || widget.dataset.state !== "idle") return;
      widget.classList.remove("is-error");
      widget.dataset.state = "loading";
      widget.classList.add("is-loading");
      const delay = 1200 + Math.floor(Math.random() * 900);
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (widget.dataset.state !== "loading") return;
      widget.classList.remove("is-loading");
      widget.classList.add("is-checked");
      widget.dataset.state = "checked";
      if (PAGE_MODE === "preview") return;
      try {
        await submitCaptcha({ verified: true });
      } catch (error) {
        widget.classList.remove("is-checked");
        widget.classList.add("is-error");
        widget.dataset.state = "idle";
        showMessage(error.message);
      }
    }

    function setupMockRecaptcha() {
      const widget = document.getElementById("mockRecaptcha");
      const google = document.getElementById("googleRecaptcha");
      if (google) google.classList.add("hidden");
      if (widget) widget.classList.remove("hidden");
      resetMockRecaptcha();
      if (mockRecaptchaBound || !widget) return;
      mockRecaptchaBound = true;
      widget.addEventListener("click", onMockRecaptchaActivate);
      widget.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onMockRecaptchaActivate();
        }
      });
      widget.tabIndex = 0;
    }

    function setupGoogleRecaptcha() {
      const mock = document.getElementById("mockRecaptcha");
      const google = document.getElementById("googleRecaptcha");
      if (mock) mock.classList.add("hidden");
      if (google) google.classList.remove("hidden");
      if (!window.grecaptcha || !RECAPTCHA_SITE_KEY) {
        setupMockRecaptcha();
        return;
      }
      google.innerHTML = "";
      googleRecaptchaWidgetId = window.grecaptcha.render(google, {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: async (token) => {
          if (PAGE_MODE === "preview") return;
          try {
            await submitCaptcha({ token });
          } catch (error) {
            if (googleRecaptchaWidgetId != null) {
              window.grecaptcha.reset(googleRecaptchaWidgetId);
            }
            showMessage(error.message);
          }
        },
      });
    }

    function renderCaptcha() {
      if (RECAPTCHA_SITE_KEY) {
        if (window.grecaptcha?.render) {
          setupGoogleRecaptcha();
        } else {
          window.addEventListener("load", setupGoogleRecaptcha, { once: true });
        }
      } else {
        setupMockRecaptcha();
      }
      showStep("captcha");
    }

    function showMessage(text, type) {
      const el = document.getElementById("message");
      el.textContent = text;
      el.className = "msg " + (type || "error");
      el.classList.remove("hidden");
    }

    function hideMessage() {
      document.getElementById("message").classList.add("hidden");
    }

    const JOIN_STEPS = ${JSON.stringify(JOIN_FLOW_STEPS)};
    let activeStep = null;
    let stepAnimTimer = null;

    function updateProgress(stepName) {
      const index = JOIN_STEPS.indexOf(stepName);
      if (index < 0) return;
      const fill = document.getElementById("joinProgressFill");
      if (fill) {
        fill.style.width = ((index + 1) / JOIN_STEPS.length * 100) + "%";
      }
      document.querySelectorAll(".join-progress-dot").forEach((dot, i) => {
        dot.classList.toggle("is-active", i === index);
        dot.classList.toggle("is-done", i < index);
      });
    }

    function showStep(name) {
      const next = document.getElementById("step-" + name);
      if (!next) return;
      document.getElementById("loading").classList.add("hidden");
      if (activeStep === name) return;

      const current = activeStep ? document.getElementById("step-" + activeStep) : null;
      if (current && current !== next) {
        current.classList.add("is-leaving");
        current.classList.remove("is-active");
        clearTimeout(stepAnimTimer);
        stepAnimTimer = setTimeout(() => {
          current.classList.add("hidden");
          current.classList.remove("is-leaving");
        }, 220);
      }

      next.classList.remove("hidden");
      requestAnimationFrame(() => {
        next.classList.add("is-active");
      });
      activeStep = name;
      updateProgress(name);
    }

    async function api(path, body) {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData(),
        },
        body: JSON.stringify({ ...body, initData: initData() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Ошибка запроса");
      }
      return data;
    }

    function showDoneStep(payload) {
      const title = document.getElementById("doneText");
      const badge = document.querySelector(".join-done-badge");
      const sub = document.querySelector(".join-done-sub");
      const message = payload.message || "Вы участвуете!";
      if (title) title.textContent = message;
      if (payload.alreadyJoined) {
        if (badge) badge.textContent = "Уже в розыгрыше";
        if (sub) sub.textContent = "Вы ранее зарегистрировались — участие сохранено.";
      } else {
        if (badge) badge.textContent = "Участие принято";
        if (sub) sub.textContent = "Ждём результатов розыгрыша.";
      }
      showStep("done");
      if (!payload.alreadyJoined && tg?.close) {
        setTimeout(() => tg.close(), 2500);
      }
    }

    function handleStep(step, payload) {
      if (step === "captcha") {
        renderCaptcha();
        return;
      }
      if (step === "registration") {
        resetRefConfirmUi();
        showStep("registration");
        return;
      }
      if (step === "trc20") {
        showStep("trc20");
        return;
      }
      if (step === "done") {
        showDoneStep(payload || {});
      }
    }

    function resetRefConfirmUi() {
      refConfirmAttempts = 0;
      refConfirmed = false;
      const refStatus = document.getElementById("refConfirmStatus");
      setRefConfirmIdle();
      if (refStatus) {
        hideRefStatus();
      }
      setRegistrationLocked(true);
    }

    document.getElementById("refConfirmBtn").addEventListener("click", async () => {
      const btn = document.getElementById("refConfirmBtn");
      const status = document.getElementById("refConfirmStatus");
      if (!btn || refConfirmed || btn.disabled) return;

      const isFirstAttempt = refConfirmAttempts === 0;
      setRefConfirmLoading();
      hideRefStatus();

      const delay = isFirstAttempt
        ? 8000 + Math.floor(Math.random() * 7000)
        : 2000 + Math.floor(Math.random() * 3000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      refConfirmAttempts += 1;
      btn.classList.remove("is-loading");

      if (isFirstAttempt) {
        setRefConfirmIdle();
        showRefStatus("error", "Аккаунт не найден. Попробуйте ещё раз.");
        return;
      }

      refConfirmed = true;
      setRefConfirmDone();
      showRefStatus("ok", "Аккаунт подтверждён");
      setRegistrationLocked(false);
    });

    document.getElementById("registrationDoneBtn").addEventListener("click", async () => {
      if (!refConfirmed) {
        showMessage("Сначала подтвердите статус реферала.");
        return;
      }
      const btn = document.getElementById("registrationDoneBtn");
      btn.disabled = true;
      try {
        const data = await api("/api/join/" + encodeURIComponent(drawId) + "/registration", { action: "opened" });
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("trc20PasteBtn").addEventListener("click", async () => {
      const input = document.getElementById("trc20Input");
      if (!input) return;
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          input.value = text.trim();
          input.focus();
        }
      } catch (error) {
        showMessage("Не удалось вставить из буфера обмена.");
      }
    });

    document.getElementById("trc20SubmitBtn").addEventListener("click", async () => {
      const address = document.getElementById("trc20Input").value.trim();
      try {
        const data = await api("/api/join/" + encodeURIComponent(drawId) + "/trc20", { address });
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      }
    });

    (async () => {
      if (PAGE_MODE === "preview") {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("previewToolbar").classList.remove("hidden");
        const nav = document.getElementById("previewNav");
        const steps = [
          { id: "captcha", label: "Капча" },
          { id: "registration", label: "Рег." },
          { id: "trc20", label: "TRC-20" },
          { id: "done", label: "Готово" },
        ];
        steps.forEach(({ id, label }) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = label;
          btn.addEventListener("click", () => {
            nav.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            if (id === "captcha") {
              renderCaptcha();
            }
            if (id === "registration") {
              resetRefConfirmUi();
            }
            if (id === "done") {
              showDoneStep({ message: "Вы участвуете!", alreadyJoined: false });
              return;
            }
            showStep(id);
          });
          nav.appendChild(btn);
        });
        nav.querySelector("button")?.click();
        return;
      }

      if (!initData()) {
        document.getElementById("loading").classList.add("hidden");
        showMessage("Откройте участие через кнопку в Telegram.");
        return;
      }

      if (PAGE_MODE === "app") {
        drawId = resolveDrawIdFromTelegram();
        if (!drawId) {
          document.getElementById("loading").classList.add("hidden");
          showMessage("Не указан розыгрыш. Нажмите «Участвовать» в посте канала.");
          return;
        }
      }

      try {
        if (PAGE_MODE === "app") {
          await loadDrawMeta();
        }
        const data = await api("/api/join/" + encodeURIComponent(drawId) + "/session", {});
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        document.getElementById("loading").classList.add("hidden");
        showMessage(error.message);
      }
    })();
  </script>
</body>
</html>`;
}

function registerJoinMiniApp(app, deps) {
  const {
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
    RECAPTCHA_SITE_KEY = "",
    RECAPTCHA_SECRET_KEY = "",
  } = deps;

  async function verifyRecaptchaToken(token) {
    if (!RECAPTCHA_SECRET_KEY || !token) return false;
    try {
      const params = new URLSearchParams({
        secret: RECAPTCHA_SECRET_KEY,
        response: token,
      });
      const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  }

  function joinSessionKey(userId, drawId) {
    return `${userId}:${drawId}`;
  }

  function getJoinApiSession(userId, drawId) {
    return joinSessions.get(joinSessionKey(userId, drawId));
  }

  function setJoinApiSession(userId, drawId, session) {
    joinSessions.set(joinSessionKey(userId, drawId), session);
  }

  function clearJoinApiSession(userId, drawId) {
    joinSessions.delete(joinSessionKey(userId, drawId));
  }

  function resolveTelegramUser(req) {
    const initData =
      req.headers["x-telegram-init-data"] || req.body?.initData || req.query?.initData;
    const user = validateInitData(initData, BOT_TOKEN);
    if (!user?.id) {
      return null;
    }
    upsertUserMeta(user);
    return user;
  }

  function requireJoinUser(req, res, next) {
    const user = resolveTelegramUser(req);
    if (!user) {
      res.status(401).json({ error: "Откройте через Telegram." });
      return;
    }
    req.telegramUser = user;
    next();
  }

  function getActiveDraw(drawId) {
    const data = readData();
    const draw = data.draws.find((item) => item.id === drawId);
    if (!draw || draw.status !== DRAW_STATUS.ACTIVE) {
      return null;
    }
    return draw;
  }

  function buildJoinStepResponse(step, extra = {}) {
    return { step, ...extra };
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

  async function resolveJoinEntry(draw, userId) {
    if (draw.participantIds.includes(userId)) {
      clearJoinApiSession(userId, draw.id);
      return buildJoinStepResponse("done", {
        message: "Вы уже участвуете!",
        alreadyJoined: true,
      });
    }

    if (draw.projectId && userParticipatedInProject(userId, draw.projectId, draw.id)) {
      const result = await addUserToDraw(draw.id, userId);
      clearJoinApiSession(userId, draw.id);
      return buildJoinStepResponse("done", {
        message: result.already ? "Вы уже участвуете!" : "Вы участвуете!",
        alreadyJoined: Boolean(result.already),
      });
    }

    if (!draw.projectId) {
      const result = await addUserToDraw(draw.id, userId);
      clearJoinApiSession(userId, draw.id);
      return buildJoinStepResponse("done", {
        message: result.already ? "Вы уже участвуете!" : "Вы участвуете!",
        alreadyJoined: Boolean(result.already),
      });
    }

    const profile = getUserProjectProfile(userId, draw.projectId);
    const canSkip = (profile?.referralVerified || profile?.selfReportedNonReferral) && profile?.trc20Address;
    if (canSkip) {
      const result = await addUserToDraw(draw.id, userId);
      clearJoinApiSession(userId, draw.id);
      return buildJoinStepResponse("done", {
        message: result.already ? "Вы уже участвуете!" : "Вы участвуете!",
        alreadyJoined: Boolean(result.already),
      });
    }

    return null;
  }

  app.use("/assets", express.static(deps.ASSETS_DIR));

  app.get("/api/join/:drawId/meta", (req, res) => {
    const draw = getActiveDraw(req.params.drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }
    const project = draw.projectId ? getProjectById(draw.projectId) : null;
    res.json({
      drawId: draw.id,
      prize: draw.prize || "",
      project: project
        ? {
            name: project.name || "",
            refLink: project.refLink || "",
          }
        : null,
    });
  });

  app.get("/join/app", (_req, res) => {
    res
      .type("html")
      .send(
        renderJoinPage("app", { id: "app", status: DRAW_STATUS.ACTIVE, projectId: null }, null, {
          recaptchaSiteKey: RECAPTCHA_SITE_KEY,
        }),
      );
  });

  app.get("/join/:drawId", (req, res) => {
    if (req.params.drawId === "app") {
      res.redirect(301, "/join/app");
      return;
    }
    const draw = getActiveDraw(req.params.drawId);
    if (!draw) {
      res.status(404).type("html").send("<h1>Розыгрыш недоступен</h1>");
      return;
    }
    const project = draw.projectId ? getProjectById(draw.projectId) : null;
    res.type("html").send(renderJoinPage(req.params.drawId, draw, project, { recaptchaSiteKey: RECAPTCHA_SITE_KEY }));
  });

  app.post("/api/join/:drawId/session", requireJoinUser, async (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }

    const entry = await resolveJoinEntry(draw, userId);
    if (entry) {
      res.json(entry);
      return;
    }

    let session = getJoinApiSession(userId, drawId);
    if (!session) {
      session = {
        userId,
        drawId,
        projectId: draw.projectId,
        step: "captcha",
      };
      setJoinApiSession(userId, drawId, session);
    }

    if (session.step === "captcha") {
      res.json(buildJoinStepResponse("captcha"));
      return;
    }
    if (session.step === "registration" || session.step === "registration_confirm") {
      res.json(buildJoinStepResponse("registration"));
      return;
    }
    if (session.step === "await_ref_nickname") {
      res.json(buildJoinStepResponse("trc20"));
      return;
    }
    if (session.step === "await_trc20") {
      res.json(buildJoinStepResponse("trc20"));
      return;
    }

    res.json(buildJoinStepResponse("captcha"));
  });

  app.post("/api/join/:drawId/captcha", requireJoinUser, async (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }

    const entry = await resolveJoinEntry(draw, userId);
    if (entry) {
      res.json(entry);
      return;
    }

    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела. Обновите страницу." });
      return;
    }

    if (session.step !== "captcha") {
      res.status(400).json({ error: "Сессия устарела. Обновите страницу." });
      return;
    }

    const token = String(req.body?.token || "").trim();
    if (RECAPTCHA_SECRET_KEY && token) {
      const ok = await verifyRecaptchaToken(token);
      if (!ok) {
        res.status(400).json({ error: "Проверка не пройдена. Попробуйте ещё раз.", step: "captcha" });
        return;
      }
    } else if (req.body?.verified !== true) {
      res.status(400).json({ error: "Подтвердите, что вы не робот.", step: "captcha" });
      return;
    }

    session.step = "registration";
    setJoinApiSession(userId, drawId, session);
    res.json(buildJoinStepResponse("registration"));
  });

  function applyReferralRoll(userId, session) {
    const isNonReferral = Math.random() < NON_REFERRAL_CHANCE;
    if (isNonReferral) {
      setUserProjectProfile(userId, session.projectId, {
        referralVerified: false,
        selfReportedNonReferral: true,
        nonReferralMarkedAt: new Date().toISOString(),
      });
      session.skipReferralCheck = true;
    } else {
      setUserProjectProfile(userId, session.projectId, {
        referralVerified: true,
        selfReportedNonReferral: false,
        referralCheckedAt: new Date().toISOString(),
      });
      session.skipReferralCheck = false;
    }
    return isNonReferral;
  }

  app.post("/api/join/:drawId/registration", requireJoinUser, async (req, res) => {
    const userId = req.telegramUser.id;
    const drawId = req.params.drawId;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }

    const entry = await resolveJoinEntry(draw, userId);
    if (entry) {
      res.json(entry);
      return;
    }

    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела." });
      return;
    }
    applyReferralRoll(userId, session);
    session.step = "await_trc20";
    setJoinApiSession(userId, drawId, session);
    res.json(buildJoinStepResponse("trc20"));
  });

  app.post("/api/join/:drawId/trc20", requireJoinUser, async (req, res) => {
    const userId = req.telegramUser.id;
    const drawId = req.params.drawId;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }

    const entry = await resolveJoinEntry(draw, userId);
    if (entry) {
      res.json(entry);
      return;
    }

    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела." });
      return;
    }

    const address = String(req.body?.address || "").trim();
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      res.status(400).json({ error: "Неверный формат TRC-20 адреса." });
      return;
    }

    setUserProjectProfile(userId, session.projectId, {
      referralVerified: session.skipReferralCheck ? false : true,
      selfReportedNonReferral: Boolean(session.skipReferralCheck),
      trc20Address: address,
      verifiedBy: "miniapp",
    });

    const result = await addUserToDraw(drawId, userId);
    clearJoinApiSession(userId, drawId);

    res.json(
      buildJoinStepResponse("done", {
        message: result.already ? "Вы уже участвуете!" : "Вы участвуете!",
        alreadyJoined: Boolean(result.already),
      }),
    );
  });

  if (deps.designPreview) {
    const mockDraw = {
      id: "preview",
      prize: "50 000 ₽",
      status: DRAW_STATUS.ACTIVE,
      projectId: "demo",
    };
    const mockProject = {
      name: "Demo Project",
      refLink: "https://example.com/ref",
    };

    app.get("/dev/preview/join", (_req, res) => {
      res.type("html").send(renderJoinPage("preview", mockDraw, mockProject, { recaptchaSiteKey: RECAPTCHA_SITE_KEY }));
    });

    app.get("/dev/preview/gate", (_req, res) => {
      res.type("html").send(renderOrganizerGatePage(deps.BOT_USERNAME || "bot", { isPreview: true }));
    });
  }
}

module.exports = { renderOrganizerGatePage, registerJoinMiniApp };
