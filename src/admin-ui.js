// The shell every admin page is drawn into. Pages used to each carry their own
// stylesheet and stack cards down one column, which read as a mock-up rather
// than a tool. Layout, spacing, type and components live here once.

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ICONS = {
  stats:
    '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 15.6A4.6 4.6 0 0 1 21 20"/>',
  support:
    '<path d="M20 15.5A2.5 2.5 0 0 1 17.5 18H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z"/>',
  system:
    '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  projects:
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h3M14 13h2"/>',
  referrals:
    '<circle cx="8" cy="7" r="3"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5l4 4-4 4"/><path d="M20 9h-6"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
};

function icon(name) {
  const path = ICONS[name];
  if (!path) {
    return "";
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const NAV = [
  { id: "stats", href: "/admin/dashboard", label: "Статистика", icon: "stats" },
  { id: "users", href: "/admin/users", label: "Пользователи", icon: "users" },
  { id: "projects", href: "/admin/projects", label: "Проекты", icon: "projects" },
  { id: "referrals", href: "/admin/referrals", label: "Приглашения", icon: "referrals" },
  { id: "support", href: "/admin/support", label: "Поддержка", icon: "support" },
  { id: "system", href: "/admin/system", label: "Система", icon: "system" },
];

function baseStyles() {
  return `
    :root {
      --bg: #090c12;
      --rail: #0d1119;
      --surface: #111722;
      --surface-2: #161d2b;
      --line: #1f2836;
      --line-soft: #19212e;
      --text: #e8eef8;
      --text-dim: #97a3b6;
      --text-faint: #6b7789;
      --accent: #4f8cff;
      --accent-soft: rgba(79,140,255,.14);
      --ok-bg: #0f2f1e; --ok-fg: #6fdda0;
      --warn-bg: #35270e; --warn-fg: #edc36f;
      --danger-bg: #35151a; --danger-fg: #ff8f97;
      --rail-w: 216px;
      --head-h: 52px;
      --r: 10px;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font: 13px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: #24304a; border-radius: 8px; border: 2px solid var(--bg); }
    ::-webkit-scrollbar-track { background: transparent; }

    /* ---------- shell ---------- */
    .app { display: grid; grid-template-columns: var(--rail-w) 1fr; min-height: 100vh; }
    .rail {
      background: var(--rail); border-right: 1px solid var(--line);
      display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
    }
    .brand { display: flex; align-items: center; gap: 9px; padding: 0 16px; height: var(--head-h); border-bottom: 1px solid var(--line); }
    .brand-mark {
      width: 22px; height: 22px; border-radius: 6px; flex: none;
      background: linear-gradient(135deg, #4f8cff, #7ee2a8);
    }
    .brand-name { font-weight: 650; font-size: 13.5px; letter-spacing: .2px; }
    .rail-nav { padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
    .rail-label { padding: 12px 8px 5px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
    .rail-link {
      display: flex; align-items: center; gap: 9px; padding: 7px 9px; border-radius: 8px;
      color: var(--text-dim); font-size: 13px; font-weight: 500;
    }
    .rail-link svg { width: 16px; height: 16px; flex: none; opacity: .85; }
    .rail-link:hover { background: var(--surface); color: var(--text); }
    .rail-link.is-active { background: var(--accent-soft); color: #cfe0ff; }
    .rail-link.is-active svg { color: var(--accent); opacity: 1; }
    .rail-foot { margin-top: auto; padding: 10px 8px; border-top: 1px solid var(--line); }
    .rail-foot form { margin: 0; }
    .rail-foot button {
      width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 9px; border-radius: 8px;
      background: transparent; border: none; color: var(--text-faint); font: inherit; cursor: pointer; text-align: left;
    }
    .rail-foot button svg { width: 16px; height: 16px; }
    .rail-foot button:hover { background: var(--surface); color: var(--text); }

    .main { min-width: 0; display: flex; flex-direction: column; }
    .head {
      height: var(--head-h); display: flex; align-items: center; gap: 14px; justify-content: space-between;
      padding: 0 20px; border-bottom: 1px solid var(--line); background: rgba(9,12,18,.86);
      backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 30;
    }
    .head-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
    .head-title h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: .1px; white-space: nowrap; }
    .head-sub { color: var(--text-faint); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .head-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .content { padding: 18px 20px 44px; }
    .content-flush { padding: 0; }

    /* ---------- controls ---------- */
    .btn {
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      padding: 5px 11px; border-radius: 8px; font-size: 12.5px; font-weight: 500; line-height: 1.4;
      border: 1px solid var(--line); background: var(--surface); color: var(--text-dim);
    }
    .btn:hover { border-color: #2c3950; color: var(--text); }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #05101f; font-weight: 650; }
    .btn-primary:hover { background: #3f7cf0; color: #05101f; }
    .btn-quiet { background: transparent; }
    .btn-danger { background: var(--danger-bg); border-color: #4a1e24; color: var(--danger-fg); }
    .seg { display: inline-flex; padding: 2px; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: 9px; }
    .seg a { padding: 4px 10px; border-radius: 7px; font-size: 12.5px; color: var(--text-dim); }
    .seg a:hover { color: var(--text); }
    .seg a.is-active { background: var(--surface-2); color: #fff; box-shadow: inset 0 0 0 1px var(--line); }
    .seg-count { opacity: .55; margin-left: 4px; font-size: 11px; }

    select, input[type="search"], input[type="text"], input[type="password"], textarea {
      padding: 5px 9px; border-radius: 8px; font: inherit; font-size: 12.5px;
      border: 1px solid var(--line); background: var(--surface); color: var(--text);
    }
    select:focus, input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field > span { font-size: 11px; color: var(--text-faint); }

    /* ---------- surfaces ---------- */
    .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border-bottom: 1px solid var(--line-soft); }
    .card-head h2 { margin: 0; font-size: 12.5px; font-weight: 600; }
    .card-head p { margin: 1px 0 0; font-size: 11.5px; color: var(--text-faint); }
    .card-body { padding: 14px; }
    .card-body-tight { padding: 10px 14px; }

    .kpis { display: grid; gap: 10px; margin-bottom: 14px; }
    .kpis-3 { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .kpis-4 { grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); }
    .kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 13px 15px; }
    .kpi-label { font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: .06em; }
    .kpi-value { font-size: 27px; font-weight: 650; letter-spacing: -.02em; margin-top: 5px; line-height: 1.1; }
    .kpi-lead .kpi-value { font-size: 34px; }
    .kpi-note { font-size: 11.5px; color: var(--text-faint); margin-top: 4px; }
    .kpi-bar { height: 3px; border-radius: 3px; background: var(--line); margin-top: 9px; overflow: hidden; }
    .kpi-bar i { display: block; height: 100%; background: var(--accent); }

    .grid { display: grid; gap: 12px; }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
    .grid-3 { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }

    /* ---------- tables ---------- */
    .tbl-wrap { overflow-x: auto; }
    table.tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
    /* Sticky headers belong to a full-page list, not to a small table sitting in
       a card halfway down the page - there they float over their own rows. */
    table.tbl thead th {
      background: var(--surface-2);
      color: var(--text-faint); font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em;
      text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); white-space: nowrap;
    }
    table.tbl thead th a { color: inherit; display: inline-flex; align-items: center; gap: 4px; }
    table.tbl thead th a:hover { color: var(--text); }
    table.tbl tbody td { padding: 8px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
    table.tbl tbody tr:hover td { background: var(--surface-2); }
    table.tbl tbody tr:last-child td { border-bottom: none; }
    table.tbl-sticky thead th { position: sticky; top: var(--head-h); z-index: 10; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .strong { font-weight: 600; color: var(--text); }
    .dim { color: var(--text-faint); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--text-faint); }
    .nowrap { white-space: nowrap; }
    .ellip { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .chip { display: inline-block; font-size: 10.5px; line-height: 1.7; padding: 0 8px; border-radius: 999px; background: var(--surface-2); color: var(--text-dim); white-space: nowrap; border: 1px solid var(--line); }
    .chip-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: transparent; }
    .chip-warn { background: var(--warn-bg); color: var(--warn-fg); border-color: transparent; }
    .chip-danger { background: var(--danger-bg); color: var(--danger-fg); border-color: transparent; }
    .chip-muted { background: var(--surface-2); color: var(--text-faint); }
    .chip-accent { background: var(--accent-soft); color: #b9d2ff; border-color: transparent; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    /* Older markup still says "badge"; same thing. */
    .badge { display: inline-block; font-size: 10.5px; line-height: 1.7; padding: 0 8px; border-radius: 999px; background: var(--surface-2); color: var(--text-dim); white-space: nowrap; border: 1px solid var(--line); }
    .badge-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: transparent; }
    .badge-warn { background: var(--warn-bg); color: var(--warn-fg); border-color: transparent; }
    .badge-danger { background: var(--danger-bg); color: var(--danger-fg); border-color: transparent; }
    .badge-muted { background: var(--surface-2); color: var(--text-faint); }
    .outcome-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: transparent; }
    .outcome-warn { background: var(--warn-bg); color: var(--warn-fg); border-color: transparent; }
    .outcome-danger { background: var(--danger-bg); color: var(--danger-fg); border-color: transparent; }
    .outcome-muted { background: var(--surface-2); color: var(--text-faint); }

    /* A person is a face and a name. Printing a Telegram id under every row is
       what made the tables look like a database export. */
    .person { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .ava {
      width: 30px; height: 30px; border-radius: 50%; flex: none; object-fit: cover;
      background: var(--surface-2); display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 650; color: #a8bde0; letter-spacing: .02em;
      border: 1px solid var(--line);
    }
    .ava-lg { width: 52px; height: 52px; font-size: 18px; border-radius: 16px; }
    .person-text { min-width: 0; }
    .person-name { font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .person-sub { font-size: 11.5px; color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    a.person:hover .person-name { color: var(--accent); }

    .metric { display: flex; flex-direction: column; gap: 3px; }
    .metric-value { font-size: 40px; font-weight: 660; letter-spacing: -.03em; line-height: 1.05; }
    .metric-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
    .delta { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 600; padding: 1px 7px; border-radius: 999px; }
    .delta-up { background: var(--ok-bg); color: var(--ok-fg); }
    .delta-down { background: var(--danger-bg); color: var(--danger-fg); }
    .delta-flat { background: var(--surface-2); color: var(--text-faint); }

    /* Horizontal bars read better than a donut for four categories, and they
       carry their own labels and numbers. */
    .bars { display: flex; flex-direction: column; gap: 9px; }
    .bar-row { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; align-items: center; }
    .bar-name { font-size: 12.5px; }
    .bar-val { font-size: 12.5px; font-weight: 600; }
    .bar-track { grid-column: 1 / -1; height: 5px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
    .bar-fill { display: block; height: 100%; border-radius: 999px; background: var(--accent); }

    .link { color: var(--accent); font-weight: 550; }
    .link:hover { text-decoration: underline; }

    .foot-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 14px; border-top: 1px solid var(--line-soft); font-size: 12px; color: var(--text-faint); }
    .foot-actions { display: flex; gap: 6px; }

    .blank { padding: 42px 20px; text-align: center; color: var(--text-faint); }
    .blank strong { display: block; color: var(--text-dim); font-size: 13px; margin-bottom: 4px; font-weight: 600; }

    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; justify-content: space-between; margin-bottom: 14px; }
    .toolbar-group { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }

    @media (max-width: 1000px) {
      .app { grid-template-columns: 1fr; }
      .rail { position: static; height: auto; flex-direction: row; align-items: center; overflow-x: auto; }
      .brand { border-bottom: none; border-right: 1px solid var(--line); }
      .rail-nav { flex-direction: row; padding: 8px; }
      .rail-label { display: none; }
      .rail-foot { margin: 0; border-top: none; border-left: 1px solid var(--line); }
      table.tbl-sticky thead th { top: 0; }
    }
  `;
}

function renderRail(active) {
  const links = NAV.map(
    (item) =>
      `<a class="rail-link${item.id === active ? " is-active" : ""}" href="${item.href}">${icon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`,
  ).join("");

  return `<aside class="rail">
    <div class="brand"><div class="brand-mark"></div><div class="brand-name">RollerBot</div></div>
    <nav class="rail-nav">
      <div class="rail-label">Аналитика</div>
      ${links}
    </nav>
    <div class="rail-foot">
      <form method="post" action="/admin/logout"><button type="submit">${icon("logout")}<span>Выйти</span></button></form>
    </div>
  </aside>`;
}

// title/subtitle sit in the header, tools go to its right, body fills the page.
function renderShell({
  title,
  subtitle = "",
  active = "stats",
  tools = "",
  body = "",
  styles = "",
  scripts = "",
  flush = false,
  pageTitle = "",
}) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle || title)} — RollerBot Admin</title>
  <style>${baseStyles()}${styles}</style>
</head>
<body>
  <div class="app">
    ${renderRail(active)}
    <div class="main">
      <header class="head">
        <div class="head-title">
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<span class="head-sub">${escapeHtml(subtitle)}</span>` : ""}
        </div>
        <div class="head-tools">${tools}</div>
      </header>
      <div class="content${flush ? " content-flush" : ""}">${body}</div>
    </div>
  </div>
  ${scripts}
</body>
</html>`;
}

function avatar(identity, large = false) {
  const cls = `ava${large ? " ava-lg" : ""}`;
  if (identity.avatarUrl) {
    return `<img class="${cls}" src="${identity.avatarUrl}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls}',textContent:'${escapeHtml(identity.initials)}'}))" />`;
  }
  return `<div class="${cls}">${escapeHtml(identity.initials)}</div>`;
}

function person(identity, { href = "", sub = "" } = {}) {
  const inner = `${avatar(identity)}<div class="person-text">
    <div class="person-name">${escapeHtml(identity.title)}</div>
    ${sub || identity.handle ? `<div class="person-sub">${escapeHtml(sub || identity.handle)}</div>` : ""}
  </div>`;
  return href ? `<a class="person" href="${href}">${inner}</a>` : `<div class="person">${inner}</div>`;
}

function delta(value) {
  if (!value) {
    return "";
  }
  const sign = value.direction === "up" ? "↑" : value.direction === "down" ? "↓" : "→";
  return `<span class="delta delta-${value.direction}">${sign} ${Math.abs(value.percent)}%</span>`;
}

function bars(items) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return `<div class="bars">${items
    .map(
      (item) => `<div class="bar-row">
        <span class="bar-name">${escapeHtml(item.label)}</span>
        <span class="bar-val">${escapeHtml(String(item.display ?? item.value))}</span>
        <span class="bar-track"><i class="bar-fill" style="width:${Math.round((item.value / max) * 100)}%${item.color ? `;background:${item.color}` : ""}"></i></span>
      </div>`,
    )
    .join("")}</div>`;
}

function kpi({ label, value, note = "", lead = false, share = null }) {
  const bar =
    share === null
      ? ""
      : `<div class="kpi-bar"><i style="width:${Math.max(0, Math.min(100, share))}%"></i></div>`;
  return `<div class="kpi${lead ? " kpi-lead" : ""}">
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value">${escapeHtml(String(value))}</div>
    ${note ? `<div class="kpi-note">${note}</div>` : ""}
    ${bar}
  </div>`;
}

function card({ title = "", subtitle = "", tools = "", body = "", tight = false, flush = false }) {
  const head =
    title || tools
      ? `<div class="card-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div><div>${tools}</div></div>`
      : "";
  const inner = flush ? body : `<div class="card-body${tight ? " card-body-tight" : ""}">${body}</div>`;
  return `<section class="card">${head}${inner}</section>`;
}

function blank(headline, hint = "") {
  return `<div class="blank"><strong>${escapeHtml(headline)}</strong>${hint ? escapeHtml(hint) : ""}</div>`;
}

function segmented(items) {
  return `<div class="seg">${items
    .map(
      (item) =>
        `<a class="${item.active ? "is-active" : ""}" href="${item.href}">${escapeHtml(item.label)}${
          item.count === undefined ? "" : `<span class="seg-count">${item.count}</span>`
        }</a>`,
    )
    .join("")}</div>`;
}

module.exports = {
  escapeHtml,
  icon,
  baseStyles,
  renderShell,
  kpi,
  avatar,
  person,
  delta,
  bars,
  card,
  blank,
  segmented,
  NAV,
};
