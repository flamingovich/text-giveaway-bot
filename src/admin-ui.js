// The admin, drawn in the language of the bot's mini apps and of gz-planner:
// the system typeface and palette of iOS, glass cards on a soft glow, large
// titles, springy motion, light and dark. Everything a page needs to look like
// that lives here; the pages only arrange it.

const { adminChartsScript, chartStyles } = require("./admin-charts");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Line glyphs in the manner of SF Symbols: one weight, round ends.
const ICONS = {
  stats: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  funnel: '<path d="M3.5 5h17l-6.5 7.6V19l-4 2v-8.4z"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17.5" cy="9.5" r="2.6"/><path d="M16.2 14.4A4.8 4.8 0 0 1 21.5 19"/>',
  projects: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  referrals: '<path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3 7h18v4H3z"/><path d="M12 7v14"/><path d="M12 7c-1.5-3.5-5.5-3.5-5.5-1S9 7 12 7c3 0 5.5-.5 5.5-2s-4-2.5-5.5 2"/>',
  support: '<path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
  system: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.3"/><circle cx="8" cy="17" r="2.3"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16.5 15h.01"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M12 8.5v4M12 15.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  flag: '<path d="M5 21V4.5M5 4.5h11l-2 4 2 4H5"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M18 13l-6 6-6-6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gift: '<path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3 7h18v4H3z"/><path d="M12 7v14"/><path d="M12 7c-1.5-3.5-5.5-3.5-5.5-1S9 7 12 7c3 0 5.5-.5 5.5-2s-4-2.5-5.5 2"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12L17 12h4"/>',
};

function icon(name, className = "") {
  const path = ICONS[name];
  if (!path) {
    return "";
  }
  return `<svg class="ic${className ? ` ${className}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// iOS Settings: every section has a glyph on a tile of its own colour.
const NAV_GROUPS = [
  {
    label: "Аналитика",
    items: [
      { id: "stats", href: "/admin/dashboard", label: "Статистика", icon: "stats", tone: "blue" },
      { id: "funnel", href: "/admin/funnel", label: "Воронка", icon: "funnel", tone: "indigo" },
      { id: "projects", href: "/admin/projects", label: "Проекты", icon: "projects", tone: "orange" },
      { id: "referrals", href: "/admin/referrals", label: "Приглашения", icon: "gift", tone: "pink" },
    ],
  },
  {
    label: "Люди",
    items: [
      { id: "users", href: "/admin/users", label: "Пользователи", icon: "users", tone: "green" },
      { id: "links", href: "/admin/links", label: "Связи", icon: "link", tone: "purple" },
      { id: "support", href: "/admin/support", label: "Поддержка", icon: "support", tone: "teal" },
    ],
  },
  {
    label: "Сервис",
    items: [{ id: "system", href: "/admin/system", label: "Система", icon: "system", tone: "gray" }],
  },
];
const NAV = NAV_GROUPS.flatMap((group) => group.items);

const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />`;

// The saved choice is applied before the first paint, or a dark page would
// flash white on every navigation.
const THEME_BOOT = `<script>(function(){try{var t=localStorage.getItem("rb-admin-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>`;

const DARK_TOKENS = `
    --blue: #0A84FF; --green: #30D158; --red: #FF453A; --orange: #FF9F0A; --yellow: #FFD60A;
    --teal: #40C8E0; --indigo: #5E5CE6; --purple: #BF5AF2; --pink: #FF375F; --mint: #63E6E2; --gray: #98989D;
    --bg: #000000;
    --bg-elevated: #1C1C1E;
    --fill: rgba(120,120,128,.24);
    --fill-strong: rgba(120,120,128,.36);
    --label: #FFFFFF;
    --label-2: rgba(235,235,245,.6);
    --label-3: rgba(235,235,245,.3);
    --separator: rgba(84,84,88,.6);
    --glass-bg: rgba(28,28,30,.72);
    --glass-brd: rgba(255,255,255,.09);
    --glass-shadow: 0 1px 1px rgba(0,0,0,.3), 0 12px 34px rgba(0,0,0,.45);
    --glass-rim: rgba(255,255,255,.14);
    --sidebar-bg: rgba(22,22,24,.62);
    --page-glow:
      radial-gradient(60rem 40rem at -10% -20%, color-mix(in oklab, var(--blue) 22%, transparent), transparent 60%),
      radial-gradient(50rem 36rem at 110% -10%, color-mix(in oklab, var(--indigo) 18%, transparent), transparent 60%);
    color-scheme: dark;`;

function baseStyles() {
  return `
:root {
  --blue: #007AFF; --green: #34C759; --red: #FF3B30; --orange: #FF9500; --yellow: #FFCC00;
  --teal: #30B0C7; --indigo: #5856D6; --purple: #AF52DE; --pink: #FF2D55; --mint: #00C7BE; --gray: #8E8E93;
  --tint: var(--blue);
  --bg: #F2F2F7;
  --bg-elevated: #FFFFFF;
  --fill: rgba(120,120,128,.12);
  --fill-strong: rgba(120,120,128,.2);
  --label: #000000;
  --label-2: rgba(60,60,67,.6);
  --label-3: rgba(60,60,67,.3);
  --separator: rgba(60,60,67,.16);
  --glass-bg: rgba(255,255,255,.74);
  --glass-brd: rgba(255,255,255,.7);
  --glass-shadow: 0 1px 1px rgba(0,0,0,.03), 0 10px 30px rgba(0,0,0,.06);
  --glass-rim: rgba(255,255,255,.95);
  --sidebar-bg: rgba(255,255,255,.55);
  --blur: saturate(180%) blur(28px);
  --page-glow:
    radial-gradient(60rem 40rem at -10% -20%, color-mix(in oklab, var(--blue) 16%, transparent), transparent 60%),
    radial-gradient(50rem 36rem at 110% -10%, color-mix(in oklab, var(--indigo) 12%, transparent), transparent 60%);
  --r-card: 22px;
  --r-row: 14px;
  --r-ctl: 12px;
  --ease: cubic-bezier(.32,.72,0,1);
  --spring: cubic-bezier(.34,1.4,.64,1);
  --sidebar-w: 256px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${DARK_TOKENS}
  }
}
:root[data-theme="dark"] {${DARK_TOKENS}
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
html, body { margin: 0; min-height: 100%; }
body {
  background: var(--bg);
  color: var(--label);
  font: 15px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, "Segoe UI", Roboto, sans-serif;
  letter-spacing: -.01em;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
body::before {
  content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background-image: var(--page-glow);
}
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; color: inherit; letter-spacing: inherit; }
h1, h2, h3, p { margin: 0; }
.ic { width: 1em; height: 1em; flex: none; display: block; }
.tnum { font-variant-numeric: tabular-nums; }
.rounded-num { font-family: ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif; }
.hidden { display: none !important; }
::selection { background: color-mix(in oklab, var(--tint) 30%, transparent); }

@keyframes rise { from { opacity: 0; transform: translateY(10px); } }
@keyframes pop { from { opacity: 0; transform: scale(.96) translateY(8px); } }
@keyframes fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-delay: 0ms !important; transition-duration: .01ms !important; }
}

/* ── shell ───────────────────────────────────────────────────────────── */
.app { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); min-height: 100vh; }
.sidebar {
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  display: flex; flex-direction: column;
  padding: 18px 14px 14px;
  background: var(--sidebar-bg);
  -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
  border-right: .5px solid var(--separator);
  scrollbar-width: none;
}
.sidebar::-webkit-scrollbar { display: none; }
.brand { display: flex; align-items: center; gap: 11px; padding: 4px 8px 12px; }
.brand-mark {
  width: 40px; height: 40px; border-radius: 12px; flex: none; overflow: hidden; display: block;
  background: #038EF3;
  box-shadow: 0 6px 18px color-mix(in oklab, #038EF3 38%, transparent), inset 0 0 0 .5px rgba(255,255,255,.25);
}
.brand-mark img { width: 100%; height: 100%; display: block; object-fit: cover; }
.brand-name { font-size: 17px; font-weight: 700; letter-spacing: -.02em; line-height: 1.15; }
.brand-sub { font-size: 12.5px; color: var(--label-2); }
.nav-group { margin-top: 14px; }
.nav-label {
  padding: 0 10px 6px; font-size: 12px; font-weight: 600; color: var(--label-2);
  text-transform: uppercase; letter-spacing: .04em;
}
.nav-item {
  display: flex; align-items: center; gap: 11px;
  padding: 6px 10px; border-radius: 11px; margin-bottom: 1px;
  font-size: 15px; font-weight: 500; color: var(--label);
  transition: background .18s var(--ease), transform .3s var(--spring);
}
.nav-item:hover { background: var(--fill); }
.nav-item:active { transform: scale(.98); }
.nav-item.is-active { background: color-mix(in oklab, var(--tint) 14%, transparent); font-weight: 600; }
.nav-tile {
  width: 29px; height: 29px; border-radius: 8px; flex: none;
  display: grid; place-items: center; color: #fff; font-size: 17px;
  background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 60%), var(--tile, var(--gray));
  box-shadow: inset 0 .5px 0 rgba(255,255,255,.4), 0 1px 2px rgba(0,0,0,.1);
}
.nav-tile .ic { width: 17px; height: 17px; stroke-width: 2; }
.tone-blue { --tile: var(--blue); } .tone-indigo { --tile: var(--indigo); } .tone-orange { --tile: var(--orange); }
.tone-pink { --tile: var(--pink); } .tone-green { --tile: var(--green); } .tone-teal { --tile: var(--teal); }
.tone-gray { --tile: var(--gray); } .tone-purple { --tile: var(--purple); } .tone-red { --tile: var(--red); }
.sidebar-foot { margin-top: auto; padding-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.theme-switch {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px;
  border-radius: 10px; background: var(--fill);
}
.theme-switch button {
  height: 28px; border: 0; border-radius: 8px; background: none; color: var(--label-2);
  display: grid; place-items: center; cursor: pointer; font-size: 15px;
  transition: background .2s var(--ease), color .2s var(--ease), box-shadow .2s var(--ease);
}
.theme-switch button.is-active { background: var(--bg-elevated); color: var(--label); box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 0 0 .5px rgba(0,0,0,.04); }
.logout {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border: 0; border-radius: 11px; background: none; cursor: pointer;
  color: var(--label-2); font-size: 14.5px; font-weight: 500; text-align: left;
}
.logout:hover { background: var(--fill); color: var(--label); }
.logout .ic { font-size: 18px; }

.main { min-width: 0; }
.topbar {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: center;
  height: 52px; padding: 0 20px;
  background: color-mix(in oklab, var(--bg) 72%, transparent);
  -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
  border-bottom: .5px solid transparent;
  opacity: 0; pointer-events: none;
  transition: opacity .25s var(--ease), border-color .25s var(--ease);
}
.is-scrolled .topbar { opacity: 1; pointer-events: auto; border-bottom-color: var(--separator); }
.topbar-title { font-size: 16px; font-weight: 600; letter-spacing: -.02em; }
.page { max-width: 1360px; margin: -52px auto 0; padding: 34px 36px 64px; }
.page-head {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; flex-wrap: wrap;
  margin-bottom: 22px; animation: rise .5s var(--ease) both;
}
.page-kicker { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--label-2); font-size: 14px; }
.page-kicker a { display: inline-flex; align-items: center; gap: 3px; color: var(--tint); font-weight: 500; }
.page-kicker .ic { width: 16px; height: 16px; stroke-width: 2.3; }
.page-title { font-size: 34px; font-weight: 700; letter-spacing: -.03em; line-height: 1.08; }
.page-sub { margin-top: 6px; font-size: 15px; color: var(--label-2); }
.page-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.mobile-nav { display: none; }

@media (max-width: 960px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { display: none; }
  .mobile-nav {
    display: flex; gap: 8px; align-items: center;
    position: sticky; top: 0; z-index: 50; padding: 10px 14px;
    background: color-mix(in oklab, var(--bg) 78%, transparent);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
    border-bottom: .5px solid var(--separator);
    overflow-x: auto; scrollbar-width: none;
  }
  .mobile-nav::-webkit-scrollbar { display: none; }
  .mobile-nav .brand-mark { width: 32px; height: 32px; border-radius: 9px; }
  .mobile-nav a.m-item {
    flex: none; display: flex; align-items: center; gap: 7px;
    padding: 4px 12px 4px 4px; border-radius: 999px; font-size: 14px; font-weight: 500;
    background: var(--fill);
  }
  .mobile-nav a.m-item .nav-tile { width: 26px; height: 26px; border-radius: 999px; font-size: 14px; }
  .mobile-nav a.m-item .nav-tile .ic { width: 14px; height: 14px; }
  .mobile-nav a.m-item.is-active { background: color-mix(in oklab, var(--tint) 16%, transparent); font-weight: 600; }
  .topbar { display: none; }
  .page { margin-top: 0; padding: 22px 14px 48px; }
  .page-title { font-size: 28px; }
}

/* ── cards ───────────────────────────────────────────────────────────── */
.card {
  position: relative;
  border-radius: var(--r-card);
  background: var(--glass-bg);
  -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
  border: .5px solid var(--glass-brd);
  box-shadow: var(--glass-shadow);
  animation: rise .55s var(--ease) both;
  animation-delay: calc(var(--i, 0) * 45ms);
  min-width: 0;
}
.card::before {
  content: ""; position: absolute; inset: 0 18px auto; height: 1px; pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--glass-rim), transparent); opacity: .7;
}
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 18px 20px 0; }
.card-title { font-size: 17px; font-weight: 650; letter-spacing: -.02em; }
.card-sub { margin-top: 3px; font-size: 13px; color: var(--label-2); line-height: 1.35; }
.card-tools { display: flex; gap: 8px; align-items: center; flex: none; }
.card-body { padding: 16px 20px 20px; }
.card-body.flush { padding: 8px 0 4px; }
.card-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 12px 20px 14px; border-top: .5px solid var(--separator);
  font-size: 13.5px; color: var(--label-2);
}

.grid { display: grid; gap: 16px; }
.stack > * + * { margin-top: 16px; }
.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cols-2-1 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.cols-1-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
@media (max-width: 1180px) { .cols-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 960px) { .cols-2, .cols-2-1, .cols-1-2 { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) { .cols-4, .cols-3 { grid-template-columns: minmax(0, 1fr); } }

/* ── stat tiles ──────────────────────────────────────────────────────── */
.stat { padding: 16px 18px; display: flex; flex-direction: column; gap: 7px; overflow: hidden; }
.stat-top { display: flex; align-items: center; gap: 10px; }
.stat-icon {
  width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none;
  color: var(--tile, var(--tint)); background: color-mix(in oklab, var(--tile, var(--tint)) 15%, transparent); font-size: 17px;
}
.stat-icon .ic { width: 17px; height: 17px; stroke-width: 2; }
.stat-label { font-size: 13.5px; font-weight: 500; color: var(--label-2); }
.stat-value { font-size: 32px; font-weight: 700; letter-spacing: -.035em; line-height: 1.05; }
.stat-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stat-note { font-size: 13px; color: var(--label-2); }
.stat-with-ring { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.stat .spark { margin: 2px -18px -16px; width: calc(100% + 36px); }
a.stat { transition: transform .35s var(--spring); }
a.stat:hover { transform: translateY(-2px); }

.delta {
  display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px 2px 6px; border-radius: 999px;
  font-size: 12.5px; font-weight: 650;
}
.delta .ic { width: 13px; height: 13px; stroke-width: 2.6; }
.delta-up { color: var(--green); background: color-mix(in oklab, var(--green) 15%, transparent); }
.delta-down { color: var(--red); background: color-mix(in oklab, var(--red) 14%, transparent); }
.delta-flat { color: var(--label-2); background: var(--fill); }

/* ── chips, buttons, fields ──────────────────────────────────────────── */
.chip {
  display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border-radius: 999px;
  font-size: 12.5px; font-weight: 600; white-space: nowrap; letter-spacing: -.005em;
  color: var(--chip, var(--label-2)); background: color-mix(in oklab, var(--chip, var(--gray)) 14%, transparent);
}
.chip .ic { width: 13px; height: 13px; stroke-width: 2.2; }
.chip-green { --chip: var(--green); } .chip-orange { --chip: var(--orange); } .chip-red { --chip: var(--red); }
.chip-blue { --chip: var(--tint); } .chip-indigo { --chip: var(--indigo); } .chip-teal { --chip: var(--teal); }
.chip-pink { --chip: var(--pink); } .chip-purple { --chip: var(--purple); }
.chip-muted { color: var(--label-2); background: var(--fill); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 36px; padding: 0 16px; border: 0; border-radius: 999px; cursor: pointer; white-space: nowrap;
  font-size: 14.5px; font-weight: 600; color: var(--label);
  background: var(--fill);
  transition: transform .35s var(--spring), background .2s var(--ease), filter .2s var(--ease);
}
.btn:hover { background: var(--fill-strong); }
.btn:active { transform: scale(.96); }
.btn .ic { width: 16px; height: 16px; stroke-width: 2.1; }
.btn-primary {
  color: #fff;
  background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 60%), var(--tint);
  box-shadow: inset 0 .5px 0 rgba(255,255,255,.45), 0 6px 16px color-mix(in oklab, var(--tint) 32%, transparent);
}
.btn-primary:hover { background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 60%), var(--tint); filter: brightness(1.04); }
.btn-danger { color: var(--red); background: color-mix(in oklab, var(--red) 13%, transparent); }
.btn-danger:hover { background: color-mix(in oklab, var(--red) 20%, transparent); }
.btn-plain { background: none; color: var(--tint); padding: 0 10px; }
.btn-plain:hover { background: color-mix(in oklab, var(--tint) 10%, transparent); }
.btn-icon { width: 36px; padding: 0; }

.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field-label { font-size: 12.5px; font-weight: 500; color: var(--label-2); padding-left: 4px; }
.input, .select {
  height: 38px; width: 100%; padding: 0 12px; border: 0; border-radius: var(--r-ctl);
  background: var(--fill); color: var(--label); font-size: 14.5px;
  outline: none; transition: box-shadow .2s var(--ease), background .2s var(--ease);
}
.input::placeholder { color: var(--label-3); }
.input:focus, .select:focus { box-shadow: 0 0 0 3.5px color-mix(in oklab, var(--tint) 32%, transparent); background: var(--bg-elevated); }
.select {
  appearance: none; -webkit-appearance: none; padding-right: 34px; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238E8E93' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 10l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; background-size: 16px;
}
.search { position: relative; }
.search .ic { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); width: 17px; height: 17px; color: var(--label-2); pointer-events: none; }
.search .input { padding-left: 36px; }
textarea.input { height: auto; min-height: 84px; padding: 11px 13px; line-height: 1.45; resize: vertical; }

.segmented {
  display: inline-grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 2px;
  border-radius: 11px; background: var(--fill);
}
.segmented a, .segmented button {
  display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 14px; border: 0; border-radius: 9px; background: none; cursor: pointer;
  font-size: 13.5px; font-weight: 500; color: var(--label); white-space: nowrap;
  transition: background .2s var(--ease), box-shadow .2s var(--ease);
}
.segmented a:hover:not(.is-active), .segmented button:hover:not(.is-active) { background: var(--fill); }
.segmented .is-active { background: var(--bg-elevated); font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,.12), 0 0 0 .5px rgba(0,0,0,.04); }
.seg-count { margin-left: 5px; color: var(--label-2); font-weight: 500; }

/* ── people ──────────────────────────────────────────────────────────── */
.person { display: flex; align-items: center; gap: 11px; min-width: 0; }
.ava {
  --size: 36px;
  width: var(--size); height: var(--size); border-radius: 50%; flex: none; object-fit: cover;
  display: grid; place-items: center;
  font-size: calc(var(--size) * .38); font-weight: 600; color: #fff; letter-spacing: 0;
  background: linear-gradient(180deg, var(--ava-a, #A1C4FD), var(--ava-b, #6A8DFF));
}
.ava-lg { --size: 80px; box-shadow: 0 10px 28px rgba(0,0,0,.14); }
.ava-sm { --size: 28px; }
.person-text { min-width: 0; }
.person-name { font-weight: 600; font-size: 15px; letter-spacing: -.015em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person-sub { font-size: 13px; color: var(--label-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
a.person:hover .person-name { color: var(--tint); }

/* ── lists and tables ────────────────────────────────────────────────── */
.table-wrap { overflow-x: auto; }
table.table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14.5px; }
.table thead th {
  padding: 10px 14px 9px; text-align: left; white-space: nowrap;
  font-size: 12px; font-weight: 600; color: var(--label-2); text-transform: uppercase; letter-spacing: .035em;
  border-bottom: .5px solid var(--separator);
}
.table thead th:first-child, .table tbody td:first-child { padding-left: 20px; }
.table thead th:last-child, .table tbody td:last-child { padding-right: 20px; }
.table thead th a { display: inline-flex; align-items: center; gap: 4px; }
.table thead th a:hover { color: var(--label); }
.table thead th .sort-on { color: var(--tint); }
.table tbody td { padding: 11px 14px; vertical-align: middle; border-bottom: .5px solid var(--separator); }
.table tbody tr:last-child td { border-bottom: 0; }
.table tbody tr { transition: background .15s var(--ease); }
.table tbody tr:hover { background: color-mix(in oklab, var(--fill) 55%, transparent); }
.table tbody tr[data-href] { cursor: pointer; }
.table .num { text-align: right; font-variant-numeric: tabular-nums; }
/* A sticky head sticks to its nearest scroll box, and a wrapper that scrolls
   sideways is one: the head then sat 52px down inside the table, over the
   first row. Wide screens drop the wrapper's scrolling; narrow ones keep it
   and give up the sticky head instead. */
.table-wrap.is-sticky { overflow: visible; }
.table.sticky thead th {
  position: sticky; top: 52px; z-index: 5;
  background: color-mix(in oklab, var(--bg-elevated) 88%, transparent);
  -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
}
@media (max-width: 1180px) {
  .table-wrap.is-sticky { overflow-x: auto; }
  .table.sticky thead th { position: static; }
}
.strong { font-weight: 600; }
.dim { color: var(--label-2); }
.faint { color: var(--label-3); }
.mono { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; letter-spacing: 0; }
.nowrap { white-space: nowrap; }
.ellip { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.rows { display: flex; flex-direction: column; }
.row {
  position: relative; display: flex; align-items: center; gap: 12px;
  min-height: 54px; padding: 9px 20px;
  transition: background .15s var(--ease);
}
.row + .row::before { content: ""; position: absolute; top: 0; left: var(--inset, 20px); right: 0; height: .5px; background: var(--separator); }
a.row:hover, button.row:hover { background: color-mix(in oklab, var(--fill) 55%, transparent); }
.row-main { flex: 1; min-width: 0; }
.row-title { font-size: 15px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-sub { font-size: 13px; color: var(--label-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The profile screenshot a person's ID was read from: a phone-shaped thumbnail, the whole picture on a tap. */
.shot-link { display: inline-block; margin-top: 8px; line-height: 0; }
.shot-link img { width: 72px; height: 128px; object-fit: cover; object-position: top; border-radius: 10px; border: .5px solid var(--separator); }
.row-value { flex: none; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
.row-value small { display: block; font-size: 12px; font-weight: 500; color: var(--label-2); }
.row-chevron { flex: none; width: 15px; height: 15px; color: var(--label-3); stroke-width: 2.4; }
.rank {
  width: 26px; height: 26px; border-radius: 50%; flex: none; display: grid; place-items: center;
  font-size: 12.5px; font-weight: 700; color: var(--label-2); background: var(--fill);
}
.rank-1 { color: #fff; background: linear-gradient(180deg, #FFD60A, #FF9F0A); }
.rank-2 { color: #fff; background: linear-gradient(180deg, #D1D1D6, #8E8E93); }
.rank-3 { color: #fff; background: linear-gradient(180deg, #E0A36B, #B36A2E); }

.blank { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 40px 24px; }
.blank-icon {
  width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; margin-bottom: 4px;
  color: var(--label-2); background: var(--fill); font-size: 26px;
}
.blank-icon .ic { width: 26px; height: 26px; }
.blank-title { font-size: 16px; font-weight: 600; }
.blank-hint { font-size: 13.5px; color: var(--label-2); max-width: 44ch; }

.pager { display: flex; align-items: center; gap: 8px; }
.note { font-size: 13px; color: var(--label-2); line-height: 1.45; }
.pre {
  margin: 0; padding: 14px 16px; border-radius: 14px; background: var(--fill);
  font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px; line-height: 1.6; color: var(--label); white-space: pre-wrap; word-break: break-word;
  max-height: 440px; overflow: auto;
}
.status-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--dot, var(--gray)); box-shadow: 0 0 0 3px color-mix(in oklab, var(--dot, var(--gray)) 22%, transparent); }
.status-dot.live { animation: live 2s ease-in-out infinite; }
@keyframes live { 50% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--dot, var(--gray)) 0%, transparent); } }
${chartStyles()}
`;
}

function renderSidebar(active) {
  const groups = NAV_GROUPS.map(
    (group) => `<div class="nav-group">
      <div class="nav-label">${escapeHtml(group.label)}</div>
      ${group.items
        .map(
          (item) =>
            `<a class="nav-item${item.id === active ? " is-active" : ""}" href="${item.href}"${item.id === active ? ' aria-current="page"' : ""}><span class="nav-tile tone-${item.tone}">${icon(item.icon)}</span><span>${escapeHtml(item.label)}</span></a>`,
        )
        .join("")}
    </div>`,
  ).join("");

  return `<aside class="sidebar">
    <a class="brand" href="/admin/dashboard">
      <span class="brand-mark"><img src="/assets/brand/rollerbot-mark.png" alt="" /></span>
      <span><span class="brand-name" style="display:block">RollerBot</span><span class="brand-sub">Админка</span></span>
    </a>
    ${groups}
    <div class="sidebar-foot">
      <div class="theme-switch" role="group" aria-label="Тема">
        <button type="button" data-theme-set="auto" title="Как в системе">${icon("auto")}</button>
        <button type="button" data-theme-set="light" title="Светлая">${icon("sun")}</button>
        <button type="button" data-theme-set="dark" title="Тёмная">${icon("moon")}</button>
      </div>
      <form method="post" action="/admin/logout"><button class="logout" type="submit">${icon("logout")}<span>Выйти</span></button></form>
    </div>
  </aside>`;
}

function renderMobileNav(active) {
  return `<nav class="mobile-nav">
    <a class="brand-mark" href="/admin/dashboard"><img src="/assets/brand/rollerbot-mark.png" alt="RollerBot" /></a>
    ${NAV.map(
      (item) =>
        `<a class="m-item${item.id === active ? " is-active" : ""}" href="${item.href}"><span class="nav-tile tone-${item.tone}">${icon(item.icon)}</span>${escapeHtml(item.label)}</a>`,
    ).join("")}
  </nav>`;
}

// What every page does on the client: the theme switch, the compact title that
// appears once the large one scrolls away, numbers that count up, rows that
// open on click and copy buttons.
function shellScript() {
  return `<script>
(function () {
  var root = document.documentElement;
  function applyTheme(mode) {
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode); else root.removeAttribute("data-theme");
    document.querySelectorAll("[data-theme-set]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.themeSet === (mode || "auto")); });
  }
  var saved = "auto";
  try { saved = localStorage.getItem("rb-admin-theme") || "auto"; } catch (e) {}
  applyTheme(saved);
  document.querySelectorAll("[data-theme-set]").forEach(function (b) {
    b.addEventListener("click", function () {
      var mode = b.dataset.themeSet;
      try { localStorage.setItem("rb-admin-theme", mode); } catch (e) {}
      applyTheme(mode);
    });
  });

  var head = document.querySelector(".page-head");
  if (head && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      document.body.classList.toggle("is-scrolled", !entries[0].isIntersecting);
    }, { rootMargin: "-52px 0px 0px 0px" }).observe(head);
  }

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-count]").forEach(function (el, index) {
    var target = Number(el.dataset.count);
    if (!isFinite(target) || reduce || target === 0) return;
    var decimals = Number(el.dataset.decimals || 0);
    var suffix = el.dataset.suffix || "";
    var f = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    var start = null, duration = 900 + Math.min(500, index * 40);
    el.textContent = f.format(0) + suffix;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = f.format(decimals ? target * eased : Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });

  document.querySelectorAll("tr[data-href]").forEach(function (row) {
    row.addEventListener("click", function (event) {
      if (event.target.closest("a, button, input, select, textarea")) return;
      if (event.metaKey || event.ctrlKey) { window.open(row.dataset.href, "_blank"); return; }
      location.href = row.dataset.href;
    });
  });

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.dataset.copy;
      var label = btn.querySelector("[data-copy-label]") || btn;
      var was = label.textContent;
      function done(t) { label.textContent = t; setTimeout(function () { label.textContent = was; }, 1400); }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { done("Скопировано"); }, function () { done(text); });
      else done(text);
    });
  });
})();
</script>`;
}

function documentHead(title, styles = "") {
  return `<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
  <title>${escapeHtml(title)} — RollerBot</title>
  <link rel="icon" type="image/png" href="/assets/brand/rollerbot-favicon.png" />
  ${THEME_BOOT}
  ${FONT_LINKS}
  <style>${baseStyles()}${styles}</style>`;
}

// title/subtitle head the page; tools sit to their right; kicker is the small
// line above the title (a way back, for instance). bare pages (support) lay
// out their own body under the sidebar.
function renderShell({
  title,
  subtitle = "",
  kicker = "",
  active = "stats",
  tools = "",
  body = "",
  styles = "",
  scripts = "",
  pageTitle = "",
  bare = false,
}) {
  return `<!doctype html>
<html lang="ru">
<head>
  ${documentHead(pageTitle || title, styles)}
</head>
<body>
  ${renderMobileNav(active)}
  <div class="app">
    ${renderSidebar(active)}
    <main class="main">
      ${
        bare
          ? body
          : `<div class="topbar"><span class="topbar-title">${escapeHtml(title)}</span></div>
      <div class="page">
        <header class="page-head">
          <div>
            ${kicker ? `<div class="page-kicker">${kicker}</div>` : ""}
            <h1 class="page-title">${escapeHtml(title)}</h1>
            ${subtitle ? `<p class="page-sub">${escapeHtml(subtitle)}</p>` : ""}
          </div>
          ${tools ? `<div class="page-tools">${tools}</div>` : ""}
        </header>
        ${body}
      </div>`
      }
    </main>
  </div>
  ${shellScript()}
  ${adminChartsScript()}
  ${scripts}
</body>
</html>`;
}

// ── components ─────────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  ["#FF9A8B", "#FF6A88"], ["#A1C4FD", "#6A8DFF"], ["#84FAB0", "#34C759"], ["#FBC2EB", "#A18CD1"],
  ["#FFD194", "#FF9F0A"], ["#8EC5FC", "#30B0C7"], ["#F6D365", "#FDA085"], ["#C2E9FB", "#5E5CE6"],
];

// A face for someone without a photo: their initials on a gradient that is
// always the same for the same person.
function avatarStyle(seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return `--ava-a:${a};--ava-b:${b}`;
}

function avatar(identity, size = "") {
  const cls = `ava${size === "lg" || size === true ? " ava-lg" : size === "sm" ? " ava-sm" : ""}`;
  const style = avatarStyle(identity.userId || identity.title);
  const initials = escapeHtml(identity.initials || "?");
  if (identity.avatarUrl) {
    return `<img class="${cls}" style="${style}" src="${escapeHtml(identity.avatarUrl)}" alt="" loading="lazy" data-initials="${initials}" onerror="var d=document.createElement('div');d.className=this.className;d.style.cssText=this.style.cssText;d.textContent=this.dataset.initials;this.replaceWith(d)" />`;
  }
  return `<div class="${cls}" style="${style}">${initials}</div>`;
}

function person(identity, { href = "", sub = "", size = "" } = {}) {
  const subline = sub || identity.handle;
  const inner = `${avatar(identity, size)}<div class="person-text">
    <div class="person-name">${escapeHtml(identity.title)}</div>
    ${subline ? `<div class="person-sub">${escapeHtml(subline)}</div>` : ""}
  </div>`;
  return href ? `<a class="person" href="${escapeHtml(href)}">${inner}</a>` : `<div class="person">${inner}</div>`;
}

function delta(value) {
  if (!value || !Number.isFinite(Number(value.percent))) {
    return "";
  }
  const glyph = value.direction === "up" ? icon("arrowUp") : value.direction === "down" ? icon("arrowDown") : "";
  return `<span class="delta delta-${value.direction}">${glyph}${Math.abs(value.percent)}%</span>`;
}

// A number that counts up on load; text is what the server prints, which is
// also what stays when motion is off.
function countUp(value, text = null, { decimals = 0, suffix = "" } = {}) {
  const number = Number(value);
  const shown = text ?? (Number.isFinite(number) ? number.toLocaleString("ru-RU") + suffix : "—");
  if (!Number.isFinite(number)) {
    return escapeHtml(shown);
  }
  return `<span class="tnum" data-count="${number}"${decimals ? ` data-decimals="${decimals}"` : ""}${suffix ? ` data-suffix="${escapeHtml(suffix)}"` : ""}>${escapeHtml(shown)}</span>`;
}

// A figure on a card: label, value (a number counts up; text is shown as is),
// note (html), delta, a glyph in the corner, extra html under it (a sparkline)
// and an optional ring beside the number.
function stat({ label, value, text = null, note = "", deltaValue = null, iconName = "", tone = "blue", extra = "", ring = "", href = "", i = 0 }) {
  const shown = typeof value === "number" ? countUp(value, text) : escapeHtml(text ?? value ?? "—");
  const head = `<div class="stat-top">${iconName ? `<span class="stat-icon" style="--tile: var(--${tone})">${icon(iconName)}</span>` : ""}<span class="stat-label">${escapeHtml(label)}</span></div>`;
  const long = typeof value !== "number" && String(text ?? value ?? "").length > 9;
  const main = `<div class="stat-row"><span class="stat-value rounded-num${long ? " is-long" : ""}">${shown}</span>${delta(deltaValue)}</div>${note ? `<div class="stat-note">${note}</div>` : ""}`;
  const content = ring ? `${head}<div class="stat-with-ring"><div>${main}</div>${ring}</div>` : `${head}${main}`;
  const tag = href ? "a" : "div";
  return `<${tag} class="card stat" style="--i:${i}"${href ? ` href="${escapeHtml(href)}"` : ""}>${content}${extra}</${tag}>`;
}

function card({ title = "", subtitle = "", tools = "", body = "", flush = false, foot = "", className = "", i = 0, id = "" }) {
  const head =
    title || tools
      ? `<div class="card-head"><div>${title ? `<h2 class="card-title">${escapeHtml(title)}</h2>` : ""}${subtitle ? `<p class="card-sub">${escapeHtml(subtitle)}</p>` : ""}</div>${tools ? `<div class="card-tools">${tools}</div>` : ""}</div>`
      : "";
  return `<section class="card${className ? ` ${className}` : ""}"${id ? ` id="${escapeHtml(id)}"` : ""} style="--i:${i}">${head}<div class="card-body${flush ? " flush" : ""}">${body}</div>${foot ? `<div class="card-foot">${foot}</div>` : ""}</section>`;
}

function chip(label, tone = "muted", iconName = "") {
  return `<span class="chip chip-${tone}">${iconName ? icon(iconName) : ""}${escapeHtml(label)}</span>`;
}

function blank(headline, hint = "", iconName = "sparkles") {
  return `<div class="blank"><div class="blank-icon">${icon(iconName)}</div><div class="blank-title">${escapeHtml(headline)}</div>${hint ? `<div class="blank-hint">${escapeHtml(hint)}</div>` : ""}</div>`;
}

function segmented(items) {
  return `<div class="segmented">${items
    .map(
      (item) =>
        `<a class="${item.active ? "is-active" : ""}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}${
          item.count === undefined ? "" : `<span class="seg-count">${item.count}</span>`
        }</a>`,
    )
    .join("")}</div>`;
}

function button({ label = "", href = "", kind = "", iconName = "", attrs = "", type = "button" }) {
  const cls = `btn${kind ? ` btn-${kind}` : ""}`;
  const inner = `${iconName ? icon(iconName) : ""}${label ? `<span>${escapeHtml(label)}</span>` : ""}`;
  return href
    ? `<a class="${cls}" href="${escapeHtml(href)}" ${attrs}>${inner}</a>`
    : `<button class="${cls}" type="${type}" ${attrs}>${inner}</button>`;
}

// columns: [{ label, num, sortHref, sortActive, sortDir }]; rows: strings of
// <td>s, or { cells, href } for a row that opens a page.
function table({ columns, rows, sticky = false }) {
  const head = columns
    .map((column) => {
      const cls = column.num ? ' class="num"' : "";
      if (column.html) {
        return `<th${cls}>${column.html}</th>`;
      }
      if (column.sortHref) {
        const arrow = column.sortActive ? `<span class="sort-on">${column.sortDir === "asc" ? "↑" : "↓"}</span>` : "";
        return `<th${cls}><a href="${escapeHtml(column.sortHref)}">${escapeHtml(column.label)}${arrow}</a></th>`;
      }
      return `<th${cls}>${escapeHtml(column.label)}</th>`;
    })
    .join("");
  const body = rows
    .map((row) =>
      typeof row === "string" ? `<tr>${row}</tr>` : `<tr${row.href ? ` data-href="${escapeHtml(row.href)}"` : ""}>${row.cells}</tr>`,
    )
    .join("");
  return `<div class="table-wrap${sticky ? " is-sticky" : ""}"><table class="table${sticky ? " sticky" : ""}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

module.exports = {
  escapeHtml,
  icon,
  baseStyles,
  documentHead,
  renderShell,
  NAV,
  avatar,
  avatarStyle,
  person,
  delta,
  countUp,
  stat,
  card,
  chip,
  blank,
  segmented,
  button,
  table,
};
