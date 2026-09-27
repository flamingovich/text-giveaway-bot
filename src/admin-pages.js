// Every admin page, drawn from the parts in admin-ui.js and admin-charts.js.
// The data comes ready from admin-dashboard.js and the stats modules; nothing
// here reads a document or changes one.

const UI = require("./admin-ui");
const C = require("./admin-charts");
const F = require("./admin-format");
const SYS = require("./admin-system");
const FUNNEL = require("./admin-funnel");
const { getChatTranscript, formatSupportChatName } = require("./support-transcripts");

const { escapeHtml, icon } = UI;

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function dayLabel(day) {
  const [, month, date] = String(day || "").split("-");
  return month && date ? `${Number(date)} ${MONTHS[Number(month) - 1]}` : String(day || "");
}

// "2026-09" as "сен 2026".
function monthLabel(month) {
  const [year, number] = String(month || "").split("-");
  return year && number ? `${MONTHS[Number(number) - 1]} ${year}` : String(month || "");
}

function count(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function percentOf(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// The brands are fixed (BRAND_PROJECT_TEMPLATES), each with its wordmark in
// assets/brand-logos and a colour of its own on the charts.
const BRAND_TONES = { pokerdom: "green", beef: "red", fugu: "teal", iris: "purple", luckybear: "orange" };

function brandSlug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z]/g, "");
}

function brandTone(name) {
  return BRAND_TONES[brandSlug(name)] || "blue";
}

function brandLogo(name) {
  const slug = brandSlug(name);
  if (!BRAND_TONES[slug]) {
    return `<span class="brand-logo brand-logo-none">${escapeHtml(String(name || "?").slice(0, 1))}</span>`;
  }
  return `<span class="brand-logo"><img class="logo-light" src="/assets/brand-logos/${slug}_light.png" alt="" loading="lazy" /><img class="logo-dark" src="/assets/brand-logos/${slug}_dark.png" alt="" loading="lazy" /></span>`;
}

function pageStyles() {
  return `
.brand-logo {
  width: 58px; height: 30px; flex: none; display: grid; place-items: center;
  border-radius: 9px; background: var(--bg-elevated); box-shadow: inset 0 0 0 .5px var(--separator);
  padding: 3px 6px;
}
.brand-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
.brand-logo .logo-dark { display: none; }
.brand-logo-none { font-weight: 700; color: var(--label-2); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .brand-logo .logo-light { display: none; }
  :root:not([data-theme="light"]) .brand-logo .logo-dark { display: block; }
}
:root[data-theme="dark"] .brand-logo .logo-light { display: none; }
:root[data-theme="dark"] .brand-logo .logo-dark { display: block; }
.brand-logo.sm { width: 44px; height: 24px; border-radius: 7px; padding: 2px 5px; }

/* the dashboard's hero: metric tiles over the chart they switch */
.hero-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 16px 16px 0; }
.hero-tab {
  position: relative; text-align: left; border: 0; cursor: pointer; overflow: hidden;
  padding: 12px 14px 0; border-radius: 16px; background: var(--fill); color: var(--label);
  transition: background .25s var(--ease), box-shadow .25s var(--ease), transform .35s var(--spring);
}
.hero-tab:hover { transform: translateY(-1px); }
.hero-tab.is-active { background: color-mix(in oklab, var(--tint) 13%, var(--bg-elevated)); box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--tint) 55%, transparent); }
.hero-tab-label { font-size: 13px; font-weight: 500; color: var(--label-2); }
.hero-tab-value { font-size: 22px; font-weight: 700; letter-spacing: -.03em; margin-top: 2px; }
.hero-tab .spark { height: 34px; margin: 6px -14px 0; width: calc(100% + 28px); }
.hero-panel { padding: 18px 20px 14px; }
.hero-figure { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hero-number { font-size: 52px; font-weight: 700; letter-spacing: -.045em; line-height: 1; }
.hero-caption { font-size: 13.5px; color: var(--label-2); margin: 6px 0 14px; }
.hero-legend { display: flex; gap: 16px; font-size: 12.5px; color: var(--label-2); margin: -6px 0 10px; }
.hero-legend span { display: inline-flex; align-items: center; gap: 6px; }
.hero-legend i { width: 14px; height: 0; border-top: 2.5px solid var(--tint); border-radius: 2px; }
.hero-legend i.dashed { border-top: 2px dashed var(--green); }
@media (max-width: 960px) { .hero-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hero-number { font-size: 40px; } }

.card-figure { font-size: 34px; font-weight: 700; letter-spacing: -.035em; line-height: 1; margin: 2px 0 16px; }
.card-figure small { font-size: 14px; font-weight: 500; color: var(--label-2); margin-left: 7px; letter-spacing: -.01em; }
.sub-head { font-size: 12px; font-weight: 600; color: var(--label-2); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 12px; }
.split { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; }

/* the filter bar over the users table */
.filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.4fr) auto; gap: 10px; align-items: end; padding: 16px 20px; border-bottom: .5px solid var(--separator); }
.filters .actions { display: flex; gap: 8px; }
@media (max-width: 1180px) { .filters { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .filters { grid-template-columns: minmax(0, 1fr); } }
.cell-person .person { max-width: 260px; }
.fraud-line { margin: 7px 0 0 47px; }
.owner-line { margin-top: 4px; font-size: 12.5px; color: var(--label-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 230px; }

/* a person's page */
.profile { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 20px; align-items: center; padding: 22px 24px; }
.profile-name { font-size: 26px; font-weight: 700; letter-spacing: -.03em; }
.profile-handle { font-size: 15px; color: var(--label-2); margin-top: 2px; }
.profile .chips { margin-top: 10px; }
.id-chip { cursor: pointer; border: 0; }
.timeline-tools { display: inline-grid; }
.stat-value.is-long { font-size: 24px; letter-spacing: -.025em; }
.id-chip:hover { filter: brightness(.96); }

.timeline .row { --inset: 62px; align-items: flex-start; }
.tl-mark {
  width: 30px; height: 30px; border-radius: 50%; flex: none; display: grid; place-items: center; margin-top: 2px;
  color: var(--mark, var(--label-2)); background: color-mix(in oklab, var(--mark, var(--gray)) 15%, transparent);
}
.tl-mark .ic { width: 16px; height: 16px; stroke-width: 2.2; }
.tl-when { flex: none; width: 92px; text-align: right; font-size: 13px; color: var(--label-2); padding-top: 4px; }

/* support: a messenger in two panes */
.messenger { display: grid; grid-template-columns: 380px minmax(0, 1fr); height: 100vh; }
.m-list { display: flex; flex-direction: column; min-width: 0; border-right: .5px solid var(--separator); background: color-mix(in oklab, var(--bg-elevated) 45%, transparent); }
.m-list-head { padding: 22px 16px 12px; }
.m-list-title { font-size: 28px; font-weight: 700; letter-spacing: -.03em; }
.m-list-sub { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 12px; }
.m-scroll { overflow-y: auto; flex: 1; padding: 0 8px 8px; }
.conv { display: flex; gap: 11px; padding: 10px; border-radius: 14px; transition: background .15s var(--ease); }
.conv + .conv { margin-top: 2px; }
.conv:hover { background: var(--fill); }
.conv.is-active { background: var(--tint); color: #fff; }
.conv.is-active .conv-time, .conv.is-active .conv-preview, .conv.is-active .conv-count { color: rgba(255,255,255,.82); }
.conv.is-active .chip { background: rgba(255,255,255,.22); color: #fff; }
.conv-body { min-width: 0; flex: 1; }
.conv-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.conv-name { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-time { font-size: 12.5px; color: var(--label-2); flex: none; }
.conv-preview { font-size: 13.5px; color: var(--label-2); margin-top: 1px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.35; }
.conv-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; }
.conv-foot .chip { height: 20px; padding: 0 8px; font-size: 11.5px; }
.conv-count { font-size: 12px; color: var(--label-3); }
.m-pager { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-top: .5px solid var(--separator); font-size: 13px; color: var(--label-2); }
.thread { display: flex; flex-direction: column; min-width: 0; height: 100vh; }
.thread-head {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 22px;
  border-bottom: .5px solid var(--separator);
  background: color-mix(in oklab, var(--bg) 70%, transparent); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
}
.thread-body { flex: 1; overflow-y: auto; padding: 22px 22px 12px; display: flex; flex-direction: column; gap: 4px; }
.day-sep { align-self: center; margin: 12px 0 8px; font-size: 12px; font-weight: 600; color: var(--label-2); }
.bubble { max-width: min(68%, 560px); padding: 8px 13px 7px; border-radius: 19px; font-size: 15px; line-height: 1.38; white-space: pre-wrap; word-break: break-word; animation: pop .35s var(--spring) both; }
.bubble-meta { margin-top: 3px; font-size: 11.5px; opacity: .65; }
.b-user { align-self: flex-start; background: var(--bg-elevated); box-shadow: inset 0 0 0 .5px var(--separator); border-bottom-left-radius: 6px; }
.b-bot { align-self: flex-end; color: #fff; background: linear-gradient(180deg, color-mix(in oklab, var(--tint) 88%, white), var(--tint)); border-bottom-right-radius: 6px; }
.b-admin { align-self: flex-end; color: #fff; background: linear-gradient(180deg, color-mix(in oklab, var(--green) 88%, white), var(--green)); border-bottom-right-radius: 6px; }
.b-error { align-self: flex-end; color: var(--red); background: color-mix(in oklab, var(--red) 13%, transparent); border-bottom-right-radius: 6px; }
.b-system { align-self: center; max-width: 80%; text-align: center; font-size: 13px; color: var(--label-2); background: var(--fill); border-radius: 12px; }
.compose { padding: 12px 22px 18px; border-top: .5px solid var(--separator); background: color-mix(in oklab, var(--bg) 70%, transparent); }
.compose-box { display: flex; align-items: flex-end; gap: 10px; padding: 6px 6px 6px 16px; border-radius: 22px; background: var(--bg-elevated); box-shadow: inset 0 0 0 .5px var(--separator); }
.compose-box textarea { flex: 1; min-height: 24px; max-height: 180px; padding: 7px 0; border: 0; background: none; outline: none; resize: none; font-size: 15px; line-height: 1.4; }
.compose-send { width: 34px; height: 34px; border-radius: 50%; border: 0; flex: none; display: grid; place-items: center; cursor: pointer; color: #fff; background: var(--tint); transition: transform .3s var(--spring); }
.compose-send:active { transform: scale(.9); }
.compose-send .ic { width: 18px; height: 18px; stroke-width: 2.6; }
.compose-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 9px; font-size: 12.5px; color: var(--label-2); }
.flash { margin: 12px 22px 0; padding: 10px 14px; border-radius: 12px; font-size: 14px; font-weight: 500; }
.flash-ok { color: var(--green); background: color-mix(in oklab, var(--green) 13%, transparent); }
.flash-error { color: var(--red); background: color-mix(in oklab, var(--red) 12%, transparent); }
.thread-empty { flex: 1; display: grid; place-items: center; }
@media (max-width: 960px) {
  .messenger { grid-template-columns: 1fr; height: auto; }
  .m-list { border-right: 0; border-bottom: .5px solid var(--separator); max-height: 52vh; }
  .thread { height: auto; min-height: 70vh; }
  .bubble { max-width: 86%; }
}

/* the sign-in screen */
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.login-card { width: 100%; max-width: 380px; padding: 34px 28px 26px; text-align: center; animation: pop .55s var(--spring) both; }
.login-logo { width: 92px; height: 92px; margin: 0 auto 18px; border-radius: 26px; overflow: hidden; box-shadow: 0 16px 40px color-mix(in oklab, #038EF3 42%, transparent), inset 0 0 0 .5px rgba(255,255,255,.3); }
.login-logo img { width: 100%; height: 100%; display: block; object-fit: cover; }
.login-title { font-size: 28px; font-weight: 700; letter-spacing: -.03em; }
.login-sub { margin: 6px 0 22px; color: var(--label-2); font-size: 15px; }
.login-fields { text-align: left; border-radius: 14px; background: var(--fill); overflow: hidden; margin-bottom: 14px; }
.login-fields input { width: 100%; height: 48px; padding: 0 16px; border: 0; background: none; outline: none; font-size: 16px; }
.login-fields input + input { border-top: .5px solid var(--separator); }
.login-fields input::placeholder { color: var(--label-3); }
.login-card .btn { width: 100%; height: 48px; font-size: 16px; }
.login-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 12px; font-size: 14px; font-weight: 500; color: var(--red); background: color-mix(in oklab, var(--red) 12%, transparent); }
.login-foot { margin-top: 18px; font-size: 13px; color: var(--label-2); }
`;
}

function shell(options) {
  return UI.renderShell({ ...options, styles: `${pageStyles()}${options.styles || ""}` });
}

// A card's headline number over its bar of shares, as the planner puts the
// amount over "Куда ушёл доход".
function figure(value, unit) {
  return `<div class="card-figure"><span class="rounded-num">${UI.countUp(value)}</span><small>${escapeHtml(unit)}</small></div>`;
}

function periodSegmented(periods, activeId, hrefFor) {
  return UI.segmented(periods.map((item) => ({ label: item.label, href: hrefFor(item.id), active: item.id === activeId })));
}

// ── sign in, not found ─────────────────────────────────────────────────────

function renderLoginPage(error = "") {
  return `<!doctype html>
<html lang="ru">
<head>
  ${UI.documentHead("Вход", pageStyles())}
</head>
<body>
  <main class="login-page">
    <section class="card login-card">
      <div class="login-logo"><img src="/assets/brand/rollerbot-mark.png" alt="" /></div>
      <h1 class="login-title">RollerBot</h1>
      <p class="login-sub">Вход в админку</p>
      ${error ? `<div class="login-error">${escapeHtml(error)}</div>` : ""}
      <form method="post" action="/admin/login">
        <div class="login-fields">
          <input name="login" autocomplete="username" placeholder="Логин" required autofocus aria-label="Логин" />
          <input name="password" type="password" autocomplete="current-password" placeholder="Пароль" required aria-label="Пароль" />
        </div>
        <button type="submit" class="btn btn-primary">Войти</button>
      </form>
      <p class="login-foot">Статистика, пользователи и поддержка</p>
    </section>
  </main>
</body>
</html>`;
}

function renderAdminNotFound(message) {
  return shell({
    title: "Не найдено",
    active: "",
    body: UI.card({
      body: `${UI.blank(message, "Проверьте ссылку или вернитесь к списку.", "search")}<div style="display:flex;justify-content:center;margin-top:-18px;padding-bottom:12px">${UI.button({ label: "К пользователям", href: "/admin/users", kind: "primary" })}</div>`,
    }),
  });
}

// ── statistics ─────────────────────────────────────────────────────────────

function renderDashboardPage(deps, stats, organizers, selectedOwner, userProfiles) {
  const link = (overrides = {}) => {
    const query = new URLSearchParams();
    const owner = overrides.ownerId ?? selectedOwner;
    const per = overrides.period ?? stats.period.id;
    if (owner) query.set("ownerId", owner);
    if (per && per !== "30") query.set("period", per);
    const text = query.toString();
    return text ? `/admin/dashboard?${text}` : "/admin/dashboard";
  };

  const ownerName = selectedOwner ? organizers.find((o) => o.id === selectedOwner)?.label || selectedOwner : "";
  const ownerSelect = `<form method="get" action="/admin/dashboard">
    <input type="hidden" name="period" value="${escapeHtml(stats.period.id)}" />
    <select class="select" name="ownerId" onchange="this.form.submit()" aria-label="Организатор" style="min-width:210px">
      <option value="">Все организаторы</option>
      ${organizers
        .map((o) => `<option value="${escapeHtml(o.id)}"${o.id === selectedOwner ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
        .join("")}
    </select>
  </form>`;

  const labels = stats.series.labels.map(dayLabel);
  const periodLower = stats.period.label.toLowerCase();
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  const metrics = [
    { id: "users", label: "Пользователи", total: stats.totals.users, series: stats.series.newUsers, running: stats.series.totalUsers, noun: "новых", tone: "blue" },
    { id: "participants", label: "Участники", total: stats.totals.participants, series: stats.series.newParticipants, running: stats.series.totalParticipants, noun: "впервые участвовали", tone: "indigo" },
    { id: "draws", label: "Розыгрыши", total: stats.totals.draws, series: stats.series.draws, running: null, noun: "создано", tone: "orange" },
    { id: "joins", label: "Вступления", total: sum(stats.series.joins), series: stats.series.joins, running: null, noun: "вступлений", tone: "green" },
  ].map((metric) => {
    const measured = stats.deltas?.[metric.id] || null;
    return { ...metric, current: measured ? measured.current : sum(metric.series), delta: measured };
  });

  const tabs = metrics
    .map(
      (metric, index) => `<button type="button" class="hero-tab${index === 0 ? " is-active" : ""}" data-tab="${metric.id}" aria-selected="${index === 0}" style="--tint: var(--${metric.tone})">
        <div class="hero-tab-label">${escapeHtml(metric.label)}</div>
        <div class="hero-tab-value rounded-num">${UI.countUp(metric.total)}</div>
        ${C.sparkline(metric.series, { tone: metric.tone, height: 34 })}
      </button>`,
    )
    .join("");

  const panels = metrics
    .map((metric, index) => {
      const series = [{ name: metric.label, values: metric.series, tone: metric.tone }];
      if (metric.running) {
        series.push({ name: "Всего", values: metric.running, tone: "green", dashed: true, axis: "right" });
      }
      return `<div class="hero-panel${index === 0 ? "" : " hidden"}" data-panel="${metric.id}" style="--tint: var(--${metric.tone})">
        <div class="hero-figure"><span class="hero-number rounded-num">${UI.countUp(metric.current)}</span>${UI.delta(metric.delta)}</div>
        <p class="hero-caption">${escapeHtml(metric.noun)} за ${escapeHtml(periodLower)}${metric.delta ? " · к прошлому периоду" : ""} · всего ${count(metric.total)}</p>
        ${metric.running ? `<div class="hero-legend"><span><i></i>за день</span><span><i class="dashed"></i>всего</span></div>` : ""}
        ${C.areaChart({ labels, series, height: 250 })}
      </div>`;
    })
    .join("");

  const hero = `<section class="card" data-tabs style="--i:0">
    <div class="hero-tabs" role="tablist">${tabs}</div>
    ${panels}
  </section>`;

  const t = stats.totals;
  const share = percentOf(t.participants, t.users);
  const quick = `<div class="grid cols-4">
    ${UI.stat({ label: "Победителей", value: t.winners, note: `${count(t.wins)} ${F.plural(t.wins, "победа", "победы", "побед")} всего`, iconName: "trophy", tone: "orange", i: 1 })}
    ${UI.stat({ label: "Идут сейчас", value: t.active, note: `${count(t.finished)} завершено`, iconName: "bolt", tone: "green", i: 2 })}
    ${UI.stat({ label: "С кошельком", value: t.withWallet, note: `${percentOf(t.withWallet, t.users)}% пользователей`, iconName: "wallet", tone: "teal", i: 3 })}
    ${UI.stat({ label: "Участвовали", value: t.participants, note: "хотя бы раз", iconName: "users", tone: "indigo", ring: C.ring(share, { tone: "indigo", toneTo: "blue", size: 58, stroke: 7 }), i: 4 })}
  </div>`;

  const ref = stats.breakdowns.referrals;
  const status = stats.breakdowns.status;
  const brandRows = stats.breakdowns.brands.slice(0, 6);
  const breakdowns = `<div class="grid cols-3">
    ${UI.card({
      title: "Кто эти люди",
      subtitle: "по статусу на проектах",
      i: 5,
      body: `${figure(t.users, F.plural(t.users, "человек", "человека", "человек"))}${C.shareBar([
        { label: "Рефералы", value: ref.refs, tone: "green" },
        { label: "Не рефералы", value: ref.nonRefs, tone: "orange" },
        { label: "Не проходили проверку", value: ref.unknown, tone: "gray" },
      ])}`,
    })}
    ${UI.card({
      title: "Розыгрыши",
      subtitle: "по статусу",
      i: 6,
      body: `${figure(t.draws, F.plural(t.draws, "розыгрыш", "розыгрыша", "розыгрышей"))}${C.shareBar([
        { label: "Завершённые", value: status.finished || 0, tone: "blue" },
        { label: "Идут", value: status.active || 0, tone: "green" },
        { label: "Запланированные", value: status.scheduled || 0, tone: "orange" },
      ])}`,
    })}
    ${UI.card({
      title: "Бренды",
      subtitle: "сколько розыгрышей проведено",
      i: 7,
      body: C.hbars(brandRows.map(([label, value]) => ({ label, value, display: count(value), tone: brandTone(label), lead: brandLogo(label) }))),
    })}
  </div>`;

  const organizerRows = stats.organizerRows
    .map((row) => {
      const identity = F.identityOf(row.id, userProfiles.users?.[String(row.id)]?.meta || {});
      const active = String(row.id) === String(selectedOwner);
      return `<a class="row" href="${escapeHtml(link({ ownerId: active ? "" : row.id }))}" style="--inset:68px">
        ${UI.avatar(identity)}
        <div class="row-main"><div class="row-title">${escapeHtml(identity.title)}</div><div class="row-sub">${escapeHtml(identity.handle || "организатор")}</div></div>
        <div class="row-value">${count(row.draws)}<small>розыгрышей</small></div>
        <div class="row-value" style="min-width:92px">${count(row.referrals)}<small>рефералов</small></div>
        ${active ? UI.chip("выбран", "blue") : icon("chevron", "row-chevron")}
      </a>`;
    })
    .join("");

  const organizers_ = UI.card({
    title: "Организаторы",
    subtitle: selectedOwner ? "нажмите ещё раз, чтобы снять фильтр" : "нажмите, чтобы посмотреть одного",
    flush: true,
    i: 8,
    body: organizerRows ? `<div class="rows">${organizerRows}</div>` : UI.blank("Пока никто не проводил розыгрыши", "", "users"),
  });

  return shell({
    title: "Статистика",
    subtitle: ownerName ? `Организатор: ${ownerName}` : "Все организаторы",
    active: "stats",
    tools: `${periodSegmented(stats.periods, stats.period.id, (id) => link({ period: id }))}${ownerSelect}`,
    body: `<div class="stack">${hero}${quick}${breakdowns}${organizers_}</div>`,
  });
}

// ── the join funnel ────────────────────────────────────────────────────────

function renderFunnelPage(stats, timezone) {
  const t = stats.total;
  const periods = UI.segmented(
    FUNNEL.FUNNEL_PERIODS.map((value) => ({ label: `${value} дней`, href: `/admin/funnel?period=${value}`, active: value === stats.period })),
  );
  const since = stats.trackedSince
    ? `Шаги считаются с ${F.formatDateTime(new Date(stats.trackedSince).toISOString(), timezone)}.`
    : "";

  if (t.people === 0) {
    return shell({
      title: "Воронка",
      subtitle: "Где люди бросают участие",
      active: "funnel",
      tools: periods,
      body: UI.card({
        body: UI.blank(
          "За этот период никто не открывал участие",
          since || "Шаги начнут считаться, как только кто-нибудь откроет мини-апп участия.",
          "funnel",
        ),
      }),
    });
  }

  const stuckTones = { notify: "purple", captcha: "orange", channel: "red", registration: "pink", trc20: "teal" };
  const tiles = `<div class="grid cols-4">
    ${UI.stat({ label: "Открыли участие", value: t.people, note: `в ${count(stats.drawsTotal)} ${F.plural(stats.drawsTotal, "розыгрыше", "розыгрышах", "розыгрышах")}`, iconName: "person", tone: "blue", i: 0 })}
    ${UI.stat({ label: "Участвуют", value: t.joined, note: "дошли до конца", iconName: "check", tone: "green", ring: C.ring(stats.conversion, { tone: "green", toneTo: "mint", size: 58, stroke: 7 }), i: 1 })}
    ${UI.stat({ label: "Сразу, без шагов", value: t.instant, note: "уже участвовали в проекте", iconName: "bolt", tone: "orange", i: 2 })}
    ${UI.stat({ label: "Бросили", value: stats.dropped, note: stats.worst ? `чаще всего — ${escapeHtml(stats.worst.label.toLowerCase())}` : `${stats.droppedPercent}% открывших`, iconName: "flag", tone: "red", i: 3 })}
  </div>`;

  const path = UI.card({
    title: "Путь участника",
    subtitle: "синим — прошли шаг, красным — остановились на нём",
    i: 4,
    body: C.funnelSteps(stats.steps, { total: t.people }),
  });
  const where = UI.card({
    title: "Где бросают",
    subtitle: `${count(stats.dropped)} ${F.plural(stats.dropped, "человек", "человека", "человек")} не дошли до конца`,
    i: 5,
    body: C.shareBar(stats.steps.filter((step) => step.reached > 0).map((step) => ({ label: step.label, value: step.stuck, tone: stuckTones[step.stage] || "gray" }))),
  });

  const drawRows = stats.drawRows.map((row) => ({
    cells: `<td><div class="row-title" style="font-weight:600">${escapeHtml(row.title)}</div>${row.active ? `<div style="margin-top:4px">${UI.chip("идёт", "green")}</div>` : ""}</td>
      <td class="num">${count(row.people)}</td>
      <td class="num">${count(row.joined)}</td>
      <td class="num"><div style="display:inline-flex;align-items:center;gap:10px">${C.ring(row.conversion, { tone: row.conversion >= 60 ? "green" : row.conversion >= 40 ? "orange" : "red", size: 34, stroke: 4.5, center: "" })}<b>${row.conversion}%</b></div></td>
      <td>${row.worst ? `${UI.chip(row.worst.label, "red")} <span class="dim tnum" style="margin-left:4px">−${count(row.worst.stuck)}</span>` : UI.chip("никто не бросил", "green")}</td>`,
  }));
  const byDraw = UI.card({
    title: "По розыгрышам",
    subtitle: `по числу открывших${stats.drawsTotal > stats.drawRows.length ? `, первые ${stats.drawRows.length} из ${stats.drawsTotal}` : ""}`,
    flush: true,
    i: 6,
    body: UI.table({
      columns: [{ label: "Розыгрыш" }, { label: "Открыли", num: true }, { label: "Участвуют", num: true }, { label: "Конверсия", num: true }, { label: "Больше всего бросают" }],
      rows: drawRows,
    }),
  });

  return shell({
    title: "Воронка",
    subtitle: "Где люди бросают участие",
    active: "funnel",
    tools: periods,
    body: `<div class="stack">${tiles}<div class="grid cols-2-1">${path}${where}</div>${byDraw}
      <p class="note" style="padding:0 4px">Кто прямо сейчас проходит шаги в идущем розыгрыше, пока считается бросившим. ${escapeHtml(since)}</p></div>`,
  });
}

// ── users ──────────────────────────────────────────────────────────────────

function refChip(status) {
  if (status === "ref") return UI.chip("реф", "green");
  if (status === "non-ref") return UI.chip("не реф", "orange");
  return UI.chip("—", "muted");
}

const PROJECTS_SHOWN_IN_CELL = 3;

// One person can hold eight bindings, and a line per binding turned a row into
// half a screen. The cell summarises; the person's own page has the list.
function projectsCell(projects, hasWallet = true) {
  const named = projects.filter((project) => project.projectId);
  // Legacy bindings from before the brands all resolve to "Проект удалён".
  const withName = named.filter((project) => project.projectName !== "Проект удалён");
  const orphans = named.length - withName.length;
  // The same brand exists once per organiser: show it once.
  // One chip per brand; "реф" wins, since at most one organiser holds the person.
  const byBrand = new Map();
  for (const project of withName) {
    const current = byBrand.get(project.projectName);
    if (!current || (project.refStatus === "ref" && current.refStatus !== "ref")) {
      byBrand.set(project.projectName, project);
    }
  }
  const live = [...byBrand.values()];
  const chips = live
    .slice(0, PROJECTS_SHOWN_IN_CELL)
    .map((project) => UI.chip(project.projectName, project.refStatus === "ref" ? "green" : project.refStatus === "non-ref" ? "orange" : "muted"))
    .join("");
  const rest = live.length - PROJECTS_SHOWN_IN_CELL;
  const more = rest > 0 ? UI.chip(`+${rest}`, "muted") : "";
  const orphanChip = orphans ? `<span class="chip chip-muted" title="привязки к удалённым проектам">удалённых: ${orphans}</span>` : "";
  const walletChip = hasWallet ? "" : UI.chip("без кошелька", "muted");
  if (!chips && !orphanChip) {
    return `<div class="chips">${UI.chip("без проекта", "muted")}${walletChip}</div>`;
  }
  const owners = [...new Set(named.map((project) => project.referralOwnerLabel).filter((label) => label && label !== "—"))];
  const ownerLine = owners.length
    ? `<div class="owner-line" title="${escapeHtml(owners.join(", "))}">привёл ${escapeHtml(owners[0])}${owners.length > 1 ? ` и ещё ${owners.length - 1}` : ""}</div>`
    : "";
  return `<div class="chips">${chips}${more}${orphanChip}${walletChip}</div>${ownerLine}`;
}

const FRAUD_TITLES = { ip: "Бот по IP", wallet: "Мультиаккаунт", subscription: "Подписка", other: "Другое" };

// The kind and how often, under the name; the draws are in the tooltip and on
// the person's page. A clean row says nothing - clean is the usual case.
function fraudCell(row) {
  if (!row.hasFraud) {
    return "";
  }
  const kinds = new Map();
  for (const detail of row.fraudDetails) {
    const key = detail.kind || "other";
    if (!kinds.has(key)) kinds.set(key, []);
    kinds.get(key).push(detail);
  }
  return `<div class="chips">${[...kinds.entries()]
    .map(([kind, details]) => {
      const title = FRAUD_TITLES[kind] || details[0].label || kind;
      const where = details.map((detail) => detail.drawTitle || detail.drawId).filter(Boolean).join(", ");
      return `<span class="chip ${kind === "subscription" ? "chip-orange" : "chip-red"}" title="${escapeHtml(where)}">${icon("shield")}${escapeHtml(title)}${details.length > 1 ? ` ×${details.length}` : ""}</span>`;
    })
    .join("")}</div>`;
}

function renderUsersPage(deps, viewModel) {
  const { rows, page, totalPages, totalFiltered, filters, brands, refOwners, stats, pageSize } = viewModel;
  const href = (overrides = {}) => {
    const query = new URLSearchParams();
    const merged = { ...filters, page: 1, ...overrides };
    for (const key of ["brand", "refOwnerId", "ref", "activity", "q", "sort", "dir"]) {
      if (merged[key]) query.set(key, merged[key]);
    }
    if (merged.page && Number(merged.page) > 1) query.set("page", String(merged.page));
    const text = query.toString();
    return text ? `/admin/users?${text}` : "/admin/users";
  };
  const sortColumn = (label, key) => ({
    label,
    num: true,
    sortHref: href({ sort: key, dir: filters.sort === key && filters.dir === "desc" ? "asc" : "desc" }),
    sortActive: filters.sort === key,
    sortDir: filters.dir,
  });
  const sortLink = (label, key) => {
    const column = sortColumn(label, key);
    const arrow = column.sortActive ? `<span class="sort-on">${column.sortDir === "asc" ? "↑" : "↓"}</span>` : "";
    return `<a href="${escapeHtml(column.sortHref)}">${escapeHtml(label)}${arrow}</a>`;
  };
  const option = (value, label, selected) =>
    `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;

  const hasFilters = Boolean(filters.brand || filters.refOwnerId || filters.ref || filters.activity || filters.q);
  const filterBar = `<form method="get" action="/admin/users" class="filters">
    <label class="field"><span class="field-label">Бренд</span><select class="select" name="brand">${option("", "Все", filters.brand)}${brands.map((b) => option(b.key, b.label, filters.brand)).join("")}</select></label>
    <label class="field"><span class="field-label">Кто привёл</span><select class="select" name="refOwnerId">${option("", "Все", filters.refOwnerId)}${refOwners.map((o) => option(o.id, o.label, filters.refOwnerId)).join("")}</select></label>
    <label class="field"><span class="field-label">Статус</span><select class="select" name="ref">${option("", "Все", filters.ref)}${option("ref", "Рефы", filters.ref)}${option("non-ref", "Не рефы", filters.ref)}</select></label>
    <label class="field"><span class="field-label">Активность</span><select class="select" name="activity">${option("", "Все", filters.activity)}${option("participated", "Участвовали", filters.activity)}${option("won", "Побеждали", filters.activity)}${option("unpaid", "Не выплачено", filters.activity)}${option("fraud", "Антифрод", filters.activity)}</select></label>
    <label class="field"><span class="field-label">Поиск</span><span class="search">${icon("search")}<input class="input" type="search" name="q" value="${escapeHtml(filters.q)}" placeholder="ID, имя, @username" /></span></label>
    <div class="actions">${UI.button({ label: "Показать", kind: "primary", type: "submit" })}${hasFilters ? UI.button({ label: "Сбросить", href: "/admin/users", kind: "plain" }) : ""}</div>
    ${filters.sort ? `<input type="hidden" name="sort" value="${escapeHtml(filters.sort)}" /><input type="hidden" name="dir" value="${escapeHtml(filters.dir)}" />` : ""}
  </form>`;

  const tableRows = rows.map((row) => ({
    href: `/admin/users/${encodeURIComponent(row.userId)}`,
    cells: `<td class="cell-person">${UI.person(row.identity, { href: `/admin/users/${encodeURIComponent(row.userId)}` })}${row.hasFraud ? `<div class="fraud-line">${fraudCell(row)}</div>` : ""}</td>
      <td>${projectsCell(row.projects, row.hasWallet)}</td>
      <td class="num strong">${count(row.participations)}</td>
      <td class="num strong">${count(row.wins)}</td>
      <td class="num nowrap"><div class="strong">${escapeHtml(row.winningsText)}</div>${row.payoutsText && row.payoutsText !== "—" ? `<div class="dim" style="font-size:12.5px">выплачено ${escapeHtml(row.payoutsText)}</div>` : ""}</td>`,
  }));

  const from = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalFiltered, page * pageSize);
  const foot = `<span>${count(from)}–${count(to)} из ${count(totalFiltered)}${totalFiltered !== stats.usersTotal ? ` · всего ${count(stats.usersTotal)}` : ""}</span>
    <span class="pager">
      ${page > 1 ? UI.button({ label: "Назад", href: href({ page: page - 1 }), iconName: "back" }) : ""}
      <span class="dim">${page} из ${totalPages}</span>
      ${page < totalPages ? UI.button({ label: "Дальше", href: href({ page: page + 1 }) }) : ""}
    </span>`;

  const table = tableRows.length
    ? UI.table({
        sticky: true,
        columns: [
          { label: "Пользователь" }, { label: "Проекты" },
          sortColumn("Участий", "participations"), sortColumn("Побед", "wins"),
          { num: true, html: `${sortLink("Выиграно", "winnings")} <span class="faint">·</span> ${sortLink("выплачено", "payouts")}` },
        ],
        rows: tableRows,
      })
    : UI.blank("Никого не нашлось", "Попробуйте снять фильтры или изменить запрос.", "search");

  const refShare = percentOf(stats.refsTotal, stats.refsTotal + stats.nonRefsTotal);
  const tiles = `<div class="grid cols-4">
    ${UI.stat({ label: "Пользователей", value: stats.usersTotal, note: "знакомы боту", iconName: "users", tone: "green", i: 0 })}
    ${UI.stat({ label: "Привязок к проектам", value: stats.bindingsTotal, note: "человек + бренд организатора", iconName: "link", tone: "blue", i: 1 })}
    ${UI.stat({ label: "Рефов", value: stats.refsTotal, note: "подтверждённых", iconName: "check", tone: "green", ring: C.ring(refShare, { tone: "green", toneTo: "mint", size: 58, stroke: 7 }), i: 2 })}
    ${UI.stat({ label: "Не рефов", value: stats.nonRefsTotal, note: "отметились сами или по правилам", iconName: "person", tone: "orange", i: 3 })}
  </div>`;

  const card = `<section class="card" style="--i:4">${filterBar}<div class="card-body flush" style="padding-bottom:0">${table}</div>${tableRows.length ? `<div class="card-foot">${foot}</div>` : ""}</section>`;
  const activeFilters = [filters.brand && "бренд", filters.refOwnerId && "кто привёл", filters.ref && "статус", filters.activity && "активность", filters.q && "поиск"].filter(Boolean);

  return shell({
    title: "Пользователи",
    subtitle: activeFilters.length ? `${count(totalFiltered)} по фильтру · ${activeFilters.join(", ")}` : `${count(totalFiltered)} человек`,
    active: "users",
    body: `<div class="stack">${tiles}${card}</div>`,
  });
}

// ── one person ─────────────────────────────────────────────────────────────

const OUTCOME_TONES = { ok: "green", warn: "orange", muted: "muted", danger: "red" };
const OUTCOME_MARKS = { ok: ["green", "trophy"], warn: ["orange", "clock"], muted: ["gray", "clock"], danger: ["red", "shield"] };

// helpers: money(rub, usd) and nameOf(userId), which need the documents the
// route has already read.
function renderUserCardPage(deps, card, helpers) {
  const tz = deps.timezone;
  const who = F.identityOf(card.userId, card.meta || {});
  const badges = [];
  if (card.fraud.length) badges.push(UI.chip(`антифрод: ${card.fraud.length}`, "red", "shield"));
  if (card.totals.awaitingPayout > 0) badges.push(UI.chip(`ждёт выплаты: ${card.totals.awaitingPayout}`, "orange", "clock"));
  if (!card.known) badges.push(UI.chip("нет профиля", "muted"));
  if (!card.fraud.length && !card.totals.awaitingPayout && card.known) badges.push(UI.chip("без отметок", "green", "check"));

  const walletRows = card.wallets
    .map(
      (wallet) => `<div class="row" style="--inset:62px">
        <span class="tl-mark" style="--mark: var(--teal)">${icon("wallet")}</span>
        <div class="row-main"><div class="row-title mono" title="${escapeHtml(wallet.address)}">${escapeHtml(wallet.address)}</div><div class="row-sub">из ${escapeHtml(wallet.source === "выплата" ? "выплаты" : "профиля")}</div></div>
        <button type="button" class="btn" style="height:30px;padding:0 12px;font-size:13px" data-copy="${escapeHtml(wallet.address)}">${icon("copy")}<span data-copy-label>Копировать</span></button>
      </div>`,
    )
    .join("");

  const profile = `<section class="card profile" style="--i:0">
    ${UI.avatar(who, "lg")}
    <div>
      <div class="profile-name">${escapeHtml(who.title)}</div>
      ${who.handle ? `<div class="profile-handle">${escapeHtml(who.handle)}</div>` : ""}
      <div class="chips"><button type="button" class="chip chip-blue id-chip" data-copy="${escapeHtml(card.userId)}" title="Скопировать Telegram ID"><span data-copy-label>ID ${escapeHtml(card.userId)}</span></button>${badges.join("")}</div>
    </div>
  </section>`;

  const t = card.totals;
  const won = helpers.money(t.winningsRub, t.winningsUsd);
  const paid = helpers.money(t.paidRub, t.paidUsd);
  const tiles = `<div class="grid cols-4">
    ${UI.stat({ label: "Участий", value: t.participations, iconName: "users", tone: "blue", i: 1 })}
    ${UI.stat({ label: "Побед", value: t.wins, note: t.participations ? `${percentOf(t.wins, t.participations)}% участий` : "", iconName: "trophy", tone: "orange", i: 2 })}
    ${UI.stat({ label: "Выиграно", value: won, iconName: "gift", tone: "pink", i: 3 })}
    ${UI.stat({ label: "Выплачено", value: paid, note: t.awaitingPayout ? `ждёт выплаты: ${t.awaitingPayout}` : "", iconName: "wallet", tone: "green", i: 4 })}
  </div>`;

  const TIMELINE_SHOWN = 12;
  const drawRows = card.draws
    .map((draw, index) => {
      const tone = draw.outcome?.tone || "muted";
      const [markTone, markIcon] = draw.outcome ? OUTCOME_MARKS[tone] || ["gray", "trophy"] : ["gray", "person"];
      const detail = draw.outcome
        ? [
            draw.outcome.payoutPrize ? `к выплате ${draw.outcome.payoutPrize}` : "",
            draw.outcome.paidAt ? `выплачено ${F.formatRelative(draw.outcome.paidAt, tz)}` : "",
            draw.outcome.wallet ? draw.outcome.wallet : "",
            draw.outcome.reason || "",
          ].filter(Boolean).join(" · ")
        : "участвовал, без выигрыша";
      return `<div class="row${index >= TIMELINE_SHOWN ? " hidden" : ""}"${index >= TIMELINE_SHOWN ? " data-more" : ""}${draw.outcome ? " data-win" : ""}>
        <span class="tl-mark" style="--mark: var(--${markTone})">${icon(markIcon)}</span>
        <div class="row-main">
          <div class="row-title"><b>${escapeHtml(draw.prize)}</b>${draw.projectName && draw.projectName !== "Без проекта" ? ` <span class="dim">· ${escapeHtml(draw.projectName)}</span>` : ""}</div>
          <div class="row-sub">${escapeHtml(detail)}</div>
        </div>
        ${draw.outcome ? UI.chip(draw.outcome.label, OUTCOME_TONES[tone] || "muted") : ""}
        <span class="tl-when" title="${escapeHtml(F.formatDateTime(draw.at, tz))}">${escapeHtml(F.formatRelative(draw.at, tz))}</span>
      </div>`;
    })
    .join("");

  const projectRows = card.projects
    .map(
      (project) => `<div class="row" style="--inset:84px;align-items:flex-start">
        ${brandLogo(project.projectName).replace('class="brand-logo"', 'class="brand-logo sm"')}
        <div class="row-main">
          <div class="row-title"><b>${escapeHtml(project.projectName)}</b> <span class="dim">· ${escapeHtml(project.ownerId ? helpers.nameOf(String(project.ownerId)) : "без организатора")}</span></div>
          <div class="row-sub">${escapeHtml(project.nickname || project.accountId ? `ID ${project.nickname || project.accountId}` : "без ID")}</div>
          ${
            project.crossOrganizer
              ? `<div class="row-sub">не реф: первое участие — у ${project.brandHomeOwnerId ? `организатора ${escapeHtml(helpers.nameOf(String(project.brandHomeOwnerId)))}` : "другого организатора"}</div>`
              : project.firstTouchOwnerId
                ? `<div class="row-sub">привёл ${escapeHtml(helpers.nameOf(String(project.firstTouchOwnerId)))}${project.firstTouchSource === "draw" ? " (примерно)" : ""}</div>`
                : ""
          }
          ${project.idShapeMismatch ? `<div style="margin-top:6px">${UI.chip("ID в формате чужого проекта", "orange")}</div>` : ""}
        </div>
        ${refChip(project.refStatus)}
      </div>`,
    )
    .join("");

  const fraudRows = card.fraud
    .map((detail) => {
      const linked = (detail.linkedUserIds || [])
        .map((id) => `<a class="btn-plain" style="padding:0" href="/admin/users/${encodeURIComponent(id)}">${escapeHtml(id)}</a>`)
        .join(", ");
      return `<div class="row" style="--inset:62px;align-items:flex-start">
        <span class="tl-mark" style="--mark: var(--red)">${icon("shield")}</span>
        <div class="row-main"><div class="row-title">${escapeHtml(detail.label)}</div><div class="row-sub">${escapeHtml(detail.drawTitle || detail.drawId || "")}</div>${linked ? `<div class="row-sub" style="white-space:normal">связан с ${linked}</div>` : ""}</div>
      </div>`;
    })
    .join("");

  const supportRows = card.supportChats
    .map(
      (chat) => `<a class="row" href="/admin/support/${encodeURIComponent(chat.chatId)}" style="--inset:62px">
        <span class="tl-mark" style="--mark: var(--teal)">${icon("support")}</span>
        <div class="row-main"><div class="row-title">${escapeHtml(chat.botLabel)} · ${count(chat.messageCount)} ${F.plural(chat.messageCount, "сообщение", "сообщения", "сообщений")}</div><div class="row-sub">${escapeHtml(chat.preview || "")}</div></div>
        ${chat.sessionClosed ? UI.chip("завершён", "muted") : UI.chip("активен", "green")}
        <span class="tl-when">${escapeHtml(F.formatRelative(chat.lastMessageAt, tz))}</span>
      </a>`,
    )
    .join("");

  const moreCount = Math.max(0, card.draws.length - TIMELINE_SHOWN);
  const winCount = card.draws.filter((draw) => draw.outcome).length;
  const timeline = UI.card({
    title: "Розыгрыши",
    subtitle: `${card.draws.length} ${F.plural(card.draws.length, "запись", "записи", "записей")}, новые сверху`,
    tools: winCount
      ? `<div class="segmented timeline-tools" data-timeline-filter><button type="button" class="is-active" data-f="all">Все</button><button type="button" data-f="win">Победы<span class="seg-count">${winCount}</span></button></div>`
      : "",
    flush: true,
    i: 5,
    body: drawRows ? `<div class="rows timeline">${drawRows}</div>` : UI.blank("Не участвовал ни в одном розыгрыше", "", "gift"),
    foot: moreCount
      ? `<button type="button" class="btn btn-plain" onclick="var c=this.closest('.card');c.dataset.expanded='1';c.querySelectorAll('[data-more]').forEach(function(r){r.classList.remove('hidden')});this.closest('.card-foot').remove()">Показать все, ещё ${moreCount}</button>`
      : "",
  });

  const body = `<div class="stack">
    ${profile}
    ${tiles}
    <div class="grid cols-2-1" style="align-items:start">
      ${timeline}
      <div class="stack">
        ${UI.card({ title: "Проекты", subtitle: `${card.projects.length} ${F.plural(card.projects.length, "привязка", "привязки", "привязок")}`, flush: true, i: 6, body: projectRows ? `<div class="rows compact-rows">${projectRows}</div>` : UI.blank("Нет привязок к проектам", "", "projects") })}
        ${UI.card({ title: "Кошельки", subtitle: card.wallets.length ? `${card.wallets.length} ${F.plural(card.wallets.length, "адрес", "адреса", "адресов")}` : "", flush: true, i: 7, body: walletRows ? `<div class="rows">${walletRows}</div>` : UI.blank("Кошелёк не указан", "", "wallet") })}
        ${UI.card({ title: "Антифрод", flush: true, i: 8, body: fraudRows ? `<div class="rows">${fraudRows}</div>` : UI.blank("Отметок нет", "", "shield") })}
        ${UI.card({ title: "Поддержка", flush: true, i: 9, body: supportRows ? `<div class="rows">${supportRows}</div>` : UI.blank("Обращений не было", "", "support") })}
      </div>
    </div>
  </div>`;

  const script = `<script>
    document.querySelectorAll("[data-timeline-filter]").forEach(function (box) {
      var card = box.closest(".card");
      box.querySelectorAll("button").forEach(function (btn) {
        btn.addEventListener("click", function () {
          box.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
          var winsOnly = btn.dataset.f === "win";
          card.querySelectorAll(".timeline .row").forEach(function (row) {
            var hideAsMore = row.hasAttribute("data-more") && !card.dataset.expanded;
            row.classList.toggle("hidden", winsOnly ? !row.hasAttribute("data-win") : hideAsMore);
          });
          var foot = card.querySelector(".card-foot");
          if (foot) foot.classList.toggle("hidden", winsOnly);
        });
      });
    });
  </script>`;

  return shell({
    title: who.title,
    scripts: script,
    subtitle: `${count(t.participations)} ${F.plural(t.participations, "участие", "участия", "участий")} · ${count(t.wins)} ${F.plural(t.wins, "победа", "победы", "побед")}`,
    kicker: `<a href="/admin/users">${icon("back")}Пользователи</a>`,
    pageTitle: who.title,
    active: "users",
    body,
  });
}

// ── projects ───────────────────────────────────────────────────────────────

const OWNER_TONES = ["blue", "green", "orange"];

function renderProjectsPage(stats) {
  const t = stats.totals;
  const topOwners = stats.owners.slice(0, 3);
  const topIds = new Set(topOwners.map((owner) => owner.ownerId));
  const hasRest = stats.owners.length > topOwners.length;
  const peopleFor = (brand, ownerId) => stats.cells.find((row) => row.brand === brand && row.ownerId === ownerId)?.people || 0;

  const series = topOwners.map((owner, index) => ({ label: owner.identity.handle || owner.identity.title, tone: OWNER_TONES[index] }));
  if (hasRest) series.push({ label: "Прочие", tone: "gray" });
  const groups = stats.brands.map((row) => ({
    label: row.brand,
    values: [
      ...topOwners.map((owner) => peopleFor(row.brand, owner.ownerId)),
      ...(hasRest
        ? [stats.cells.filter((cell) => cell.brand === row.brand && !topIds.has(cell.ownerId)).reduce((sum, cell) => sum + cell.people, 0)]
        : []),
    ],
  }));

  const credit = stats.owners.map((owner) => ({
    label: owner.identity.handle || owner.identity.title,
    value: stats.cells.filter((row) => row.ownerId === owner.ownerId).reduce((sum, row) => sum + row.attributed, 0),
    lead: UI.avatar(owner.identity, "sm"),
    tone: "blue",
  }));

  const spread = (rows, forms, tone) =>
    C.hbars(rows.map((row) => ({ label: `${row.count} ${F.plural(row.count, ...forms)}`, value: row.people, display: count(row.people), tone })));

  const brandRows = stats.brands.map(
    (row) => `<td><div class="person">${brandLogo(row.brand)}<b>${escapeHtml(row.brand)}</b></div></td><td class="num strong">${count(row.people)}</td><td class="num">${count(row.entries)}</td><td class="num">${count(row.draws)}</td><td class="num">${count(row.owners)}</td>`,
  );
  const cellRows = stats.cells
    .filter((row) => row.people > 0)
    .sort((left, right) => right.people - left.people)
    .map((row) => {
      const owner = stats.owners.find((item) => item.ownerId === row.ownerId);
      return `<td>${owner ? UI.person(owner.identity) : escapeHtml(row.ownerId)}</td><td><div class="person">${brandLogo(row.brand).replace('class="brand-logo"', 'class="brand-logo sm"')}<span>${escapeHtml(row.brand)}</span></div></td><td class="num strong">${count(row.people)}</td><td class="num">${count(row.entries)}</td><td class="num">${count(row.draws)}</td><td class="num">${count(row.attributed)}</td>`;
    });

  const shared = percentOf(t.sharedPeople, t.people);
  const body = `<div class="stack">
    <div class="grid cols-4">
      ${UI.stat({ label: "Людей всего", value: t.people, note: "уникальных за всю историю", iconName: "users", tone: "blue", i: 0 })}
      ${UI.stat({ label: "Привязок «человек + проект»", value: t.bindings, iconName: "link", tone: "indigo", i: 1 })}
      ${UI.stat({ label: "Ходят в несколько проектов", value: t.sharedPeople, note: `${shared}% базы`, iconName: "projects", tone: "orange", ring: C.ring(shared, { tone: "orange", toneTo: "yellow", size: 58, stroke: 7 }), i: 2 })}
      ${UI.stat({ label: "С отметкой «привёл первым»", value: t.attributed, iconName: "flag", tone: "green", i: 3 })}
    </div>
    ${UI.card({
      title: "Участники по проектам и организаторам",
      subtitle: "уникальные люди; столбцы не складываются — один человек ходит к нескольким организаторам",
      i: 4,
      body: C.groupedBars(groups, series, { unit: " чел." }),
    })}
    <div class="grid cols-2">
      ${UI.card({ title: "Кто привёл первым", subtitle: "по записи в профиле, а не по пересчёту", i: 5, body: C.hbars(credit) })}
      ${UI.card({
        title: "Насколько аудитории пересекаются",
        subtitle: "в скольких проектах и у скольких организаторов участвует один человек",
        i: 6,
        body: `<div class="sub-head">В скольких проектах</div>${spread(stats.spreadByProject, ["проект", "проекта", "проектов"], "orange")}<div class="sub-head" style="margin-top:22px">У скольких организаторов</div>${spread(stats.spreadByOwner, ["организатор", "организатора", "организаторов"], "indigo")}`,
      })}
    </div>
    <div class="stack">
      ${UI.card({
        title: "Проекты",
        subtitle: "бренд целиком, по всем организаторам",
        flush: true,
        i: 7,
        body: brandRows.length
          ? UI.table({ columns: [{ label: "Проект" }, { label: "Людей", num: true }, { label: "Участий", num: true }, { label: "Розыгрышей", num: true }, { label: "Организ.", num: true }], rows: brandRows })
          : UI.blank("Пусто", "Данных пока нет.", "projects"),
      })}
      ${UI.card({
        title: "Проект каждого организатора",
        subtitle: "отдельная связка «организатор + проект»",
        flush: true,
        i: 8,
        body: cellRows.length
          ? UI.table({ columns: [{ label: "Организатор" }, { label: "Проект" }, { label: "Людей", num: true }, { label: "Участий", num: true }, { label: "Розыгр.", num: true }, { label: "Привёл", num: true }], rows: cellRows })
          : UI.blank("Пусто", "Данных пока нет.", "projects"),
      })}
    </div>
  </div>`;

  return shell({
    title: "Проекты",
    subtitle: `${count(t.people)} человек · ${count(t.projects)} ${F.plural(t.projects, "проект", "проекта", "проектов")} · ${count(t.owners)} ${F.plural(t.owners, "организатор", "организатора", "организаторов")}`,
    active: "projects",
    body,
  });
}

// ── invitations ────────────────────────────────────────────────────────────

function renderReferralsPage(stats) {
  const t = stats.totals;
  const w = stats.winners;

  const inviterRows = stats.topInviters
    .map(
      (row, index) => `<a class="row" href="/admin/users/${encodeURIComponent(row.identity.userId)}" style="--inset:104px">
        <span class="rank${index < 3 ? ` rank-${index + 1}` : ""}">${index + 1}</span>
        ${UI.avatar(row.identity)}
        <div class="row-main"><div class="row-title">${escapeHtml(row.identity.title)}</div><div class="row-sub">${escapeHtml(row.identity.handle || `${row.draws} ${F.plural(row.draws, "розыгрыш", "розыгрыша", "розыгрышей")}`)}</div></div>
        <div class="row-value">${count(row.invites)}<small>привёл</small></div>
      </a>`,
    )
    .join("");

  const organizerRows = stats.byOrganizer
    .map(
      (row) => `<div class="row" style="--inset:68px">
        ${UI.avatar(row.identity)}
        <div class="row-main"><div class="row-title">${escapeHtml(row.identity.title)}</div><div class="row-sub">${count(row.draws)} ${F.plural(row.draws, "розыгрыш", "розыгрыша", "розыгрышей")} · ${escapeHtml(Number(row.perDraw).toLocaleString("ru-RU"))} на розыгрыш</div></div>
        <div class="row-value">${count(row.invites)}<small>приглашений</small></div>
      </div>`,
    )
    .join("");

  const winnerRows = w.rows.map(
    (row) => `<td>${UI.person(row.identity)}</td><td class="strong">${escapeHtml(String(row.prize))}</td><td class="num">${count(row.invites)}</td><td class="num dim">${count(row.participants)} / ${count(row.places)}</td>`,
  );

  // The mini app tells people an invite is worth "+50% к шансу". The draw does
  // not work that way - winners are picked uniformly - so the two rates stand
  // side by side here.
  const verdict =
    w.inviterEntries === 0
      ? "Приглашавшие ещё ни разу не участвовали в завершённых розыгрышах."
      : `Приглашавшие выигрывают в <b>${w.inviterWinRate}%</b> случаев, все участники — в <b>${w.averageWinRate}%</b>. Обещанный в мини-аппе бонус «+50% к шансу» на розыгрыш не влияет: победители выбираются равновероятно.`;
  const rates =
    w.inviterEntries === 0
      ? ""
      : `<div style="display:flex;gap:28px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div style="display:flex;gap:12px;align-items:center">${C.ring(Math.min(100, Number(w.inviterWinRate) * 4), { tone: "pink", toneTo: "orange", size: 76, stroke: 9, center: `${w.inviterWinRate}%` })}<div><div class="strong">Приглашавшие</div><div class="note">доля побед</div></div></div>
          <div style="display:flex;gap:12px;align-items:center">${C.ring(Math.min(100, Number(w.averageWinRate) * 4), { tone: "blue", toneTo: "indigo", size: 76, stroke: 9, center: `${w.averageWinRate}%` })}<div><div class="strong">Все участники</div><div class="note">доля побед</div></div></div>
        </div>`;

  const body = `<div class="stack">
    <div class="grid cols-4">
      ${UI.stat({ label: "Приглашений", value: t.invites, note: `${t.sharePercent}% всех участий`, iconName: "gift", tone: "pink", i: 0 })}
      ${UI.stat({ label: "Приглашено людей", value: t.invitedPeople, iconName: "users", tone: "blue", i: 1 })}
      ${UI.stat({ label: "Кто приглашал", value: t.inviters, iconName: "person", tone: "green", i: 2 })}
      ${UI.stat({ label: "Розыгрышей с приглашениями", value: t.drawsWithReferrals, note: `из ${count(t.drawsTotal)}`, iconName: "sparkles", tone: "orange", ring: C.ring(percentOf(t.drawsWithReferrals, t.drawsTotal), { tone: "orange", toneTo: "pink", size: 58, stroke: 7 }), i: 3 })}
    </div>
    <div class="grid cols-2" style="align-items:start">
      ${UI.card({ title: "Кто приглашает", subtitle: "по числу приведённых участников", flush: true, i: 4, body: inviterRows ? `<div class="rows">${inviterRows}</div>` : UI.blank("Пусто", "Приглашений пока не было.", "gift") })}
      <div class="stack">
        ${UI.card({ title: "По организаторам", subtitle: "у кого механика работает лучше", flush: true, i: 5, body: organizerRows ? `<div class="rows">${organizerRows}</div>` : UI.blank("Пусто", "Приглашений пока не было.", "users") })}
        ${UI.card({ title: "Сколько приводит один человек", i: 6, body: C.hbars(stats.distribution.map((row) => ({ label: row.label, value: row.count, display: count(row.count), tone: "pink" }))) })}
        ${UI.card({ title: "По месяцам", subtitle: "приглашений за месяц", i: 7, body: C.columns(stats.months.map((row) => ({ label: monthLabel(row.month), value: row.invites, display: `${count(row.invites)} приглашений` })), { tone: "pink", height: 170 }) })}
      </div>
    </div>
    ${UI.card({
      title: "Влияет ли приглашение на выигрыш",
      subtitle: `${count(w.whoInvited)} из ${count(w.total)} победителей приглашали в том же розыгрыше`,
      i: 8,
      body: `${rates}<p class="note" style="font-size:14px;margin-bottom:${winnerRows.length ? "14px" : "0"}">${verdict}</p>${
        winnerRows.length
          ? `<div style="margin:0 -20px -20px">${UI.table({ columns: [{ label: "Победитель" }, { label: "Приз" }, { label: "Пригласил", num: true }, { label: "Участников / мест", num: true }], rows: winnerRows })}</div>`
          : ""
      }`,
    })}
  </div>`;

  return shell({
    title: "Приглашения",
    subtitle: `${count(t.invites)} ${F.plural(t.invites, "приглашение", "приглашения", "приглашений")} от ${count(t.inviters)} ${F.plural(t.inviters, "человека", "человек", "человек")}`,
    active: "referrals",
    body,
  });
}

// ── system ─────────────────────────────────────────────────────────────────

function renderSystemPage(state) {
  const dur = SYS.formatDuration;
  const alive = state.scheduler.alive;
  const watch = state.watchdog;
  const statusNote = (tone, text) => `<span style="display:inline-flex;align-items:center;gap:8px"><span class="status-dot${tone === "green" ? " live" : ""}" style="--dot: var(--${tone})"></span>${escapeHtml(text)}</span>`;

  const tiles = `<div class="grid cols-4">
    ${UI.stat({ label: "Планировщик", value: alive ? "работает" : "молчит", note: statusNote(alive ? "green" : "red", `пульс ${dur(state.scheduler.ageMs)} назад · тик #${state.scheduler.tick ?? "?"}`), iconName: "pulse", tone: alive ? "green" : "red", i: 0 })}
    ${UI.stat({ label: "Сторож", value: watch.installed ? (watch.healthy ? "норма" : "тревога") : "не стоит", note: watch.checkedAgeMs !== null ? `проверка ${dur(watch.checkedAgeMs)} назад` : "проверок не было", iconName: "shield", tone: watch.installed && watch.healthy ? "green" : "orange", i: 1 })}
    ${UI.stat({ label: "Аптайм", value: dur(state.process.uptimeMs), note: `${state.process.memoryMb} МБ · node ${escapeHtml(state.process.node)}`, iconName: "cpu", tone: "blue", i: 2 })}
    ${UI.stat({ label: "Свежий бэкап", value: state.backups.count ? `${dur(state.backups.ageMs)} назад` : "нет", note: `${count(state.backups.count)} ${F.plural(state.backups.count, "копия", "копии", "копий")}`, iconName: "database", tone: state.backups.count ? "teal" : "red", i: 3 })}
  </div>`;

  const calls = state.telegramCalls;
  const callBars = calls && calls.methods.length
    ? C.hbars(calls.methods.slice(0, 10).map((row) => ({ label: row.method, value: row.count, display: `${count(row.count)} · ${row.perMinute}/мин`, tone: "blue" })))
    : UI.blank("Вызовов пока не было", "", "bolt");

  const overdue = state.draws.overdue
    .map(
      (draw) => `<div class="row" style="--inset:62px">
        <span class="tl-mark" style="--mark: var(--red)">${icon("clock")}</span>
        <div class="row-main"><div class="row-title">${escapeHtml(draw.prize)}</div><div class="row-sub mono">${escapeHtml(draw.id)}</div></div>
        <div class="row-value">${count(draw.lateMinutes)} мин<small>${count(draw.participants)} участников</small></div>
      </div>`,
    )
    .join("");

  const errorRows = (state.logs.errors.kinds || [])
    .map(
      (kind) => `<div class="row" style="align-items:flex-start">
        <span class="rank" style="width:auto;min-width:34px;padding:0 8px;border-radius:999px">${count(kind.count)}</span>
        <div class="row-main"><div class="row-sub" style="white-space:normal;color:var(--label)">${escapeHtml(String(kind.sample).slice(0, 220))}</div></div>
      </div>`,
    )
    .join("");

  const maxDoc = Math.max(1, ...state.storage.docs.map((doc) => doc.size));
  const docBars = state.storage.docs.length
    ? C.hbars(state.storage.docs.map((doc) => ({ label: doc.key, value: doc.size, display: SYS.formatBytes(doc.size), tone: doc.size > maxDoc * 0.6 ? "orange" : "teal" })))
    : UI.blank("База недоступна", "", "database");

  const body = `<div class="stack">
    ${tiles}
    ${UI.card({
      title: "Отчёт для разработчика",
      subtitle: "скопируйте и вставьте в чат, если что-то сломалось",
      tools: `<button type="button" class="btn btn-primary" data-copy-target="reportText">${icon("copy")}<span>Скопировать</span></button>`,
      i: 4,
      body: `<pre class="pre" id="reportText">${escapeHtml(SYS.buildPlainReport(state))}</pre>`,
    })}
    <div class="grid cols-2">
      ${UI.card({
        title: "Запросы к Telegram",
        subtitle: calls
          ? `${count(calls.total)} с запуска · ${calls.perMinute} в минуту${calls.subscriptionCache && calls.subscriptionCache.hits > 0 ? ` · кэш подписок сэкономил ${calls.subscriptionCache.savedShare}%` : ""}`
          : "счётчик недоступен",
        i: 5,
        body: callBars,
      })}
      ${UI.card({
        title: "Розыгрыши, которые встали",
        subtitle: `активных ${count(state.draws.active)} · завершённых без уведомления ${count(state.draws.finishedWithoutNotify)}`,
        flush: true,
        i: 6,
        body: overdue ? `<div class="rows">${overdue}</div>` : UI.blank("Всё вовремя", "Ни один активный розыгрыш не просрочен.", "check"),
      })}
    </div>
    <div class="grid cols-2">
      ${UI.card({
        title: "Ошибки в логе",
        subtitle: `${count(state.logs.errors.total)} строк${state.logs.errors.undatedCount ? ` · ${count(state.logs.errors.undatedCount)} старых не учтены` : ""}`,
        flush: true,
        i: 7,
        body: errorRows ? `<div class="rows">${errorRows}</div>` : UI.blank("Чисто", "В хвосте лога ошибок нет.", "check"),
      })}
      ${UI.card({ title: "База", subtitle: SYS.formatBytes(state.storage.dbSize), i: 8, body: docBars })}
    </div>
    ${UI.card({ title: "Последние строки лога", subtitle: "секреты вырезаны", i: 9, body: `<pre class="pre">${escapeHtml(state.logs.errors.tail.join("\n") || "пусто")}</pre>` })}
  </div>`;

  return shell({
    title: "Система",
    subtitle: alive ? "Планировщик работает" : "Планировщик молчит",
    active: "system",
    tools: UI.button({ label: "Обновить", href: "/admin/system", iconName: "refresh" }),
    body,
    scripts: `<script>
      document.querySelectorAll("[data-copy-target]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var target = document.getElementById(btn.dataset.copyTarget);
          var label = btn.querySelector("span");
          var was = label.textContent;
          function done(text) { label.textContent = text; setTimeout(function () { label.textContent = was; }, 1800); }
          navigator.clipboard.writeText(target.textContent).then(function () { done("Скопировано"); }, function () {
            var range = document.createRange(); range.selectNodeContents(target);
            var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
            done("Выделено — Ctrl+C");
          });
        });
      });
    </script>`,
  });
}

// ── support ────────────────────────────────────────────────────────────────

function supportHref(view, overrides = {}) {
  const query = new URLSearchParams();
  const q = overrides.q ?? view.query;
  const page = overrides.page ?? 1;
  if (q) query.set("q", q);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `?${text}` : "";
}

function renderSupportList(view, selectedId = "") {
  const items = view.rows
    .map((chat) => {
      const who = F.identityOf(chat.chatId, view.metaById?.[String(chat.chatId)] || {});
      const flags = chat.flags
        .slice(0, 2)
        .map((flag) => UI.chip(flag.label, flag.tone === "danger" ? "red" : flag.tone === "warn" ? "orange" : "muted"))
        .join("");
      const active = String(chat.chatId) === String(selectedId);
      return `<a class="conv${active ? " is-active" : ""}" href="/admin/support/${encodeURIComponent(chat.chatId)}${supportHref(view)}">
        ${UI.avatar(who)}
        <div class="conv-body">
          <div class="conv-top"><span class="conv-name">${escapeHtml(chat.name || who.title)}</span><span class="conv-time">${escapeHtml(F.formatRelative(chat.lastMessageAt, view.timezone))}</span></div>
          <div class="conv-preview">${escapeHtml(chat.preview || "—")}</div>
          <div class="conv-foot"><span class="chips">${flags}</span><span class="conv-count">${count(chat.messageCount)}</span></div>
        </div>
      </a>`;
    })
    .join("");

  const pager =
    view.totalPages > 1
      ? `<div class="m-pager"><span>${view.rows.length} из ${count(view.totalFiltered)}</span><span class="pager">
          ${view.page > 1 ? UI.button({ href: `/admin/support${supportHref(view, { page: view.page - 1 })}`, iconName: "back", kind: "icon" }) : ""}
          <span>${view.page}/${view.totalPages}</span>
          ${view.page < view.totalPages ? UI.button({ href: `/admin/support${supportHref(view, { page: view.page + 1 })}`, iconName: "chevron", kind: "icon" }) : ""}
        </span></div>`
      : "";

  return `<aside class="m-list">
    <div class="m-list-head">
      <h1 class="m-list-title">Поддержка</h1>
      <div class="m-list-sub">${UI.chip(`требуют внимания: ${view.summary.attention}`, view.summary.attention ? "red" : "muted")}${UI.chip(`живых: ${view.summary.open}`, "green")}${UI.chip(`всего: ${view.summary.total}`, "muted")}</div>
      <form method="get" action="/admin/support" class="search">${icon("search")}<input class="input" type="search" name="q" value="${escapeHtml(view.query)}" placeholder="Поиск по переписке, имени, ID" /></form>
    </div>
    <div class="m-scroll">${items || UI.blank("Ничего не найдено", "Измените запрос.", "search")}</div>
    ${pager}
  </aside>`;
}

function renderSupportListPage(view, timezone) {
  view.timezone = timezone;
  return shell({
    title: "Поддержка",
    active: "support",
    bare: true,
    body: `<div class="messenger">${renderSupportList(view)}<section class="thread"><div class="thread-empty">${UI.blank("Выберите диалог", "Сверху те, где бот не справился или ждут ответа.", "support")}</div></section></div>`,
  });
}

function roleLabel(role, kind) {
  if (role === "user") return "пользователь";
  if (kind === "greeting") return "приветствие";
  if (kind === "escalation") return "эскалация";
  if (kind === "off_hours") return "вне часов";
  if (kind === "idle_close") return "закрытие";
  if (kind === "closed") return "завершён (/stop)";
  if (kind === "admin") return "вы, из админки";
  if (kind === "media") return "медиа";
  if (kind === "error") return "ошибка AI";
  return "бот";
}

function renderSupportChatPage(view, chatId, state, timezone, options = {}) {
  view.timezone = timezone;
  const transcript = getChatTranscript(state);
  const name = formatSupportChatName(state, chatId);
  const sessionClosed = Boolean(state.sessionClosed);
  const who = F.identityOf(chatId, options.meta || {});
  const threadMeta = [options.storeLabel || "", sessionClosed ? "диалог завершён" : "диалог активен", `${count(transcript.length)} ${F.plural(transcript.length, "сообщение", "сообщения", "сообщений")}`]
    .filter(Boolean)
    .join(" · ");

  let lastDay = "";
  const messages = transcript
    .map((msg) => {
      const role = msg.role === "user" ? "user" : msg.kind === "admin" ? "admin" : msg.kind === "error" ? "error" : msg.role === "system" ? "system" : "bot";
      const day = msg.at ? F.formatRelative(msg.at, timezone).replace(/,.*$/, "") : "";
      const sep = day && day !== lastDay ? `<div class="day-sep">${escapeHtml(day)}</div>` : "";
      lastDay = day || lastDay;
      return `${sep}<div class="bubble b-${role}">${escapeHtml(msg.content || "")}<div class="bubble-meta">${escapeHtml(roleLabel(msg.role, msg.kind))} · ${escapeHtml(F.formatDateTime(msg.at, timezone))}</div></div>`;
    })
    .join("");

  const flash = options.flash
    ? `<div class="flash ${options.flash.type === "error" ? "flash-error" : "flash-ok"}">${escapeHtml(options.flash.text)}</div>`
    : "";

  const compose =
    options.canReply === false
      ? `<div class="compose"><div class="note">Диалог второго бота поддержки — только просмотр.</div></div>`
      : sessionClosed
        ? `<div class="compose"><div class="note">Диалог завершён. Пользователь получил сообщение с просьбой нажать /start.</div></div>`
        : `<form class="compose" method="post" action="/admin/support/${encodeURIComponent(chatId)}/reply">
            <div class="compose-box">
              <textarea name="text" required rows="1" placeholder="Ответ уйдёт в Telegram от support-бота" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,180)+'px'"></textarea>
              <button type="submit" class="compose-send" title="Отправить" aria-label="Отправить">${icon("send")}</button>
            </div>
            <div class="compose-row">
              <span>AI-бот продолжает отвечать как обычно.</span>
              <button type="submit" class="btn btn-danger" style="height:30px;padding:0 12px;font-size:13px" formaction="/admin/support/${encodeURIComponent(chatId)}/close" formmethod="post" formnovalidate onclick="return confirm('Завершить диалог? Пользователю уйдёт сообщение с /start.');">Завершить диалог</button>
            </div>
          </form>`;

  const body = `<div class="messenger">
    ${renderSupportList(view, chatId)}
    <section class="thread">
      <div class="thread-head">
        ${UI.person(who, { href: `/admin/users/${encodeURIComponent(chatId)}`, sub: threadMeta })}
        ${UI.button({ label: "Профиль", href: `/admin/users/${encodeURIComponent(chatId)}`, iconName: "person" })}
      </div>
      ${flash}
      <div class="thread-body" id="threadBody">${messages || UI.blank("Переписка пуста", "", "support")}</div>
      ${compose}
    </section>
  </div>`;

  return shell({
    title: "Поддержка",
    pageTitle: name,
    active: "support",
    bare: true,
    body,
    scripts: `<script>
      var t = document.getElementById("threadBody");
      if (t) t.scrollTop = t.scrollHeight;
      var area = document.querySelector(".compose textarea");
      if (area) area.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); area.form.requestSubmit(); }
      });
    </script>`,
  });
}

module.exports = {
  pageStyles,
  shell,
  brandLogo,
  brandTone,
  dayLabel,
  count,
  percentOf,
  renderLoginPage,
  renderAdminNotFound,
  renderDashboardPage,
  renderFunnelPage,
  renderUsersPage,
  renderUserCardPage,
  renderProjectsPage,
  renderReferralsPage,
  renderSystemPage,
  renderSupportListPage,
  renderSupportChatPage,
};
