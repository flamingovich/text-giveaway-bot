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
  getJoinPreviewThemeStyles,
  renderThemeToggleButton,
  renderJoinProgressMarkup,
  JOIN_FLOW_STEPS,
} = require("./miniapp-ui");
const { getAvatarFallbackStyle } = require("./avatar-fallback");
const { buildParticipantProfileUrl, getMiniAppProfileNavigateScript } = require("./participant-profile");

const NON_REFERRAL_CHANCE = 0.35;
const JOIN_BOOST_ARROW_ICON = `<svg class="join-boost-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 19V5"/><path d="m7 10 5-5 5 5"/></svg>`;

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
const JOIN_INFO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v5"/><circle cx="12" cy="7.5" r="0.75" fill="currentColor" stroke="none"/></svg>`;

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

function renderJoinChannelStepCard(bodyHtml) {
  return `<div id="step-channel" class="card join-step-card join-step join-channel-card hidden" data-step="channel">
    <div class="join-step-body">${bodyHtml}</div>
  </div>`;
}

function renderJoinPage(drawId, draw, project, options = {}) {
  const isPreview = drawId === "preview";
  const recaptchaSiteKey = options.recaptchaSiteKey || "";
  const apiBase = String(options.apiBase || "").replace(/\/$/, "");
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
    <div id="loadingRetry" class="loading hidden">
      <p id="loadingRetryText" class="loading-retry-text"></p>
      <button type="button" class="join-btn join-btn-primary" id="loadingRetryBtn">Повторить</button>
    </div>
    <div class="join-steps-viewport" id="joinStepsViewport">

      ${renderJoinStepCard("captcha", 1, "Проверка", renderRecaptchaWidgetMarkup())}

      ${renderJoinChannelStepCard(
        `<div class="join-channel-panel">
          <p class="join-channel-lead">Чтобы участвовать в розыгрыше, нужно быть подписанным на канал:</p>
          <div class="join-channel-hero">
            <div class="join-channel-avatar-wrap">
              <img id="joinChannelAvatar" class="join-channel-avatar hidden" alt="" />
              <span id="joinChannelAvatarFallback" class="join-channel-avatar-fallback" aria-hidden="true">📢</span>
            </div>
            <p class="join-channel-name" id="joinChannelTitle">Канал</p>
          </div>
          <div class="join-channel-actions join-actions">
            <a class="join-btn join-btn-secondary" id="joinChannelOpenBtn" href="#" target="_blank" rel="noopener">
              <span class="join-btn-label">Открыть канал</span>
            </a>
            <button type="button" class="join-btn join-btn-primary" id="joinChannelCheckBtn">
              <span class="join-btn-label">Я подписался</span>
            </button>
          </div>
        </div>`,
      )}

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
          <div id="joinDoneStats" class="join-done-stats hidden">
            <div class="join-done-stat-col">
              <strong id="joinDoneCount" class="join-done-stat-value">0</strong>
              <span class="join-done-stat-label">участников</span>
            </div>
            <div class="join-done-stat-col">
              <strong id="joinDoneChance" class="join-done-stat-value join-done-stat-value-accent">0%</strong>
              <span class="join-done-stat-label join-done-stat-label-chance">
                <span class="join-done-stat-label-text">шанс</span>
                <button type="button" class="join-done-info-btn" id="joinDoneChanceInfoBtn" aria-label="Как считается шанс">${JOIN_INFO_ICON}</button>
              </span>
            </div>
            <div class="join-done-stat-col">
              <strong id="joinDoneTimer" class="join-done-stat-value join-done-stat-value-timer">—</strong>
              <span class="join-done-stat-label">до конца</span>
            </div>
          </div>
          <div id="joinDoneChanceInfo" class="join-done-info-modal hidden" role="dialog" aria-modal="true" aria-labelledby="joinDoneChanceInfoTitle">
            <button type="button" class="join-done-info-backdrop" id="joinDoneChanceInfoBackdrop" aria-label="Закрыть"></button>
            <div class="join-done-info-card">
              <h4 id="joinDoneChanceInfoTitle" class="join-done-info-title">Как считается шанс</h4>
              <p class="join-done-info-text">Базовый процент — ваша доля при <b>текущем</b> числе участников и призовых местах. Каждый приглашённый друг добавляет <b>+50%</b> к шансу (например, 5% + 50% = 55%, а не 7,5%). При новых участниках база уменьшается; бонус за друзей сохраняется.</p>
              <button type="button" class="join-btn join-btn-primary join-done-info-close" id="joinDoneChanceInfoClose">Понятно</button>
            </div>
          </div>
          <button type="button" class="join-btn join-btn-gradient join-done-boost-btn" id="joinDoneBoostBtn">✨ Увеличить шансы</button>
          <div class="join-done-tips">
            <div class="join-done-tip">
              <span class="join-done-tip-icon">${JOIN_DONE_BELL_ICON}</span>
              <p class="join-done-tip-text">При победе вам придёт уведомление о выигрыше.</p>
            </div>
            <div class="join-done-tip">
              <span class="join-done-tip-icon">${JOIN_DONE_CLOCK_ICON}</span>
              <p class="join-done-tip-text">Не забудьте отметиться вовремя в боте, чтобы забрать приз.</p>
            </div>
          </div>
          <div id="joinDoneParticipants" class="join-done-participants hidden">
            <h4 class="join-done-participants-title">Участники</h4>
            <div id="joinDoneList" class="join-done-list"></div>
          </div>
        </div>`,
        "join-done-card",
      )}

    </div>
  </div>

  <div id="joinBoostBackdrop" class="join-boost-backdrop hidden" aria-hidden="true"></div>
  <aside id="joinBoostSheet" class="join-boost-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="joinBoostTitle">
    <div class="join-boost-card">
      <button type="button" class="join-boost-close" id="joinBoostCloseBtn" aria-label="Закрыть">×</button>
      <div class="join-boost-badge" id="joinBoostBadge">+0% ${JOIN_BOOST_ARROW_ICON}</div>
      <h3 class="join-boost-title" id="joinBoostTitle">Увеличить шансы на победу</h3>
      <p class="join-boost-counter" id="joinBoostCounter">Приглашено друзей: 0/10</p>
      <p class="join-boost-text">Пригласите друзей и получите дополнительные билеты! Каждый приглашённый друг даёт вам дополнительный билет и <b>+50%</b> к шансу на победу (добавляется к вашему проценту).</p>
      <div class="join-boost-actions">
        <p class="join-boost-link-preview hidden" id="joinBoostLinkPreview"></p>
        <button type="button" class="join-btn join-btn-gradient" id="joinBoostGenerateBtn">✨ Сгенерировать ссылку</button>
      </div>
    </div>
  </aside>

  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: true })}
    ${getMiniAppProfileNavigateScript()}
    const PAGE_MODE = ${JSON.stringify(drawId === "app" ? "app" : drawId === "preview" ? "preview" : "draw")};
    const PAGE_BUILD = ${JSON.stringify(JOIN_PAGE_BUILD)};
    const API_BASE = ${JSON.stringify(apiBase)};
    let drawId = PAGE_MODE === "draw" ? ${JSON.stringify(drawId)} : "";

    function apiUrl(path) {
      if (!path) return API_BASE || "";
      if (path.indexOf("http://") === 0 || path.indexOf("https://") === 0) return path;
      return (API_BASE || "") + path;
    }
    let projectName = ${JSON.stringify(project?.name || "проект")};
    const RECAPTCHA_SITE_KEY = ${JSON.stringify(recaptchaSiteKey)};
    const tg = window.Telegram?.WebApp;

    function parseStartParamFromInitData(raw) {
      if (!raw) return "";
      try {
        return String(new URLSearchParams(raw).get("start_param") || "").trim();
      } catch (_error) {
        return "";
      }
    }

    let joinReferrerId = null;

    function parseJoinStartParamClient(raw) {
      const value = String(raw || "").trim();
      if (!value) return { drawId: "", referrerId: null };
      const sep = "__ref__";
      const idx = value.indexOf(sep);
      if (idx < 0) return { drawId: value, referrerId: null };
      const referrerRaw = value.slice(idx + sep.length).trim();
      const referrerId = /^\\d+$/.test(referrerRaw) ? Number(referrerRaw) : null;
      return { drawId: value.slice(0, idx).trim(), referrerId };
    }

    function applyJoinStartParam(raw) {
      const parsed = parseJoinStartParamClient(raw);
      if (parsed.referrerId) joinReferrerId = parsed.referrerId;
      return parsed.drawId;
    }

    function resolveDrawIdFromTelegram() {
      if (PAGE_MODE === "draw") {
        const params = new URLSearchParams(window.location.search || "");
        const raw = String(
          params.get("tgWebAppStartParam") || params.get("startapp") || "",
        ).trim();
        if (raw) applyJoinStartParam(raw);
        return drawId;
      }
      const fromUnsafe = String(tg?.initDataUnsafe?.start_param || "").trim();
      if (fromUnsafe) return applyJoinStartParam(fromUnsafe);
      const fromInitData = parseStartParamFromInitData(initData());
      if (fromInitData) return applyJoinStartParam(fromInitData);
      const params = new URLSearchParams(window.location.search || "");
      const raw = String(
        params.get("tgWebAppStartParam") || params.get("startapp") || params.get("drawId") || "",
      ).trim();
      return applyJoinStartParam(raw);
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
      const res = await fetch(apiUrl("/api/join/" + encodeURIComponent(drawId) + "/meta"), {
        cache: "no-store",
      });
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
    const JOIN_BOOST_ARROW_HTML = ${JSON.stringify(JOIN_BOOST_ARROW_ICON)};

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

    function hideLoading() {
      const loading = document.getElementById("loading");
      if (!loading) return;
      loading.classList.add("hidden");
      loading.style.display = "none";
    }

    function showStep(name) {
      const next = document.getElementById("step-" + name);
      if (!next) return;
      hideLoading();
      if (activeStep === name) return;

      if (activeStep === "done" && name !== "done") {
        stopDoneLivePolling();
        stopDoneCountdown();
        cancelJoinBoostAutoOpen();
        closeJoinBoostSheet();
      }

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

    async function api(path, body, options = {}) {
      const timeoutMs = options.timeoutMs || 20000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(apiUrl(path), {
          method: "POST",
          signal: controller.signal,
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": initData(),
          },
          body: JSON.stringify({
            ...body,
            initData: initData(),
            ...(joinReferrerId ? { referrerId: joinReferrerId } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Ошибка запроса");
        }
        return data;
      } catch (error) {
        if (error.name === "AbortError") {
          throw new Error("Сервер не ответил вовремя. Закройте и откройте участие снова.");
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function formatWinChance(percent) {
      const value = Number(percent);
      if (!Number.isFinite(value) || value <= 0) return "0%";
      if (value >= 100) return "100%";
      return value.toFixed(2).replace(".", ",") + "%";
    }

    let doneCountdownTimer = null;

    function formatRemaining(endAtISO) {
      if (!endAtISO) return "—";
      const end = new Date(endAtISO).getTime();
      if (!Number.isFinite(end)) return "—";
      const diff = end - Date.now();
      if (diff <= 0) return "Завершён";
      const totalSec = Math.floor(diff / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      if (days > 0) return days + "д " + hours + "ч";
      if (hours > 0) {
        return hours + "ч " + String(mins).padStart(2, "0") + "м";
      }
      return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
    }

    function stopDoneCountdown() {
      if (doneCountdownTimer) {
        clearInterval(doneCountdownTimer);
        doneCountdownTimer = null;
      }
    }

    const DONE_LIVE_POLL_MS = 2500;
    let doneLiveTimer = null;
    let doneListSignature = "";
    let doneCountdownEndAt = "";

    function buildParticipantListSignature(participants) {
      return (Array.isArray(participants) ? participants : [])
        .map((participant) => {
          return (
            String(participant.id || "") +
            ":" +
            String(participant.avatarUrl || "") +
            ":" +
            String(participant.displayName || "") +
            ":" +
            String(participant.username || "") +
            (participant.isYou ? ":you" : "")
          );
        })
        .join("|");
    }

    function stopDoneLivePolling() {
      if (doneLiveTimer) {
        clearTimeout(doneLiveTimer);
        doneLiveTimer = null;
      }
    }

    async function refreshDoneLiveState() {
      if (!drawId || PAGE_MODE === "preview" || activeStep !== "done") return;
      try {
        const data = await api("/api/join/" + encodeURIComponent(drawId) + "/live", {});
        renderDoneStats(data);
        updateJoinBoostUi(data);
        if (data.endAt && formatRemaining(data.endAt) === "Завершён") {
          stopDoneLivePolling();
        }
      } catch (error) {
        // Фоновое обновление не должно мешать экрану участия.
      }
    }

    function scheduleDoneLivePoll(delayMs = DONE_LIVE_POLL_MS) {
      stopDoneLivePolling();
      doneLiveTimer = setTimeout(async () => {
        doneLiveTimer = null;
        if (activeStep !== "done") return;
        await refreshDoneLiveState();
        if (activeStep === "done") {
          scheduleDoneLivePoll();
        }
      }, delayMs);
    }

    function startDoneLivePolling(initialPayload) {
      doneListSignature = initialPayload
        ? buildParticipantListSignature(initialPayload.participants)
        : "";
      if (PAGE_MODE === "preview" || activeStep !== "done") return;
      refreshDoneLiveState();
      scheduleDoneLivePoll(DONE_LIVE_POLL_MS);
    }

    function updateDoneCountdown(endAtISO) {
      const nextEndAt = endAtISO || "";
      if (nextEndAt === doneCountdownEndAt) {
        return;
      }
      doneCountdownEndAt = nextEndAt;
      startDoneCountdown(nextEndAt);
    }

    function startDoneCountdown(endAtISO) {
      stopDoneCountdown();
      const timerEl = document.getElementById("joinDoneTimer");
      if (!timerEl) return;
      const tick = () => {
        timerEl.textContent = formatRemaining(endAtISO);
        if (formatRemaining(endAtISO) === "Завершён") {
          stopDoneCountdown();
        }
      };
      tick();
      if (endAtISO) {
        doneCountdownTimer = setInterval(tick, 1000);
      }
    }

    function ensureDoneAvatarNodes(avatarEl, participant) {
      let img = avatarEl.querySelector(".join-done-avatar-img");
      let fallback = avatarEl.querySelector(".join-done-avatar-fallback");
      if (!fallback) {
        fallback = document.createElement("div");
        fallback.className = "join-done-avatar-fallback";
        avatarEl.appendChild(fallback);
      }
      fallback.textContent = participant.initial || "?";
      if (participant.fallbackStyle) {
        fallback.setAttribute("style", participant.fallbackStyle);
      } else {
        fallback.removeAttribute("style");
      }

      const nextUrl = String(participant.avatarUrl || "");
      const currentUrl = img ? img.getAttribute("src") || "" : "";

      if (!nextUrl) {
        if (img) {
          img.remove();
        }
        fallback.classList.remove("hidden");
        return;
      }

      if (!img) {
        img = document.createElement("img");
        img.alt = "";
        img.className = "join-done-avatar-img";
        img.loading = "lazy";
        img.addEventListener("error", () => {
          img.classList.add("hidden");
          fallback.classList.remove("hidden");
        });
        avatarEl.insertBefore(img, fallback);
      }

      if (currentUrl !== nextUrl) {
        img.classList.remove("hidden");
        fallback.classList.add("hidden");
        img.setAttribute("src", nextUrl);
      } else if (!img.classList.contains("hidden")) {
        fallback.classList.add("hidden");
      }
    }

    function updateDoneParticipantRow(row, participant) {
      const id = String(participant.id || "");
      if (row.dataset.participantId !== id) {
        row.dataset.participantId = id;
      }
      row.classList.toggle("join-done-row-you", Boolean(participant.isYou));

      const avatarEl = row.querySelector(".join-done-avatar");
      if (avatarEl) {
        ensureDoneAvatarNodes(avatarEl, participant);
      }

      const nameEl = row.querySelector(".join-done-row-name");
      if (nameEl) {
        nameEl.textContent = participant.displayName || "";
      }

      const handleEl = row.querySelector(".join-done-row-handle");
      if (handleEl) {
        if (participant.username) {
          handleEl.textContent = participant.username;
          handleEl.classList.remove("join-done-row-handle-muted");
        } else {
          handleEl.textContent = "без username";
          handleEl.classList.add("join-done-row-handle-muted");
        }
      }

      const youBadge = row.querySelector(".join-done-you");
      if (participant.isYou) {
        if (!youBadge) {
          const badge = document.createElement("span");
          badge.className = "join-done-you";
          badge.textContent = "Вы";
          row.querySelector(".join-done-row-body")?.appendChild(badge);
        }
      } else if (youBadge) {
        youBadge.remove();
      }
    }

    function createDoneParticipantRow(participant) {
      const row = document.createElement("article");
      row.className =
        "join-done-row join-done-row-link" + (participant.isYou ? " join-done-row-you" : "");
      row.dataset.participantId = String(participant.id || "");
      if (participant.profilePageUrl) {
        row.dataset.profileUrl = participant.profilePageUrl;
      }

      const avatarEl = document.createElement("div");
      avatarEl.className = "join-done-avatar";
      row.appendChild(avatarEl);

      const body = document.createElement("div");
      body.className = "join-done-row-body";

      const text = document.createElement("div");
      text.className = "join-done-row-text";

      const nameEl = document.createElement("span");
      nameEl.className = "join-done-row-name";
      text.appendChild(nameEl);

      const handleEl = document.createElement("span");
      handleEl.className = "join-done-row-handle";
      text.appendChild(handleEl);

      body.appendChild(text);
      row.appendChild(body);

      updateDoneParticipantRow(row, participant);
      if (!row.dataset.profileBound) {
        row.dataset.profileBound = "1";
        row.addEventListener("click", () => navigateToProfile(participant.profilePageUrl));
      }
      return row;
    }

    function syncDoneParticipantsList(participants) {
      const list = document.getElementById("joinDoneList");
      if (!list) return;

      const items = Array.isArray(participants) ? participants : [];
      if (!items.length) {
        list.innerHTML = '<p class="join-done-empty">Список участников пока пуст.</p>';
        return;
      }

      const empty = list.querySelector(".join-done-empty");
      if (empty) {
        empty.remove();
      }

      const existing = new Map();
      list.querySelectorAll("[data-participant-id]").forEach((row) => {
        existing.set(row.dataset.participantId, row);
      });

      const orderedRows = [];
      items.forEach((participant) => {
        const id = String(participant.id || "");
        let row = existing.get(id);
        if (!row) {
          row = createDoneParticipantRow(participant);
        } else {
          updateDoneParticipantRow(row, participant);
          if (participant.profilePageUrl) {
            row.dataset.profileUrl = participant.profilePageUrl;
          }
          existing.delete(id);
        }
        orderedRows.push(row);
      });

      existing.forEach((row) => row.remove());
      orderedRows.forEach((row) => {
        list.appendChild(row);
      });
    }

    function renderDoneStats(payload) {
      const stats = document.getElementById("joinDoneStats");
      const participantsBlock = document.getElementById("joinDoneParticipants");
      const list = document.getElementById("joinDoneList");
      const countEl = document.getElementById("joinDoneCount");
      const chanceEl = document.getElementById("joinDoneChance");
      if (!stats || !participantsBlock || !list || !countEl || !chanceEl) return;

      const participantCount = Number(payload.participantCount) || 0;
      const participants = Array.isArray(payload.participants) ? payload.participants : [];

      countEl.textContent = String(participantCount);
      chanceEl.textContent = formatWinChance(payload.winChancePercent);
      updateDoneCountdown(payload.endAt || "");

      if (participantCount > 0 || payload.endAt) {
        stats.classList.remove("hidden");
      } else {
        stats.classList.add("hidden");
      }

      if (participantCount > 0) {
        participantsBlock.classList.remove("hidden");
        const nextListSignature = buildParticipantListSignature(participants);
        if (nextListSignature !== doneListSignature) {
          syncDoneParticipantsList(participants);
          doneListSignature = nextListSignature;
        }
      } else {
        participantsBlock.classList.add("hidden");
        list.innerHTML = "";
        doneListSignature = "";
      }
    }

    function updateJoinBoostUi(payload) {
      const inviteCount = Number(payload.referralInviteCount) || 0;
      const maxInvites = Number(payload.referralMaxInvites) || 10;
      const boost = Number(payload.referralBoostPercent) || inviteCount * 50;
      const badge = document.getElementById("joinBoostBadge");
      const counter = document.getElementById("joinBoostCounter");
      if (badge) {
        badge.innerHTML = "+" + boost + "% " + JOIN_BOOST_ARROW_HTML;
      }
      if (counter) {
        counter.textContent = "Приглашено друзей: " + inviteCount + "/" + maxInvites;
      }
    }

    let joinBoostOpen = false;
    let joinBoostCloseTimer = null;
    let joinBoostAutoOpenTimer = null;
    let lastDonePayload = null;
    const JOIN_BOOST_AUTO_OPEN_MS = 1000;
    const JOIN_BOOST_SHEET_ANIM_MS = 340;

    function getJoinBoostElements() {
      return {
        backdrop: document.getElementById("joinBoostBackdrop"),
        sheet: document.getElementById("joinBoostSheet"),
      };
    }

    function cancelJoinBoostAutoOpen() {
      if (joinBoostAutoOpenTimer) {
        clearTimeout(joinBoostAutoOpenTimer);
        joinBoostAutoOpenTimer = null;
      }
    }

    function clearJoinBoostCloseTimer() {
      if (joinBoostCloseTimer) {
        clearTimeout(joinBoostCloseTimer);
        joinBoostCloseTimer = null;
      }
    }

    function hideJoinBoostElements() {
      const { backdrop, sheet } = getJoinBoostElements();
      if (!backdrop || !sheet) return;
      backdrop.classList.add("hidden");
      sheet.classList.add("hidden");
      backdrop.classList.remove("is-open");
      sheet.classList.remove("is-open");
      backdrop.setAttribute("aria-hidden", "true");
    }

    function openJoinBoostSheet(payload) {
      cancelJoinBoostAutoOpen();
      clearJoinBoostCloseTimer();
      updateJoinBoostUi(payload || lastDonePayload || {});

      const { backdrop, sheet } = getJoinBoostElements();
      if (!backdrop || !sheet) return;
      if (joinBoostOpen) return;

      joinBoostOpen = true;
      backdrop.classList.remove("hidden");
      sheet.classList.remove("hidden");
      backdrop.classList.remove("is-open");
      sheet.classList.remove("is-open");
      backdrop.setAttribute("aria-hidden", "false");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!joinBoostOpen) return;
          backdrop.classList.add("is-open");
          sheet.classList.add("is-open");
        });
      });
    }

    function closeJoinBoostSheet() {
      cancelJoinBoostAutoOpen();
      clearJoinBoostCloseTimer();

      const { backdrop, sheet } = getJoinBoostElements();
      if (!backdrop || !sheet) return;
      if (!joinBoostOpen) {
        hideJoinBoostElements();
        return;
      }

      joinBoostOpen = false;
      backdrop.classList.remove("is-open");
      sheet.classList.remove("is-open");
      backdrop.setAttribute("aria-hidden", "true");

      joinBoostCloseTimer = setTimeout(() => {
        joinBoostCloseTimer = null;
        hideJoinBoostElements();
      }, JOIN_BOOST_SHEET_ANIM_MS);
    }

    function scheduleJoinBoostSheetAutoOpen(payload) {
      cancelJoinBoostAutoOpen();
      joinBoostAutoOpenTimer = setTimeout(() => {
        joinBoostAutoOpenTimer = null;
        if (activeStep !== "done") return;
        openJoinBoostSheet(payload || lastDonePayload || {});
      }, JOIN_BOOST_AUTO_OPEN_MS);
    }

    function showDoneStep(payload) {
      lastDonePayload = payload || {};
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
      renderDoneStats(payload);
      showStep("done");
      startDoneLivePolling(payload);
      updateJoinBoostUi(payload);
      scheduleJoinBoostSheetAutoOpen(payload);
    }

    function showChannelStep(payload) {
      const title = document.getElementById("joinChannelTitle");
      const openBtn = document.getElementById("joinChannelOpenBtn");
      const avatar = document.getElementById("joinChannelAvatar");
      const avatarFallback = document.getElementById("joinChannelAvatarFallback");
      const channelTitle = payload.channelTitle || "Канал";
      const channelUrl = payload.channelUrl || "";
      const channelPhotoUrl = payload.channelPhotoUrl || "";
      if (title) title.textContent = channelTitle;
      if (openBtn) {
        openBtn.href = channelUrl || "#";
        openBtn.classList.toggle("hidden", !channelUrl);
      }
      if (avatar && avatarFallback) {
        if (channelPhotoUrl) {
          avatar.src = channelPhotoUrl;
          avatar.classList.remove("hidden");
          avatarFallback.classList.add("hidden");
        } else {
          avatar.classList.add("hidden");
          avatar.removeAttribute("src");
          avatarFallback.classList.remove("hidden");
        }
      }
      showStep("channel");
    }

    function navigateToProfile(profileUrl) {
      navigateMiniAppProfileUrl(profileUrl);
    }

    function bindDoneLiveVisibilityRefresh() {
      const refreshIfDone = () => {
        if (activeStep === "done") {
          refreshDoneLiveState();
          scheduleDoneLivePoll(800);
        }
      };
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshIfDone();
      });
      window.addEventListener("focus", refreshIfDone);
      tg?.onEvent?.("viewportChanged", refreshIfDone);
    }
    bindDoneLiveVisibilityRefresh();

    (function setupDoneChanceInfo() {
      const modal = document.getElementById("joinDoneChanceInfo");
      const openBtn = document.getElementById("joinDoneChanceInfoBtn");
      const closeBtn = document.getElementById("joinDoneChanceInfoClose");
      const backdrop = document.getElementById("joinDoneChanceInfoBackdrop");
      if (!modal || !openBtn) return;

      function openModal() {
        modal.classList.remove("hidden");
      }

      function closeModal() {
        modal.classList.add("hidden");
      }

      openBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openModal();
      });
      closeBtn?.addEventListener("click", closeModal);
      backdrop?.addEventListener("click", closeModal);
    })();

    function handleStep(step, payload) {
      if (step === "captcha") {
        renderCaptcha();
        return;
      }
      if (step === "channel") {
        showChannelStep(payload || {});
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

    function bindClick(id, handler) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", handler);
    }

    bindClick("refConfirmBtn", async () => {
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

    bindClick("registrationDoneBtn", async () => {
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

    bindClick("trc20PasteBtn", async () => {
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

    bindClick("trc20SubmitBtn", async () => {
      const address = document.getElementById("trc20Input").value.trim();
      try {
        const data = await api("/api/join/" + encodeURIComponent(drawId) + "/trc20", { address });
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      }
    });

    bindClick("joinChannelCheckBtn", async () => {
      const btn = document.getElementById("joinChannelCheckBtn");
      if (btn) btn.disabled = true;
      try {
        const data = await api("/api/join/" + encodeURIComponent(drawId) + "/channel-check", {});
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    bindClick("joinChannelOpenBtn", (event) => {
      const url = document.getElementById("joinChannelOpenBtn")?.href || "";
      if (!url || url === "#") {
        event.preventDefault();
        return;
      }
      const tgApp = window.Telegram?.WebApp;
      if (tgApp?.openTelegramLink && url.indexOf("t.me/") !== -1) {
        event.preventDefault();
        tgApp.openTelegramLink(url);
      }
    });

    bindClick("joinDoneBoostBtn", () => openJoinBoostSheet(lastDonePayload || {}));

    bindClick("joinBoostCloseBtn", () => closeJoinBoostSheet());
    document.getElementById("joinBoostBackdrop")?.addEventListener("click", () => closeJoinBoostSheet());

    bindClick("joinBoostGenerateBtn", async () => {
      const btn = document.getElementById("joinBoostGenerateBtn");
      const preview = document.getElementById("joinBoostLinkPreview");
      if (btn) btn.disabled = true;
      try {
        const data = await api("/api/join/" + encodeURIComponent(drawId) + "/referral-link", {});
        if (preview && data.link) {
          preview.textContent = data.link;
          preview.classList.remove("hidden");
        }
        if (data.link && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(data.link);
          showMessage("Ссылка скопирована в буфер обмена.", "ok");
        } else if (data.link) {
          showMessage("Ссылка готова — скопируйте её из поля ниже.", "ok");
        }
        if (data.link && tg?.shareUrl) {
          tg.shareUrl(data.link, "Приглашение в розыгрыш");
        }
      } catch (error) {
        showMessage(error.message);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    (async () => {
      try {
        const healthRes = await fetch(apiUrl("/api/join/health"), { cache: "no-store" });
        const health = await healthRes.json().catch(() => ({}));
        console.log("[join-client] health", healthRes.status, health);
      } catch (healthError) {
        console.error("[join-client] health failed:", healthError.message);
      }

      if (PAGE_MODE === "preview") {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("previewToolbar").classList.remove("hidden");
        const nav = document.getElementById("previewNav");
        const steps = [
          { id: "captcha", label: "Капча" },
          { id: "channel", label: "Канал" },
          { id: "registration", label: "Рег." },
          { id: "trc20", label: "TRC-20" },
          { id: "done", label: "Готово" },
          { id: "profile", label: "Профиль" },
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
            if (id === "channel") {
              showChannelStep({
                channelTitle: "Random Beast 🏆",
                channelUrl: "https://t.me/demo_channel",
                channelPhotoUrl: "",
              });
              return;
            }
            if (id === "profile") {
              location.href = "/dev/preview/profile";
              return;
            }
            if (id === "done") {
              const previewEnd = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
              showDoneStep({
                message: "Вы участвуете!",
                alreadyJoined: false,
                participantCount: 8,
                winChancePercent: 55,
                baseWinChancePercent: 5,
                referralBoostPercent: 50,
                referralInviteCount: 1,
                referralMaxInvites: 10,
                endAt: previewEnd,
                participants: [
                  { id: "1001", displayName: "Алексей", username: "@alex_winner", initial: "А", avatarUrl: "", fallbackStyle: "background:linear-gradient(135deg,#5b7cfa,#325fff)", profilePageUrl: "/user/1001?back=%2Fdev%2Fpreview%2Fjoin", isYou: true },
                  { id: "1002", displayName: "Мария", username: "@maria_p", initial: "М", avatarUrl: "", fallbackStyle: "background:linear-gradient(135deg,#f97316,#ea580c)", profilePageUrl: "/user/1002?back=%2Fdev%2Fpreview%2Fjoin", isYou: false },
                  { id: "1003", displayName: "Дмитрий", username: "@dmitry_k", initial: "Д", avatarUrl: "", fallbackStyle: "background:linear-gradient(135deg,#14b8a6,#0d9488)", profilePageUrl: "/user/1003?back=%2Fdev%2Fpreview%2Fjoin", isYou: false },
                ],
              });
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
        hideLoading();
        showMessage("Откройте участие через кнопку в Telegram.");
        return;
      }

      if (PAGE_MODE === "app") {
        drawId = resolveDrawIdFromTelegram();
        if (!drawId) {
          try {
            drawId = String(localStorage.getItem("join:lastDrawId") || "").trim();
          } catch (_storageError) {
            drawId = "";
          }
        }
        if (!drawId) {
          hideLoading();
          showMessage("Не указан розыгрыш. Нажмите «Участвовать» в посте канала.");
          return;
        }
      }

      async function bootJoin() {
        const sessionPromise = api("/api/join/" + encodeURIComponent(drawId) + "/session", {}, { timeoutMs: 12000 });
        let data;
        if (PAGE_MODE === "app") {
          const results = await Promise.all([loadDrawMeta().catch(() => {}), sessionPromise]);
          data = results[1];
        } else {
          data = await sessionPromise;
        }
        hideLoading();
        const retry = document.getElementById("loadingRetry");
        if (retry) retry.classList.add("hidden");
        hideMessage();
        if (!data?.step) {
          throw new Error("Пустой ответ сервера. Попробуйте ещё раз.");
        }
        try {
          localStorage.setItem("join:lastDrawId", drawId);
        } catch (_storageError) {
          /* ignore */
        }
        handleStep(data.step, data);
      }

      const retryBtn = document.getElementById("loadingRetryBtn");
      if (retryBtn) {
        retryBtn.addEventListener("click", () => {
          document.getElementById("loadingRetry")?.classList.add("hidden");
          const loading = document.getElementById("loading");
          if (loading) {
            loading.classList.remove("hidden");
            loading.style.display = "block";
          }
          bootJoin().catch((error) => {
            hideLoading();
            showMessage(error.message);
          });
        });
      }

      const bootTimer = setTimeout(() => {
        hideLoading();
        const retry = document.getElementById("loadingRetry");
        const retryText = document.getElementById("loadingRetryText");
        if (retry) retry.classList.remove("hidden");
        if (retryText) {
          retryText.textContent = "Долго нет ответа от сервера. Нажмите «Повторить» или закройте и откройте участие снова.";
        }
      }, 13000);

      console.log("[join-client] boot drawId=" + drawId + " build=" + PAGE_BUILD);

      bootJoin()
        .catch((error) => {
          console.error("[join-client] boot failed:", error.message);
          hideLoading();
          showMessage(error.message);
        })
        .finally(() => clearTimeout(bootTimer));
    })();
  </script>
</body>
</html>`;
}

function sendJoinHtml(res, html) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.type("html").send(html);
}

const JOIN_PAGE_BUILD = process.env.JOIN_PAGE_BUILD || String(Date.now());

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
    enrichUserAvatar,
    ensureUserAvatars,
    readUserProjectProfiles,
    getUserProfileBundle,
    getWinnerDisplayName,
    shouldHideParticipant = () => false,
    RECAPTCHA_SITE_KEY = "",
    RECAPTCHA_SECRET_KEY = "",
    BOT_USERNAME = "",
    JOIN_MINI_APP_SHORT_NAME = "join",
    checkChannelSubscription = null,
    getChannelSubscribePayload = null,
    computeJoinWinChance: computeJoinWinChanceFn = null,
    buildJoinReferralDirectLink = null,
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

  function extractTransactionCount(payload) {
    const candidates = [
      payload?.totalTransactionCount,
      payload?.totaltransactioncount,
      payload?.transactionCount,
      payload?.total,
      payload?.count,
      payload?.data?.totalTransactionCount,
      payload?.data?.totaltransactioncount,
      payload?.data?.transactionCount,
      payload?.data?.total,
      payload?.meta?.total,
      payload?.rangeTotal,
    ];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
      }
    }
    return null;
  }

  async function fetchTronAddressTransactionCount(address) {
    const accountUrl = `https://apilist.tronscanapi.com/api/account?address=${encodeURIComponent(address)}`;
    const accountRes = await fetch(accountUrl, { signal: AbortSignal.timeout(10_000) });
    if (accountRes.ok) {
      const payload = await accountRes.json().catch(() => ({}));
      const count = extractTransactionCount(payload);
      if (count !== null) {
        return count;
      }
    }

    const txUrl = `https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=1&start=0&address=${encodeURIComponent(address)}`;
    const txRes = await fetch(txUrl, { signal: AbortSignal.timeout(10_000) });
    if (!txRes.ok) {
      throw new Error(`HTTP ${txRes.status}`);
    }
    const payload = await txRes.json().catch(() => ({}));
    const count = extractTransactionCount(payload);
    if (count === null) {
      throw new Error("Не удалось прочитать количество транзакций");
    }
    return count;
  }

  async function checkWalletHasTransactions(address) {
    try {
      const txCount = await fetchTronAddressTransactionCount(address);
      return { ok: true, txCount, hasTransactions: txCount > 0 };
    } catch (error) {
      return { ok: false, txCount: null, hasTransactions: false, error: error.message };
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

  function extractClientIp(req) {
    const forwarded = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);
    const candidates = [
      forwarded,
      req.headers["cf-connecting-ip"],
      req.headers["x-real-ip"],
      req.ip,
      req.socket?.remoteAddress,
    ];
    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function buildDeviceFingerprint(req) {
    const ua = String(req.headers["user-agent"] || "").trim();
    const secUa = String(req.headers["sec-ch-ua"] || "").trim();
    const platform = String(req.headers["sec-ch-ua-platform"] || "").trim();
    const lang = String(req.headers["accept-language"] || "").trim();
    return [ua, secUa, platform, lang].filter(Boolean).join("|");
  }

  function getReferrerIdFromRequest(req) {
    const raw = req.body?.referrerId;
    if (raw == null || raw === "") {
      return null;
    }
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }

  function getJoinParticipationMeta(req) {
    const referrerId = getReferrerIdFromRequest(req);
    return {
      ipAddress: extractClientIp(req),
      deviceFingerprint: buildDeviceFingerprint(req),
      ...(referrerId ? { referrerId } : {}),
    };
  }

  function buildParticipationMetaForJoin(req, session) {
    const meta = getJoinParticipationMeta(req);
    const sessionReferrer = session?.referrerId;
    if (sessionReferrer && !meta.referrerId) {
      meta.referrerId = sessionReferrer;
    }
    return meta;
  }

  function buildChannelStepPayload(draw) {
    const payload = getChannelSubscribePayload ? getChannelSubscribePayload(draw) : null;
    return payload || { channelTitle: "Канал", channelUrl: "", channelUsername: "" };
  }

  async function ensureChannelSubscribedOrRespond(draw, userId, session, res) {
    if (!draw?.channelId || !checkChannelSubscription) {
      return true;
    }
    const check = await checkChannelSubscription(draw, userId);
    if (check.subscribed) {
      return true;
    }
    session.step = "channel";
    setJoinApiSession(userId, draw.id, session);
    res.json(buildJoinStepResponse("channel", buildChannelStepPayload(draw)));
    return false;
  }

  async function proceedAfterChannelVerified(draw, userId, session, req, res) {
    const participationMeta = buildParticipationMetaForJoin(req, session);

    if (!draw.projectId) {
      const result = await addUserToDraw(draw.id, userId, participationMeta);
      clearJoinApiSession(userId, draw.id);
      scheduleParticipantAvatars(draw, userId);
      const updatedDraw = getActiveDraw(draw.id) || draw;
      res.json(
        buildJoinDonePayload(updatedDraw, userId, {
          message: result.already ? "Вы уже участвуете!" : "Вы участвуете!",
          alreadyJoined: Boolean(result.already),
        }),
      );
      return;
    }

    session.step = "registration";
    setJoinApiSession(userId, draw.id, session);
    res.json(buildJoinStepResponse("registration"));
  }

  function drawHasParticipant(draw, userId) {
    const key = String(userId);
    return (draw.participantIds || []).some((id) => String(id) === key);
  }

  function requireJoinUser(req, res, next) {
    const user = resolveTelegramUser(req);
    if (!user) {
      console.warn(`[join] auth failed ${req.method} ${req.originalUrl}`);
      res.status(401).json({ error: "Откройте через Telegram." });
      return;
    }
    req.telegramUser = user;
    req.joinParticipationMeta = getJoinParticipationMeta(req);
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

  function buildJoinDonePayload(draw, userId, extra = {}) {
    const userProfiles = readUserProjectProfiles();
    const participantIds = draw.participantIds || [];
    const chance = computeJoinWinChanceFn
      ? computeJoinWinChanceFn(draw, userId)
      : {
          participantCount: participantIds.length,
          winnersCount: Math.max(1, Number(draw.winnersCount) || 1),
          winChancePercent: 0,
          baseWinChancePercent: 0,
          referralBoostPercent: 0,
          referralInviteCount: 0,
          referralMaxInvites: 10,
          referralBoostPerInvite: 50,
        };

    const participants = participantIds
      .filter((id) => !shouldHideParticipant(id))
      .map((id) => {
        const { meta } = getUserProfileBundle(userProfiles, id, draw.projectId);
        const displayName = getWinnerDisplayName(meta, id);
        const username = meta.username ? `@${meta.username}` : "";
        const initial = (displayName.replace(/^@/, "") || String(id)).charAt(0).toUpperCase() || "?";
        const avatarFileId = meta.avatarFileId || "";
        return {
          id: String(id),
          displayName,
          username,
          initial,
          avatarUrl: avatarFileId ? `/winners/avatar/${encodeURIComponent(String(id))}` : "",
          fallbackStyle: avatarFileId ? "" : getAvatarFallbackStyle(id),
          profilePageUrl: buildParticipantProfileUrl(id, `/join/${encodeURIComponent(draw.id)}`),
          isYou: Number(id) === Number(userId),
        };
      });

    return buildJoinStepResponse("done", {
      ...extra,
      participantCount: chance.participantCount,
      winnersCount: chance.winnersCount,
      winChancePercent: chance.winChancePercent,
      baseWinChancePercent: chance.baseWinChancePercent,
      referralBoostPercent: chance.referralBoostPercent,
      referralInviteCount: chance.referralInviteCount,
      referralMaxInvites: chance.referralMaxInvites,
      referralBoostPerInvite: chance.referralBoostPerInvite,
      endAt: draw.endAt || null,
      participants,
    });
  }

  function scheduleParticipantAvatars(_draw, userId) {
    if (enrichUserAvatar && userId) {
      void enrichUserAvatar(userId);
    }
  }

  function queueAddUserToDraw(drawId, userId, participationMeta = null) {
    void addUserToDraw(drawId, userId, participationMeta).catch((error) => {
      console.error("[join] addUserToDraw:", error.message);
    });
  }

  function userParticipatedInProject(userId, projectId, excludeDrawId = null) {
    if (!projectId) {
      return false;
    }
    const userKey = String(userId);
    const data = readData();
    return data.draws.some(
      (draw) =>
        draw.projectId === projectId &&
        (excludeDrawId ? draw.id !== excludeDrawId : true) &&
        (draw.participantIds || []).some((id) => String(id) === userKey),
    );
  }

  function resolveJoinEntry(draw, userId, participationMeta = null) {
    if (drawHasParticipant(draw, userId)) {
      clearJoinApiSession(userId, draw.id);
      scheduleParticipantAvatars(draw, userId);
      return buildJoinDonePayload(draw, userId, {
        message: "Вы уже участвуете!",
        alreadyJoined: true,
      });
    }

    const profile = getUserProjectProfile(userId, draw.projectId);
    const canSkip = (profile?.referralVerified || profile?.selfReportedNonReferral) && profile?.trc20Address;
    const autoJoin =
      (draw.projectId && userParticipatedInProject(userId, draw.projectId, draw.id)) || canSkip;

    if (autoJoin) {
      if (!drawHasParticipant(draw, userId)) {
        queueAddUserToDraw(draw.id, userId, participationMeta);
      }
      clearJoinApiSession(userId, draw.id);
      scheduleParticipantAvatars(draw, userId);
      return buildJoinDonePayload(draw, userId, {
        message: "Вы участвуете!",
        alreadyJoined: false,
      });
    }

    return null;
  }

  app.use("/assets", express.static(deps.ASSETS_DIR));

  app.use("/api/join", (req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      console.log(
        `[join] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`,
      );
    });
    next();
  });

  app.get("/api/join/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

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

  const joinPageOptions = () => ({
    recaptchaSiteKey: RECAPTCHA_SITE_KEY,
    apiBase: deps.WEB_PUBLIC_URL || "",
  });

  app.get("/join/app", (req, res) => {
    console.log(
      `[join] GET /join/app build=${JOIN_PAGE_BUILD} ua=${String(req.headers["user-agent"] || "").slice(0, 96)}`,
    );
    sendJoinHtml(
      res,
      renderJoinPage("app", { id: "app", status: DRAW_STATUS.ACTIVE, projectId: null }, null, joinPageOptions()),
    );
  });

  app.get("/join/:drawId", (req, res) => {
    if (req.params.drawId === "app") {
      res.redirect(301, "/join/app");
      return;
    }
    const draw = getActiveDraw(req.params.drawId);
    if (!draw) {
      console.warn(`[join] GET /join/${req.params.drawId} → 404`);
      res.status(404).type("html").send("<h1>Розыгрыш недоступен</h1>");
      return;
    }
    console.log(`[join] GET /join/${req.params.drawId} build=${JOIN_PAGE_BUILD}`);
    const project = draw.projectId ? getProjectById(draw.projectId) : null;
    sendJoinHtml(
      res,
      renderJoinPage(req.params.drawId, draw, project, joinPageOptions()),
    );
  });

  app.post("/api/join/:drawId/live", requireJoinUser, async (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }
    if (!drawHasParticipant(draw, userId)) {
      res.status(403).json({ error: "Вы не участвуете в этом розыгрыше." });
      return;
    }

    if (ensureUserAvatars) {
      ensureUserAvatars(draw.participantIds, { limit: 6 });
    }
    const payload = buildJoinDonePayload(draw, userId);
    res.json({
      participantCount: payload.participantCount,
      winnersCount: payload.winnersCount,
      winChancePercent: payload.winChancePercent,
      baseWinChancePercent: payload.baseWinChancePercent,
      referralBoostPercent: payload.referralBoostPercent,
      referralInviteCount: payload.referralInviteCount,
      referralMaxInvites: payload.referralMaxInvites,
      referralBoostPerInvite: payload.referralBoostPerInvite,
      endAt: payload.endAt,
      participants: payload.participants,
    });
  });

  app.post("/api/join/:drawId/session", requireJoinUser, async (req, res) => {
    const started = Date.now();
    try {
      const drawId = req.params.drawId;
      const userId = req.telegramUser.id;
      const draw = getActiveDraw(drawId);
      if (!draw) {
        console.warn(`[join] session draw unavailable drawId=${drawId} userId=${userId}`);
        res.status(404).json({ error: "Розыгрыш недоступен." });
        return;
      }

      const entry = resolveJoinEntry(draw, userId, req.joinParticipationMeta);
      if (entry) {
        if (enrichUserAvatar) {
          void enrichUserAvatar(userId);
        }
        console.log(
          `[join] session auto-entry drawId=${drawId} userId=${userId} step=${entry.step} (${Date.now() - started}ms)`,
        );
        res.json(entry);
        return;
      }

      let session = getJoinApiSession(userId, drawId);
      if (!session) {
        const referrerId = getReferrerIdFromRequest(req);
        session = {
          userId,
          drawId,
          projectId: draw.projectId,
          step: "captcha",
          referrerId: referrerId || null,
        };
        setJoinApiSession(userId, drawId, session);
      } else if (!session.referrerId) {
        const referrerId = getReferrerIdFromRequest(req);
        if (referrerId) {
          session.referrerId = referrerId;
          setJoinApiSession(userId, drawId, session);
        }
      }

      if (session.step === "channel") {
        res.json(buildJoinStepResponse("channel", buildChannelStepPayload(draw)));
        return;
      }

      if (session.step === "captcha") {
        console.log(`[join] session captcha drawId=${drawId} userId=${userId} (${Date.now() - started}ms)`);
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

      console.log(`[join] session captcha(fallback) drawId=${drawId} userId=${userId} (${Date.now() - started}ms)`);
      res.json(buildJoinStepResponse("captcha"));
    } catch (error) {
      console.error("[join] session error:", error);
      res.status(500).json({ error: "Не удалось открыть участие. Попробуйте ещё раз." });
    }
  });

  app.post("/api/join/:drawId/captcha", requireJoinUser, async (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }

    const entry = resolveJoinEntry(draw, userId, req.joinParticipationMeta);
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

    const subscribed = await ensureChannelSubscribedOrRespond(draw, userId, session, res);
    if (!subscribed) {
      return;
    }

    await proceedAfterChannelVerified(draw, userId, session, req, res);
  });

  app.post("/api/join/:drawId/channel-check", requireJoinUser, async (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }

    const entry = resolveJoinEntry(draw, userId, req.joinParticipationMeta);
    if (entry) {
      res.json(entry);
      return;
    }

    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела. Обновите страницу." });
      return;
    }

    if (!draw.channelId || !checkChannelSubscription) {
      await proceedAfterChannelVerified(draw, userId, session, req, res);
      return;
    }

    const check = await checkChannelSubscription(draw, userId);
    if (!check.subscribed) {
      res.status(400).json({
        error: "Подпишитесь на канал и нажмите «Я подписался».",
        step: "channel",
        ...buildChannelStepPayload(draw),
      });
      return;
    }

    await proceedAfterChannelVerified(draw, userId, session, req, res);
  });

  app.post("/api/join/:drawId/referral-link", requireJoinUser, async (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }
    if (!drawHasParticipant(draw, userId)) {
      res.status(403).json({ error: "Сначала завершите участие в розыгрыше." });
      return;
    }

    const link =
      buildJoinReferralDirectLink && BOT_USERNAME
        ? buildJoinReferralDirectLink(drawId, userId, BOT_USERNAME, JOIN_MINI_APP_SHORT_NAME)
        : "";
    if (!link) {
      res.status(503).json({ error: "Ссылка недоступна. Проверьте BOT_USERNAME и Mini App." });
      return;
    }

    const chance = computeJoinWinChanceFn ? computeJoinWinChanceFn(draw, userId) : {};
    res.json({
      link,
      referralBoostPerInvite: chance.referralBoostPerInvite || 50,
      referralInviteCount: chance.referralInviteCount || 0,
      referralMaxInvites: chance.referralMaxInvites || 10,
      referralBoostPercent: chance.referralBoostPercent || 0,
    });
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

    const entry = resolveJoinEntry(draw, userId, req.joinParticipationMeta);
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

    const entry = resolveJoinEntry(draw, userId, req.joinParticipationMeta);
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

    const walletCheck = await checkWalletHasTransactions(address);
    const forceNonReferralByWallet = walletCheck.ok && walletCheck.hasTransactions;

    setUserProjectProfile(userId, session.projectId, {
      referralVerified: forceNonReferralByWallet ? false : session.skipReferralCheck ? false : true,
      selfReportedNonReferral: forceNonReferralByWallet ? true : Boolean(session.skipReferralCheck),
      trc20Address: address,
      verifiedBy: "miniapp",
      walletTxCheckedAt: new Date().toISOString(),
      walletTxCount: walletCheck.txCount,
      walletHasTransactions: forceNonReferralByWallet,
      ...(forceNonReferralByWallet
        ? { nonReferralReason: "wallet_has_transactions" }
        : { nonReferralReason: null }),
    });

    const result = await addUserToDraw(
      drawId,
      userId,
      buildParticipationMetaForJoin(req, session),
    );
    clearJoinApiSession(userId, drawId);

    const updatedDraw = getActiveDraw(drawId);
    if (!updatedDraw) {
      res.status(404).json({ error: "Розыгрыш недоступен." });
      return;
    }
    scheduleParticipantAvatars(updatedDraw, userId);
    res.json(
      buildJoinDonePayload(updatedDraw, userId, {
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
