// The rollerbot.pro landing page - the "Классика" take the owner chose, drawn
// the way Apple presents a product: large quiet type, sections that alternate
// white and #F5F5F7, and the product itself instead of stock icons. The
// product here is Telegram: a real-looking iPhone with the channel post, the
// join mini app and the win notification, and small pieces of the same UI in
// the sections below. The organiser's panel and the admin never appear.
//
// Colours follow the mini app: iOS blue in the light, Telegram Night in the
// dark. Motion eases out, without overshoot, and plays once when a thing comes
// into view - except the phone in the hero, which the owner asked to run round
// and round. It only runs while it is on screen and the tab is open.

const { PANEL_ICONS } = require("./panel-look");

const SUPPORT_URL = "https://t.me/rollerbot_support_bot";

const BRANDS = [
  { slug: "pokerdom", name: "Pokerdom" },
  { slug: "beef", name: "BEEF" },
  { slug: "fugu", name: "FUGU" },
  { slug: "iris", name: "IRIS" },
  { slug: "luckybear", name: "LuckyBear" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SVG = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  signal: '<svg viewBox="0 0 18 12" fill="currentColor" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>',
  wifi: '<svg viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 11.6l2.4-2.7a3.4 3.4 0 0 0-4.8 0z"/><path d="M8 5.3c1.9 0 3.6.7 4.9 1.9l1.4-1.6A9 9 0 0 0 8 3.2 9 9 0 0 0 1.7 5.6l1.4 1.6A7 7 0 0 1 8 5.3z"/><path d="M8 .9c2.9 0 5.6 1.1 7.6 3l-1.1 1.2A9.9 9.9 0 0 0 8 2.5c-2.5 0-4.8.9-6.5 2.6L.4 3.9A11 11 0 0 1 8 .9z"/></svg>',
  battery: '<svg viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" opacity=".38"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="currentColor"/><path d="M25 4.4v4.2a2.3 2.3 0 0 0 0-4.2z" fill="currentColor" opacity=".4"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
};

// ---- look ---------------------------------------------------------------------

const STYLES = `
:root {
  --page: #ffffff; --alt: #f5f5f7; --tile: #ffffff; --tile-2: #f5f5f7;
  --ink: #1d1d1f; --ink-2: #6e6e73; --ink-3: #86868b; --line: #d2d2d7; --line-soft: rgba(0,0,0,.08);
  --accent: #0071e3; --accent-hover: #0077ed; --accent-ink: #0066cc; --on-accent: #ffffff;
  --green: #34c759; --red: #ff3b30; --orange: #ff9500; --indigo: #5856d6; --purple: #af52de; --pink: #ff2d55;
  --ease: cubic-bezier(.28,.11,.32,1); --ease-out: cubic-bezier(.22,.8,.24,1);
  --device-shadow: 0 70px 110px -50px rgba(0,0,0,.38), 0 30px 60px -34px rgba(0,0,0,.3);
  --titanium: linear-gradient(145deg, #e8e9eb 0%, #a9abae 20%, #d8d9db 46%, #9b9da0 74%, #d3d4d6 100%);
  /* Telegram for iOS, light */
  --tg-wall: linear-gradient(165deg, #bcd7ee 0%, #cfe2e1 42%, #dfe9cf 72%, #eceec6 100%);
  --tg-bar: rgba(248,248,248,.88); --tg-bubble: #ffffff; --tg-out: #effedd; --tg-ink: #000000; --tg-ink-2: #8e8e93;
  --tg-link: #007aff; --tg-btn: #3a93e6; --tg-react: rgba(0,122,255,.11); --tg-pill: rgba(34,58,48,.28);
  --tg-kb: rgba(52,82,76,.34);
  /* the mini app inside */
  --app-bg: #f2f2f7; --app-card: #ffffff; --app-fill: rgba(120,120,128,.12); --app-ink-2: rgba(60,60,67,.6); --app-ink-3: rgba(60,60,67,.3);
  --app-tint: #007aff; --app-sep: rgba(60,60,67,.14);
  --notif: rgba(246,246,246,.82);
  color-scheme: light;
}
html.app-theme-dark {
  --page: #0e1621; --alt: #121c28; --tile: #17212b; --tile-2: #17212b;
  --ink: #f5f5f5; --ink-2: #8d9cad; --ink-3: #6f7f90; --line: rgba(255,255,255,.12); --line-soft: rgba(255,255,255,.07);
  --accent: #2f6ea5; --accent-hover: #3779b3; --accent-ink: #6ab3f3; --on-accent: #ffffff;
  --green: #30d158; --red: #ff453a; --orange: #ff9f0a; --indigo: #5e5ce6; --purple: #bf5af2; --pink: #ff375f;
  --device-shadow: 0 70px 110px -50px rgba(0,0,0,.7), 0 30px 60px -34px rgba(0,0,0,.6);
  --titanium: linear-gradient(145deg, #55575b 0%, #2c2d30 22%, #45474b 48%, #242528 76%, #4a4c50 100%);
  --tg-wall: linear-gradient(165deg, #0f1a25 0%, #13202d 50%, #0e1621 100%);
  --tg-bar: rgba(23,33,43,.9); --tg-bubble: #182533; --tg-out: #2b5278; --tg-ink: #f5f5f5; --tg-ink-2: #7d8fa3;
  --tg-link: #6ab3f3; --tg-btn: #2f6ea5; --tg-react: rgba(106,179,243,.14); --tg-pill: rgba(12,20,29,.55);
  --tg-kb: rgba(40,60,82,.62);
  --app-bg: #0e1621; --app-card: #17212b; --app-fill: rgba(112,132,153,.16); --app-ink-2: #7d8fa3; --app-ink-3: rgba(125,143,163,.55);
  --app-tint: #2f6ea5; --app-sep: rgba(112,132,153,.2);
  --notif: rgba(38,42,48,.78);
  color-scheme: dark;
}

* { box-sizing: border-box; }
html { background: var(--page); -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body {
  margin: 0; background: var(--page); color: var(--ink);
  font: 17px/1.47 -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif;
  letter-spacing: -.022em; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;
  overflow-x: hidden;
}
a { color: var(--accent-ink); text-decoration: none; }
a:hover { text-decoration: underline; }
img { display: block; max-width: 100%; }
button { font: inherit; letter-spacing: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
h1, h2, h3, p { margin: 0; }

.wrap { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 22px; }
.sec { padding: clamp(96px, 12vw, 150px) 0; }
.sec-alt { background: var(--alt); }
.sec-head { max-width: 820px; margin: 0 auto clamp(48px, 6vw, 72px); text-align: center; }
.sec-head .lead { margin-top: 18px; }

.kicker { font-size: clamp(17px, 1.6vw, 21px); font-weight: 600; letter-spacing: -.012em; color: var(--ink-2); }
.h-hero { font-size: clamp(44px, 5vw, 64px); line-height: 1.05; font-weight: 600; letter-spacing: -.028em; }
.h-sec { font-size: clamp(34px, 4.5vw, 56px); line-height: 1.07; font-weight: 600; letter-spacing: -.025em; }
.h-tile { font-size: clamp(22px, 2.1vw, 28px); line-height: 1.15; font-weight: 600; letter-spacing: -.02em; }
.lead { font-size: clamp(19px, 1.75vw, 21px); line-height: 1.4; color: var(--ink-2); letter-spacing: -.012em; }
.muted { color: var(--ink-2); }

.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 22px; border-radius: 980px;
  background: var(--accent); color: var(--on-accent); font-size: 17px; font-weight: 400; letter-spacing: -.022em; white-space: nowrap;
  transition: background-color .2s var(--ease), transform .2s var(--ease); }
.btn:hover { background: var(--accent-hover); text-decoration: none; }
.btn:active { transform: scale(.98); }
.btn-sm { min-height: 28px; padding: 0 12px; font-size: 13px; }
.more { display: inline-flex; align-items: center; gap: 3px; color: var(--accent-ink); font-size: 17px; }
.more svg { width: 15px; height: 15px; margin-top: 1px; }

/* nav */
.nav { position: sticky; top: 0; z-index: 100; height: 52px; background: color-mix(in srgb, var(--page) 78%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid transparent; transition: border-color .3s var(--ease); }
.nav.is-stuck { border-bottom-color: var(--line-soft); }
.nav-in { height: 100%; display: flex; align-items: center; gap: 30px; }
.nav-logo { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); font-weight: 600; font-size: 17px; letter-spacing: -.02em; }
.nav-logo:hover { text-decoration: none; }
.nav-logo img { width: 26px; height: 26px; border-radius: 7px; }
.nav-links { display: flex; gap: 26px; }
.nav-links a { color: var(--ink); opacity: .78; font-size: 13px; letter-spacing: -.01em; transition: opacity .2s; }
.nav-links a:hover { opacity: 1; text-decoration: none; }
.nav-end { margin-left: auto; display: flex; align-items: center; gap: 14px; }
.theme { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--ink); opacity: .72; transition: opacity .2s, background-color .2s; }
.theme:hover { opacity: 1; background: var(--line-soft); }
.theme svg { width: 17px; height: 17px; }
.theme .i-moon { display: none; }
html.app-theme-dark .theme .i-sun { display: none; }
html.app-theme-dark .theme .i-moon { display: block; }
@media (max-width: 860px) { .nav-links { display: none; } }

/* motion */
.js .rv { opacity: 0; transform: translateY(26px); transition: opacity 1s var(--ease), transform 1.2s var(--ease); transition-delay: calc(var(--d, 0) * 1ms); }
.js .rv.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .js .rv { transform: none; transition: opacity .4s linear; } html { scroll-behavior: auto; } }

/* hero */
.hero { padding: clamp(40px, 6vw, 84px) 0 clamp(80px, 9vw, 120px); overflow: hidden; }
.hero-in { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: clamp(40px, 6vw, 96px); align-items: center; }
.hero-copy { max-width: 640px; }
.hero .kicker { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.hero .kicker img { width: 28px; height: 28px; border-radius: 8px; }
.hero .lead { margin-top: 24px; max-width: 540px; }
.hero-cta { margin-top: 34px; display: flex; align-items: center; flex-wrap: wrap; gap: 14px 28px; }
.hero-meta { margin-top: 34px; display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--ink-3); font-size: 14px; letter-spacing: -.01em; }
.hero-meta span { white-space: nowrap; }
.hero-meta span:not(:last-child)::after { content: "·"; margin-left: 16px; opacity: .8; }
.hero-stage { position: relative; display: grid; justify-items: center; gap: 18px; }
.js .hero-stage.rv { transform: translateY(40px) scale(.985); }
@media (max-width: 900px) {
  .hero-in { grid-template-columns: 1fr; text-align: center; }
  .hero-copy { max-width: none; justify-self: center; }
  .hero .kicker, .hero-cta, .hero-meta { justify-content: center; }
  .hero .lead { margin-left: auto; margin-right: auto; }
}

/* partners */
.partners { padding: 8px 0 clamp(90px, 10vw, 120px); text-align: center; }
.partners p { color: var(--ink-2); font-size: 17px; }
.partners b { color: var(--ink); font-weight: 600; }
.logos { margin-top: 30px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 18px clamp(24px, 4vw, 52px); }
.logo { position: relative; width: 108px; height: 52px; filter: grayscale(1); opacity: .55; transition: filter .4s var(--ease), opacity .4s var(--ease); }
.logo:hover { filter: none; opacity: 1; }
.logo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.logo .d { display: none; }
html.app-theme-dark .logo .l { display: none; }
html.app-theme-dark .logo .d { display: block; }
html.app-theme-dark .logo { opacity: .6; }
.logos-more { color: var(--ink-3); font-size: 15px; white-space: nowrap; }

/* steps carousel */
.car { display: grid; grid-auto-flow: column; grid-auto-columns: min(360px, 82vw); gap: 20px; overflow-x: auto; scroll-snap-type: x mandatory;
  padding: 4px max(22px, calc((100vw - 1120px) / 2 + 22px)) 8px; scroll-padding: 0 max(22px, calc((100vw - 1120px) / 2 + 22px)); scrollbar-width: none; }
.car::-webkit-scrollbar { display: none; }
.card { scroll-snap-align: start; background: var(--tile); border-radius: 28px; overflow: hidden; display: grid; grid-template-rows: auto 1fr; min-height: 540px; }
.card-copy { padding: 34px 32px 0; }
.card-n { display: block; font-size: 14px; font-weight: 600; color: var(--ink-3); margin-bottom: 10px; letter-spacing: -.01em; }
.card-copy p { margin-top: 12px; color: var(--ink-2); font-size: 17px; line-height: 1.45; }
.card-art { margin: 28px 20px 20px; border-radius: 20px; background: var(--tg-wall); padding: 16px 14px; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; min-height: 250px; overflow: hidden; }
.car-ctl { display: flex; justify-content: flex-end; gap: 12px; margin-top: 26px; }
.car-ctl button { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); opacity: .85; transition: background-color .2s, opacity .2s; }
.car-ctl button:hover { background: color-mix(in srgb, var(--ink) 14%, transparent); opacity: 1; }
.car-ctl button:disabled { opacity: .3; cursor: default; }
.car-ctl svg { width: 18px; height: 18px; }
.car-ctl button:first-child svg { transform: rotate(180deg); }

/* features */
.bento { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 20px; }
.tile { grid-column: span 2; background: var(--tile-2); border-radius: 28px; padding: 34px 32px 32px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
.tile p { color: var(--ink-2); font-size: 17px; line-height: 1.45; }
.tile-wide { grid-column: span 4; }
.tile-art { margin-top: auto; padding-top: 22px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
@media (max-width: 980px) { .bento { grid-template-columns: 1fr 1fr; } .tile, .tile-wide { grid-column: span 1; } .tile-wide { grid-column: 1 / -1; } }
@media (max-width: 640px) { .bento { grid-template-columns: 1fr; } .tile-wide { grid-column: auto; } }

.row { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 14px; background: var(--tile); font-size: 15px; }
.sec-alt .row, .row-on-tile { background: var(--tile); }
.row .av { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 600; font-size: 13px; flex: none; }
.row .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .nm small { display: block; color: var(--ink-3); font-size: 12.5px; }
.tag { flex: none; font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 980px; letter-spacing: -.005em; }
.tag-ok { color: var(--green); background: color-mix(in srgb, var(--green) 13%, transparent); }
.tag-no { color: var(--ink-2); background: color-mix(in srgb, var(--ink) 7%, transparent); }
.tag-bad { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }
.tag-warn { color: var(--orange); background: color-mix(in srgb, var(--orange) 14%, transparent); }
.js [data-play="flags"] .tag { opacity: 0; transform: scale(.85); transition: opacity .45s var(--ease), transform .6s var(--ease-out); }
.js [data-play="flags"].in .tag { opacity: 1; transform: none; }
${[1, 2, 3, 4].map((n) => `.js [data-play="flags"].in .row:nth-child(${n}) .tag { transition-delay: ${300 + n * 260}ms; }`).join("\n")}

.clock { font-size: clamp(44px, 5vw, 56px); font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; line-height: 1; transition: opacity .4s var(--ease), transform .5s var(--ease); }
.stage { position: relative; height: 64px; }
.stage > * { position: absolute; left: 0; top: 50%; transform: translateY(-50%); }
[data-play="results"].done .clock { opacity: 0; transform: translateY(-50%) scale(.92); }
.winners { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.winners i { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-style: normal; font-weight: 600; font-size: 15px; opacity: 0; transform: scale(.6); transition: opacity .4s var(--ease), transform .6s var(--ease-out); box-shadow: 0 0 0 3px var(--tile-2); }
.winners i + i { margin-left: -14px; }
.winners b { margin-left: 8px; font-weight: 600; font-size: 16px; opacity: 0; transition: opacity .5s var(--ease) .45s; }
[data-play="results"].done .winners i, [data-play="results"].done .winners b { opacity: 1; transform: none; }
[data-play="results"].done .winners i:nth-child(2) { transition-delay: .12s; }
[data-play="results"].done .winners i:nth-child(3) { transition-delay: .24s; }
.again { align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; color: var(--accent-ink); font-size: 15px; }
.again svg { width: 13px; height: 13px; }

.coin { width: 56px; height: 56px; }
.coin svg { width: 100%; height: 100%; }
.nets { display: grid; gap: 8px; }
.net { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 14px; background: var(--tile); font-size: 15px; font-weight: 500; }
.net svg { width: 24px; height: 24px; flex: none; }
.net span { margin-left: auto; color: var(--ink-3); font-size: 13px; font-weight: 400; }

/* pricing */
.price { max-width: 640px; margin: 0 auto; background: var(--tile); border-radius: 30px; padding: clamp(34px, 5vw, 52px); text-align: center; }
.price-top { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px 10px; }
.beta { display: inline-flex; align-items: center; white-space: nowrap; height: 26px; padding: 0 10px; border-radius: 980px; font-size: 13px; font-weight: 600; color: var(--orange); background: color-mix(in srgb, var(--orange) 13%, transparent); }
.sum { margin-top: 18px; display: flex; align-items: baseline; justify-content: center; gap: 10px; }
.sum b { font-size: clamp(64px, 9vw, 96px); line-height: 1; font-weight: 600; letter-spacing: -.045em; }
.sum span { font-size: 21px; color: var(--ink-2); }
.price .lead { margin-top: 16px; font-size: 17px; }
.incl { margin: 30px auto 0; padding: 26px 0 0; border-top: 1px solid var(--line-soft); list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 22px; text-align: left; max-width: 480px; }
.incl li { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; }
.incl svg { width: 16px; height: 16px; color: var(--green); flex: none; margin-top: 3px; }
@media (max-width: 560px) { .incl { grid-template-columns: 1fr; } }
.price-cta { margin-top: 34px; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 14px 28px; }

/* faq */
.faq { max-width: 820px; margin: 0 auto; border-top: 1px solid var(--line-soft); }
.faq details { border-bottom: 1px solid var(--line-soft); }
.faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 26px 0; font-size: clamp(19px, 1.8vw, 22px); font-weight: 600; letter-spacing: -.018em; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary svg { width: 22px; height: 22px; flex: none; color: var(--ink-2); transition: transform .4s var(--ease); }
.faq details[open] summary svg { transform: rotate(45deg); }
.faq p { padding: 0 48px 26px 0; color: var(--ink-2); font-size: 17px; line-height: 1.5; animation: faq .5s var(--ease); }
@keyframes faq { from { opacity: 0; transform: translateY(-6px); } }

/* footer */
.foot { background: var(--alt); padding: 26px 0 40px; font-size: 12px; color: var(--ink-2); letter-spacing: -.005em; }
.foot-in { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; border-top: 1px solid var(--line-soft); padding-top: 18px; }
.foot a { color: var(--ink-2); }
.foot a:hover { color: var(--ink); }
.foot .age { margin-left: auto; font-weight: 600; }
.foot-note { margin-bottom: 18px; line-height: 1.5; }
`;

// ---- the iPhone and Telegram in it --------------------------------------------

const DEVICE_STYLES = `
.iphone { --w: 316px; position: relative; text-align: left; width: var(--w); height: calc(var(--w) * 2.07); border-radius: calc(var(--w) * .18); padding: 3.5px;
  background: var(--titanium); box-shadow: var(--device-shadow), inset 0 0 0 .5px rgba(255,255,255,.35); flex: none; }
.iphone > i { position: absolute; width: 3px; border-radius: 2px; background: var(--titanium); }
.iphone > i:nth-child(1) { left: -2.5px; top: 19%; height: 5%; }
.iphone > i:nth-child(2) { left: -2.5px; top: 27%; height: 8.5%; }
.iphone > i:nth-child(3) { left: -2.5px; top: 37.5%; height: 8.5%; }
.iphone > i:nth-child(4) { right: -2.5px; top: 30%; height: 13%; }
.bezel { height: 100%; border-radius: calc(var(--w) * .17); background: #050505; padding: 8.5px; }
.screen { position: relative; height: 100%; border-radius: calc(var(--w) * .145); overflow: hidden; background: var(--tg-wall); isolation: isolate;
  font-size: 12.5px; line-height: 1.32; letter-spacing: -.012em; color: var(--tg-ink); user-select: none; -webkit-user-select: none; }
.island { position: absolute; top: 10px; left: 50%; width: 31%; height: 27px; transform: translateX(-50%); border-radius: 20px; background: #000; z-index: 80; }
.status { position: absolute; inset: 0 0 auto; height: 46px; padding: 16px 26px 0 30px; display: flex; justify-content: space-between; align-items: flex-start; z-index: 70; font-size: 14px; font-weight: 600; letter-spacing: -.01em; color: var(--tg-ink); }
.status span:last-child { display: flex; gap: 5px; align-items: center; margin-top: 2px; }
.status svg { height: 11px; width: auto; }
.status svg:last-child { height: 12px; }
.home { position: absolute; left: 50%; bottom: 7px; width: 36%; height: 4.5px; margin-left: -18%; border-radius: 3px; background: var(--tg-ink); opacity: .85; z-index: 75; }

.tg { position: absolute; inset: 0; display: flex; flex-direction: column; }
.tg-top { padding: 46px 12px 8px; display: grid; grid-template-columns: 70px 1fr 70px; align-items: center; background: var(--tg-bar);
  -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%); border-bottom: .5px solid rgba(0,0,0,.08); position: relative; z-index: 5; }
html.app-theme-dark .tg-top { border-bottom-color: rgba(0,0,0,.35); }
.tg-back { color: var(--tg-link); font-size: 14px; display: flex; align-items: center; gap: 1px; }
.tg-back b { font-size: 22px; font-weight: 400; line-height: .8; margin-top: -2px; }
.tg-title { text-align: center; line-height: 1.2; }
.tg-title b { display: block; font-size: 13.5px; font-weight: 600; }
.tg-title small { display: block; font-size: 10.5px; color: var(--tg-ink-2); }
.tg-ava { justify-self: end; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 600; font-size: 14px;
  background: linear-gradient(180deg, #72d5fd, #2a9ef1); overflow: hidden; }
.tg-ava img { width: 100%; height: 100%; object-fit: cover; }
.tg-feed { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; padding: 8px 8px 22px; overflow: hidden; }
.tg-date { align-self: center; padding: 2px 9px; border-radius: 980px; background: var(--tg-pill); color: #fff; font-size: 11px; font-weight: 500; margin-bottom: 4px; }

.post { position: relative; background: var(--tg-bubble); border-radius: 16px; overflow: hidden; box-shadow: 0 1px .5px rgba(0,0,0,.12); max-width: 100%; }
.post-img { height: 132px; position: relative; display: grid; place-items: center; overflow: hidden;
  background: radial-gradient(120% 90% at 20% 10%, #56c1ff 0%, transparent 55%), linear-gradient(140deg, #1f8cf0 0%, #0b5fd0 55%, #4a3fd1 100%); color: #fff; }
.post-img b { font-size: 50px; font-weight: 700; letter-spacing: -.05em; text-shadow: 0 10px 30px rgba(0,0,0,.25); }
.post-img small { position: absolute; left: 12px; top: 10px; font-size: 9.5px; font-weight: 700; letter-spacing: .12em; opacity: .9; }
.post-img em { position: absolute; right: 12px; bottom: 8px; font-style: normal; font-size: 24px; }
.post-body { padding: 8px 11px 2px; display: grid; gap: 1px; }
.post-body b { font-weight: 600; }
.post-body .cnt { color: var(--tg-ink-2); font-variant-numeric: tabular-nums; }
.post-btn { display: block; width: calc(100% - 18px); height: 34px; margin: 8px 9px 6px; border-radius: 9px; background: var(--tg-btn); color: #fff; font-size: 13px; font-weight: 600;
  transition: transform .25s var(--ease-out), filter .2s; }
.post-foot { display: flex; align-items: center; gap: 5px; padding: 0 10px 7px; }
.react { display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px; border-radius: 980px; background: var(--tg-react); color: var(--tg-link); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.meta { margin-left: auto; display: inline-flex; align-items: center; gap: 3px; color: var(--tg-ink-2); font-size: 10.5px; }
.meta svg { width: 11px; height: 11px; }
.pressed { transform: scale(.96); filter: brightness(.92); }

.bubble { max-width: 86%; padding: 7px 10px 6px; border-radius: 16px 16px 16px 5px; background: var(--tg-bubble); box-shadow: 0 1px .5px rgba(0,0,0,.12); font-size: 12.5px; line-height: 1.35; }
.bubble.me { align-self: flex-end; border-radius: 16px 16px 5px 16px; background: var(--tg-out); font-variant-numeric: tabular-nums; }
.bubble .t { display: block; text-align: right; font-size: 10px; color: var(--tg-ink-2); margin-top: 2px; }
.kb { display: grid; gap: 4px; max-width: 86%; margin-top: -2px; }
.kb span { height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--tg-kb); color: #fff; font-size: 12px; font-weight: 600;
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); transition: transform .25s var(--ease-out); }
/* The reminder's buttons live inside the post and are blue, as the bot sends them. */
.kb-post span { background: var(--tg-btn); -webkit-backdrop-filter: none; backdrop-filter: none; }
.js .in-seq > * { opacity: 0; transform: translateY(10px) scale(.98); transition: opacity .45s var(--ease), transform .6s var(--ease-out); }
.js .in-seq.in > * { opacity: 1; transform: none; }
${[1, 2, 3, 4, 5].map((n) => `.js .in-seq.in > :nth-child(${n}) { transition-delay: ${150 + (n - 1) * 420}ms; }`).join("\n")}

/* the mini app sheet */
.sheet { position: absolute; inset: 44px 0 0; z-index: 30; background: var(--app-bg); border-radius: 13px 13px 0 0; box-shadow: 0 -8px 30px rgba(0,0,0,.2);
  transform: translateY(104%); transition: transform .6s var(--ease-out); display: flex; flex-direction: column; }
.phone.app .sheet { transform: none; }
.sheet-top { display: grid; grid-template-columns: 70px 1fr 70px; align-items: center; padding: 10px 12px 8px; }
.sheet-top > span:first-child { color: var(--tg-link); font-size: 13.5px; }
.sheet-top b { text-align: center; font-size: 13.5px; font-weight: 600; }
.sheet-top > span:last-child { justify-self: end; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--app-fill); color: var(--app-ink-2); font-size: 12px; letter-spacing: 1px; }
.app-body { flex: 1; padding: 2px 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.a-card { background: var(--app-card); border-radius: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
html.app-theme-dark .a-card { box-shadow: 0 1px 1px rgba(0,0,0,.3); }
.steps { padding: 10px 6px 8px; display: grid; grid-template-columns: repeat(3, 1fr); position: relative; }
.steps::before, .steps i { content: ""; position: absolute; top: 20px; left: 17%; height: 2px; border-radius: 2px; }
.steps::before { right: 17%; background: var(--app-fill); }
.steps i { width: 0; background: var(--app-tint); transition: width .55s var(--ease); }
.phone[data-step="2"] .steps i { width: 33%; }
.phone[data-step="4"] .steps i { width: 66%; }
.dot { position: relative; z-index: 1; display: grid; justify-items: center; gap: 4px; font-size: 9.5px; color: var(--app-ink-2); }
.dot b { width: 21px; height: 21px; border-radius: 50%; display: grid; place-items: center; font-size: 10.5px; font-weight: 600; background: var(--app-card); box-shadow: inset 0 0 0 1.5px var(--app-fill); transition: background-color .3s, box-shadow .3s, color .3s; }
.dot b svg { width: 11px; height: 11px; display: none; color: #fff; }
.phone[data-step="1"] .dot:nth-child(2), .phone[data-step="2"] .dot:nth-child(3), .phone[data-step="4"] .dot:nth-child(4) { color: var(--tg-ink); font-weight: 600; }
.phone[data-step="1"] .dot:nth-child(2) b, .phone[data-step="2"] .dot:nth-child(3) b { box-shadow: inset 0 0 0 1.5px var(--app-tint); color: var(--app-tint); }
.phone[data-step="2"] .dot:nth-child(2) b, .phone[data-step="4"] .dot b { background: var(--app-tint); box-shadow: none; }
.phone[data-step="2"] .dot:nth-child(2) b svg, .phone[data-step="4"] .dot b svg { display: block; }
.phone[data-step="2"] .dot:nth-child(2) b em, .phone[data-step="4"] .dot b em { display: none; }
.dot b em { font-style: normal; }
html.app-theme-dark .phone[data-step="1"] .dot:nth-child(2) b, html.app-theme-dark .phone[data-step="2"] .dot:nth-child(3) b { color: #6ab3f3; }

.step { padding: 12px 12px 12px; display: none; gap: 10px; }
.step.on { display: grid; animation: step-in .55s var(--ease-out) both; }
@keyframes step-in { from { opacity: 0; transform: translateY(10px); } }
.step-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 9px; border-bottom: .5px solid var(--app-sep); }
.step-head small { display: block; font-size: 10.5px; color: var(--app-ink-2); }
.step-head b { display: block; font-size: 17px; font-weight: 600; letter-spacing: -.02em; }
.brand { position: relative; width: 58px; height: 29px; }
.brand img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.brand .d { display: none; }
html.app-theme-dark .brand .l { display: none; }
html.app-theme-dark .brand .d { display: block; }

.cap { display: flex; align-items: center; gap: 10px; padding: 11px 12px; border-radius: 11px; background: var(--app-fill); }
.cap-box { position: relative; width: 23px; height: 23px; border-radius: 6px; flex: none; box-shadow: inset 0 0 0 2px var(--app-ink-3); display: grid; place-items: center; transition: background-color .25s, box-shadow .25s; }
.cap-box svg { width: 14px; height: 14px; color: #fff; opacity: 0; transform: scale(.4); transition: opacity .25s, transform .45s var(--ease-out); }
.cap.loading .cap-box { box-shadow: none; }
.cap.loading .cap-box::after { content: ""; position: absolute; inset: 1px; border-radius: 50%; border: 2.5px solid var(--app-fill); border-top-color: var(--app-tint); animation: spin .7s linear infinite; }
.cap.ok .cap-box { background: var(--app-tint); box-shadow: none; }
.cap.ok .cap-box svg { opacity: 1; transform: none; }
.cap-label { flex: 1; font-size: 13.5px; }
.cap-logo { display: grid; justify-items: center; gap: 2px; font-size: 7px; color: var(--app-ink-2); font-weight: 600; }
.cap-logo i { width: 19px; height: 19px; border-radius: 50%; background: conic-gradient(#4285f4 0 33%, #34a853 0 66%, #ea4335 0); -webkit-mask: radial-gradient(circle, transparent 5px, #000 5.5px); mask: radial-gradient(circle, transparent 5px, #000 5.5px); }
@keyframes spin { to { transform: rotate(360deg); } }

.a-btn { height: 35px; border-radius: 980px; display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 13px; font-weight: 600; transition: transform .25s var(--ease-out), background-color .3s, color .3s; }
.a-btn svg { width: 12px; height: 12px; }
.a-fill { background: var(--app-tint); color: #fff; }
.a-gray { background: var(--app-fill); color: var(--tg-ink); }
.a-gray.ok { background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green); }
.a-gray svg { display: none; }
.a-gray.ok svg { display: block; }
.field { height: 37px; border-radius: 10px; background: var(--app-fill); display: flex; align-items: center; gap: 6px; padding: 0 12px; font-size: 13px; }
.field > span:first-child { color: var(--app-ink-3); font-weight: 700; }
.idv { font-variant-numeric: tabular-nums; }
.idv:empty::before { content: attr(data-ph); color: var(--app-ink-3); }
.caret { width: 1.5px; height: 15px; background: var(--app-tint); display: none; }
.phone.typing .caret { display: block; }
.hint { text-align: center; color: var(--tg-link); font-size: 11.5px; font-weight: 500; }

.done { justify-items: center; text-align: center; padding: 18px 12px 14px; }
.mark { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--green); box-shadow: 0 10px 24px color-mix(in srgb, var(--green) 32%, transparent); }
.mark svg { width: 30px; height: 30px; }
.mark svg path { stroke-dasharray: 30; stroke-dashoffset: 0; }
.step.on .mark { animation: pop .7s var(--ease-out) both .05s; }
.step.on .mark svg path { animation: draw .5s var(--ease) both .4s; }
@keyframes pop { from { opacity: 0; transform: scale(.4); } }
@keyframes draw { from { stroke-dashoffset: 30; } }
.done > b { font-size: 19px; font-weight: 600; letter-spacing: -.025em; }
.done > small { color: var(--app-ink-2); font-size: 11.5px; margin-top: -5px; }
.stats { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.stats span { background: var(--app-fill); border-radius: 10px; padding: 7px 4px 6px; display: grid; gap: 1px; }
.stats b { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stats small { font-size: 9.5px; color: var(--app-ink-2); }

/* the iOS notification that closes the story */
.notif { position: absolute; left: 7px; right: 7px; top: 48px; z-index: 90; display: flex; gap: 9px; padding: 10px 11px; border-radius: 18px; background: var(--notif);
  -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%); box-shadow: 0 10px 30px rgba(0,0,0,.18);
  transform: translateY(-160%); opacity: 0; transition: transform .7s var(--ease-out), opacity .4s var(--ease); }
.phone.notified .notif { transform: none; opacity: 1; }
.notif img { width: 34px; height: 34px; border-radius: 8px; flex: none; }
.notif div { flex: 1; min-width: 0; font-size: 12px; line-height: 1.3; }
.notif-top { display: flex; justify-content: space-between; color: var(--tg-ink-2); font-size: 10.5px; }
.notif-top b { color: var(--tg-ink); font-weight: 600; font-size: 12px; }
.notif p { color: var(--tg-ink); }

.tap { position: absolute; left: 0; top: 0; width: 38px; height: 38px; margin: -19px 0 0 -19px; border-radius: 50%; pointer-events: none; z-index: 95; opacity: 0;
  background: rgba(255,255,255,.55); box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.15); }
html.app-theme-dark .tap { background: rgba(255,255,255,.35); }
.tap.go { animation: tap .6s var(--ease); }
@keyframes tap { 0% { opacity: 0; transform: scale(.5); } 30% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.3); } }
@media (prefers-reduced-motion: reduce) { .sheet, .notif { transition: none; } .step.on, .step.on .mark, .step.on .mark svg path { animation: none; } }
`;

function brandImg(slug, name, className) {
  return `<span class="${className}" title="${escapeHtml(name)}"><img class="l" src="/assets/brand-logos/${slug}_light.png" alt="${escapeHtml(name)}" loading="lazy" /><img class="d" src="/assets/brand-logos/${slug}_dark.png" alt="" loading="lazy" /></span>`;
}

function renderIphone(inner, { className = "", attrs = "" } = {}) {
  return `<div class="iphone ${className}"${attrs}><i></i><i></i><i></i><i></i><div class="bezel"><div class="screen">
    <div class="island"></div>
    <div class="status"><span>9:41</span><span>${SVG.signal}${SVG.wifi}${SVG.battery}</span></div>
    ${inner}
    <div class="home"></div>
  </div></div></div>`;
}

function renderPost({ interactive = false, count = "1 198" } = {}) {
  return `<div class="post">
    <div class="post-img"><small>РОЗЫГРЫШ</small><b>100$</b><em>🎁</em></div>
    <div class="post-body"><b>🎁 РОЗЫГРЫШ НА 100$</b><span>Призовых мест: 3 · итоги через 2 дня</span><span class="cnt">Участвуют: <span data-count>${count}</span></span></div>
    <button type="button" class="post-btn"${interactive ? ' data-act="join"' : ""}>Участвую</button>
    <div class="post-foot"><span class="react">👍 128</span><span class="react">🔥 64</span><span class="react">🎉 31</span><span class="meta">${SVG.eye}3,2K · 12:00</span></div>
  </div>`;
}

function renderChannel({ interactive = false } = {}) {
  return `<div class="tg">
    <div class="tg-top"><span class="tg-back"><b>‹</b>Чаты</span><span class="tg-title"><b>Мой канал</b><small>12 480 подписчиков</small></span><span class="tg-ava">М</span></div>
    <div class="tg-feed"><span class="tg-date">Сегодня</span>${renderPost({ interactive })}</div>
  </div>`;
}

function renderSheet() {
  const check = SVG.check;
  return `<div class="sheet">
    <div class="sheet-top"><span>Закрыть</span><b>Участие</b><span>•••</span></div>
    <div class="app-body">
      <div class="a-card steps"><i></i>
        <span class="dot"><b><em>1</em>${check}</b>Проверка</span>
        <span class="dot"><b><em>2</em>${check}</b>Регистрация</span>
        <span class="dot"><b><em>3</em>${check}</b>Готово</span>
      </div>
      <div class="a-card step" data-step-card="captcha">
        <div class="step-head"><span><small>Шаг 1 из 2</small><b>Проверка</b></span></div>
        <div class="cap"><span class="cap-box">${check}</span><span class="cap-label">Я не робот</span><span class="cap-logo"><i></i>reCAPTCHA</span></div>
      </div>
      <div class="a-card step" data-step-card="reg">
        <div class="step-head"><span><small>Шаг 2 из 2</small><b>Регистрация</b></span>${brandImg("beef", "BEEF", "brand")}</div>
        <span class="a-btn a-fill" data-el="go">Перейти на BEEF ${SVG.arrow}</span>
        <div class="field"><span>#</span><span class="idv" data-ph="Введите свой ID с BEEF"></span><span class="caret"></span></div>
        <span class="a-btn a-gray" data-el="verify">${check}<span>Проверить ID</span></span>
        <span class="hint">Как узнать свой ID?</span>
      </div>
      <div class="a-card step done" data-step-card="done">
        <span class="mark">${check}</span>
        <b>Вы участвуете!</b>
        <small>Бот напишет, если вы выиграете</small>
        <div class="stats"><span><b data-count-done>1 204</b><small>участника</small></span><span><b>0,25%</b><small>шанс</small></span><span><b>1д 20ч</b><small>до итогов</small></span></div>
      </div>
    </div>
  </div>`;
}

function renderHeroPhone() {
  const inner = `${renderChannel({ interactive: true })}
    ${renderSheet()}
    <div class="notif"><img src="/assets/brand/rollerbot-mark.png" alt="" /><div><div class="notif-top"><b>RollerBot</b><span>сейчас</span></div><p><b>Итоги розыгрыша</b></p><p>🎉 Вы выиграли 100$! Подтвердите победу в чате с ботом.</p></div></div>
    <span class="tap"></span>`;
  return renderIphone(inner, { className: "phone", attrs: ' data-step="1" data-play="demo"' });
}

// ---- the page's words ------------------------------------------------------------

const STEPS = [
  {
    title: "Подключите канал",
    text: "Сделайте бота админом и перешлите ему любой пост. Канал сразу появится у вас.",
    art: `<div class="in-seq" data-play="seq" style="display:flex;flex-direction:column;gap:6px">
      <div class="bubble me"><span style="color:var(--tg-link)">/link_channel</span><span class="t">11:58 ✓✓</span></div>
      <div class="bubble me"><span style="display:block;color:var(--tg-link);font-size:11px;font-weight:600">Переслано из: Мой канал</span>🎁 Скоро розыгрыш на 100$!<span class="t">11:59 ✓✓</span></div>
      <div class="bubble">✅ <b>Канал подключён:</b> Мой канал. Он уже в панели — можно создавать розыгрыш.<span class="t">11:59</span></div>
    </div>`,
  },
  {
    title: "Создайте розыгрыш",
    text: "Приз, число победителей, бренд и длительность. Это минута — прямо в Telegram.",
    art: `<div class="in-seq" data-play="seq" style="display:grid;gap:6px">
      <div class="bubble" style="max-width:100%;padding:0;overflow:hidden"><div class="post-img" style="height:96px"><small>РОЗЫГРЫШ</small><b style="font-size:40px">100$</b><em>🎁</em></div></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap"><span class="react" style="background:var(--tg-bubble);color:var(--tg-ink)">🏆 3 победителя</span><span class="react" style="background:var(--tg-bubble);color:var(--tg-ink)">⏱ 2 дня</span><span class="react" style="background:var(--tg-bubble);color:var(--tg-ink)">BEEF</span></div>
    </div>`,
  },
  {
    title: "Бот публикует пост",
    text: "С кнопкой «Участвую» прямо внутри. Счётчик участников обновляется сам.",
    art: renderPost({ count: "1 204" }),
  },
  {
    title: "Участники проходят проверку",
    text: "Капча, подписка на канал, доступ в личку и регистрация по вашей реф-ссылке.",
    art: `<div class="in-seq" data-play="seq" style="display:grid;gap:6px">
      ${["Капча", "Подписка на канал", "Доступ в личку", "Регистрация по вашей ссылке"].map((label) => `<div class="bubble" style="max-width:100%;display:flex;align-items:center;gap:8px"><span style="width:18px;height:18px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;flex:none">${SVG.check.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24" width="11" height="11"')}</span>${label}</div>`).join("")}
    </div>`,
  },
  {
    title: "Итоги и выплата",
    text: "Бот выбирает победителей, пишет каждому и собирает кошельки для выплаты.",
    art: `<div class="in-seq" data-play="seq" style="display:flex;flex-direction:column;gap:6px">
      <div class="bubble">🎉 Вы выиграли <b>100$</b>! Подтвердите победу, чтобы получить приз.<span class="t">12:00</span></div>
      <div class="kb"><span>✅ Подтвердить победу</span></div>
      <div class="bubble me">TQdq2AAkRnkbj6itmRCW…Gvv<span class="t">12:01 ✓✓</span></div>
      <div class="bubble">✅ Адрес получен. Приз отправит организатор.<span class="t">12:01</span></div>
    </div>`,
  },
];

const FAQ = [
  ["Кому подходит RollerBot?", "Стримерам и владельцам Telegram-каналов, которые продвигают казино-проекты по реферальным ссылкам и разыгрывают призы среди подписчиков."],
  ["Что нужно, чтобы начать?", "Канал в Telegram и ваши реф-ссылки. Бот добавляется админом в канал, бренды и ссылки заполняются в панели прямо в Telegram."],
  ["С какими проектами вы работаете?", "Мы сотрудничаем с более чем 20 казино-проектами. Для популярных брендов проверка ID аккаунта уже настроена."],
  ["Как выплачиваются призы?", "Бот собирает у победителей USDT-кошельки и проверяет подписку на канал. Отправляете вы, а в панели отмечаете «Оплатил» — победитель сразу получит уведомление."],
  ["Сколько стоит доступ?", "Сейчас RollerBot на бета-тесте, цена появится после него. Напишите нам — расскажем, как подключиться."],
];

// ---- behaviour ---------------------------------------------------------------------

// Plain ES5 and no template literals: this text sits inside one.
const SCRIPT = `
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("click", function (event) {
    if (!event.target.closest("[data-theme-toggle]")) return;
    var dark = !root.classList.contains("app-theme-dark");
    root.classList.toggle("app-theme-dark", dark);
    root.setAttribute("data-app-theme", dark ? "dark" : "light");
    try { localStorage.setItem("rollerbot-theme", dark ? "dark" : "light"); } catch (e) {}
  });

  var nav = document.querySelector(".nav");
  function onScroll() { if (nav) nav.classList.toggle("is-stuck", window.scrollY > 4); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function spaced(n) { return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " "); }
  function countTo(el, from, to, ms) {
    if (!el) return;
    if (reduce) { el.textContent = spaced(to); return; }
    var start = null;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / ms);
      el.textContent = spaced(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  // ---- the phone in the hero: round and round while it is on screen
  var phone = document.querySelector('[data-play="demo"]');
  var timers = [];
  var shown = false;
  var running = false;
  // The channel keeps growing from round to round, as a live one would.
  var total = 1198;
  function later(ms, fn) { timers.push(window.setTimeout(fn, reduce ? Math.min(ms, 80) : ms)); }
  function stop() { timers.forEach(window.clearTimeout); timers = []; running = false; }
  function q(sel) { return phone.querySelector(sel); }
  function tap(sel) {
    var target = q(sel), dot = q(".tap"), screen = q(".screen");
    if (!target || !dot || !screen) return;
    var a = target.getBoundingClientRect(), b = screen.getBoundingClientRect();
    var k = b.width / (screen.offsetWidth || b.width) || 1;
    dot.style.left = ((a.left + a.width / 2 - b.left) / k) + "px";
    dot.style.top = ((a.top + a.height / 2 - b.top) / k) + "px";
    dot.classList.remove("go"); void dot.offsetWidth; dot.classList.add("go");
    target.classList.add("pressed");
    window.setTimeout(function () { target.classList.remove("pressed"); }, 200);
  }
  function card(name) {
    phone.querySelectorAll("[data-step-card]").forEach(function (c) { c.classList.toggle("on", c.getAttribute("data-step-card") === name); });
  }
  // What the sheet held goes back to the start while the sheet is down.
  function clearSheet() {
    phone.classList.remove("typing");
    phone.setAttribute("data-step", "1");
    card("");
    q(".cap").classList.remove("loading", "ok");
    q(".idv").textContent = "";
    var v = q('[data-el="verify"]'); v.classList.remove("ok"); v.lastChild.textContent = "Проверить ID";
  }
  function round() {
    running = true;
    var from = total;
    total += 4 + Math.floor(Math.random() * 4);
    later(500, function () { countTo(q("[data-count]"), from, total, 1100); });
    later(1800, function () { tap(".post-btn"); });
    later(2050, function () { phone.classList.add("app"); card("captcha"); });
    later(3200, function () { tap(".cap-box"); q(".cap").classList.add("loading"); });
    later(4100, function () { var c = q(".cap"); c.classList.remove("loading"); c.classList.add("ok"); });
    later(4800, function () { phone.setAttribute("data-step", "2"); card("reg"); });
    later(5600, function () { tap('[data-el="go"]'); });
    later(6100, function () {
      var el = q(".idv"), text = "A7K2Q9";
      phone.classList.add("typing");
      text.split("").forEach(function (ch, i) { later(i * 105, function () { el.textContent += ch; }); });
      later(text.length * 105 + 150, function () { phone.classList.remove("typing"); });
    });
    later(7100, function () { tap('[data-el="verify"]'); });
    later(7350, function () { var v = q('[data-el="verify"]'); v.classList.add("ok"); v.lastChild.textContent = "ID подтверждён"; });
    later(8200, function () {
      total += 1;
      q("[data-count-done]").textContent = spaced(total);
      phone.setAttribute("data-step", "4");
      card("done");
    });
    later(9700, function () { phone.classList.add("notified"); });
    // A pause on the result, then the banner and the sheet go and it starts over.
    later(13200, function () { phone.classList.remove("notified"); });
    later(13650, function () { phone.classList.remove("app"); q("[data-count]").textContent = spaced(total); });
    later(14500, function () {
      clearSheet();
      running = false;
      if (shown && !document.hidden) round();
    });
  }
  function start() {
    if (!phone || running) return;
    stop();
    phone.classList.remove("app", "notified");
    clearSheet();
    q("[data-count]").textContent = spaced(total);
    round();
  }
  if (phone) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        shown = entry.isIntersecting;
        if (shown && !document.hidden) start();
      });
    }, { threshold: 0.28 }).observe(phone);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { stop(); } else if (shown) { start(); }
    });
    phone.addEventListener("click", function (event) {
      if (event.target.closest('[data-act="join"]') && !phone.classList.contains("app")) { stop(); start(); }
    });
  }

  // ---- little plays
  var PLAYS = {
    results: function (el) {
      if (el.__run) return;
      el.__run = true;
      el.classList.remove("done");
      var clock = el.querySelector("[data-clock]"), left = 5;
      clock.textContent = "00:00:0" + left;
      var id = window.setInterval(function () {
        left -= 1;
        clock.textContent = "00:00:0" + Math.max(0, left);
        if (left <= 0) { window.clearInterval(id); el.classList.add("done"); el.__run = false; }
      }, reduce ? 40 : 850);
    }
  };
  document.addEventListener("click", function (event) {
    var again = event.target.closest("[data-again]");
    if (again) PLAYS.results(again.closest('[data-play="results"]'));
  });

  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add("in");
      seen.unobserve(el);
      var name = el.getAttribute("data-play");
      if (name && PLAYS[name]) PLAYS[name](el);
    });
  }, { threshold: 0.28, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".rv, [data-play]").forEach(function (el) { seen.observe(el); });

  // ---- the carousel
  var car = document.querySelector("[data-car]");
  if (car) {
    var prev = document.querySelector('[data-car-go="-1"]'), next = document.querySelector('[data-car-go="1"]');
    function sync() {
      if (!prev || !next) return;
      prev.disabled = car.scrollLeft < 8;
      next.disabled = car.scrollLeft + car.clientWidth > car.scrollWidth - 8;
    }
    function step() { var c = car.querySelector(".card"); return c ? c.getBoundingClientRect().width + 20 : 380; }
    document.addEventListener("click", function (event) {
      var b = event.target.closest("[data-car-go]");
      if (!b) return;
      car.scrollBy({ left: Number(b.getAttribute("data-car-go")) * step(), behavior: reduce ? "auto" : "smooth" });
    });
    car.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  }
})();
`;

// ---- page ------------------------------------------------------------------------

function renderLandingPage({ botUsername = "roller_official_bot" } = {}) {
  const check = SVG.check;
  const botUrl = `https://t.me/${escapeHtml(botUsername)}`;
  return `<!doctype html>
<html lang="ru" data-app-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0e1621" media="(prefers-color-scheme: dark)" />
  <meta name="description" content="RollerBot — бот розыгрышей в Telegram для партнёров казино-проектов: проверка участников, антифрод, итоги и выплаты в USDT." />
  <meta property="og:title" content="RollerBot — розыгрыши, которые приводят рефералов" />
  <meta property="og:description" content="Бот публикует розыгрыш в вашем канале, проверяет каждого участника и сам подводит итоги." />
  <meta property="og:image" content="/brand/logo.jpg" />
  <title>RollerBot — розыгрыши в Telegram, которые приводят рефералов</title>
  <link rel="icon" type="image/png" href="/assets/brand/rollerbot-favicon.png" />
  <link rel="apple-touch-icon" href="/brand/logo.jpg" />
  <script>(function(){var d=document.documentElement;d.classList.add("js");var t=null;try{t=localStorage.getItem("rollerbot-theme")}catch(e){}var dark=t?t==="dark":!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.classList.toggle("app-theme-dark",dark);d.setAttribute("data-app-theme",dark?"dark":"light");})();</script>
  <style>${STYLES}${DEVICE_STYLES}</style>
</head>
<body id="top">
  <header class="nav">
    <div class="wrap nav-in">
      <a class="nav-logo" href="#top"><img src="/assets/brand/rollerbot-mark.png" alt="" />RollerBot</a>
      <nav class="nav-links" aria-label="Разделы"><a href="#how">Как это работает</a><a href="#features">Возможности</a><a href="#price">Цена</a><a href="#faq">Вопросы</a></nav>
      <div class="nav-end">
        <button type="button" class="theme" data-theme-toggle aria-label="Сменить тему"><span class="i-sun">${SVG.sun}</span><span class="i-moon">${SVG.moon}</span></button>
        <a class="btn btn-sm" href="${SUPPORT_URL}" target="_blank" rel="noopener">Получить доступ</a>
      </div>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="wrap hero-in">
        <div class="hero-copy">
          <p class="kicker rv"><img src="/assets/brand/rollerbot-mark.png" alt="" />RollerBot</p>
          <h1 class="h-hero rv" style="--d:80">Розыгрыши, которые приводят рефералов.</h1>
          <p class="lead rv" style="--d:160">Бот публикует розыгрыш в вашем Telegram-канале, проверяет каждого участника и сам подводит итоги. Вы получаете рефералов — а не ботов и мультиаккаунты.</p>
          <div class="hero-cta rv" style="--d:240">
            <a class="btn" href="${SUPPORT_URL}" target="_blank" rel="noopener">Получить доступ</a>
            <a class="more" href="#how">Как это работает ${SVG.chevron}</a>
          </div>
          <p class="hero-meta rv" style="--d:320"><span>Бета-тест</span><span>20+ казино-проектов</span><span>Выплаты в USDT</span></p>
        </div>
        <div class="hero-stage rv" style="--d:200">
          ${renderHeroPhone()}
        </div>
      </div>
    </section>

    <section class="partners">
      <div class="wrap">
        <p class="rv">Работаем с <b>20+ казино-проектами</b></p>
        <div class="logos rv" style="--d:120">${BRANDS.map((b) => brandImg(b.slug, b.name, "logo")).join("")}<span class="logos-more">и другими</span></div>
      </div>
    </section>

    <section class="sec sec-alt" id="how">
      <div class="wrap sec-head">
        <h2 class="h-sec rv">Пять шагов. Остальное бот сделает сам.</h2>
        <p class="lead rv" style="--d:100">От поста в канале до выплаты победителю — без таблиц, скриншотов и ручных проверок.</p>
      </div>
      <div class="car rv" data-car>
        ${STEPS.map(
          (s, i) => `<article class="card">
          <div class="card-copy"><span class="card-n">Шаг ${i + 1}</span><h3 class="h-tile">${escapeHtml(s.title)}</h3><p>${escapeHtml(s.text)}</p></div>
          <div class="card-art">${s.art}</div>
        </article>`,
        ).join("")}
      </div>
      <div class="wrap car-ctl"><button type="button" data-car-go="-1" aria-label="Назад">${SVG.chevron}</button><button type="button" data-car-go="1" aria-label="Дальше">${SVG.chevron}</button></div>
    </section>

    <section class="sec" id="features">
      <div class="wrap">
        <div class="sec-head">
          <h2 class="h-sec rv">Сделано для партнёров казино-проектов.</h2>
          <p class="lead rv" style="--d:100">Бот не просто выбирает победителя — он следит, чтобы рефералы были настоящими, а призы доходили до людей.</p>
        </div>
        <div class="bento">
          <article class="tile tile-wide rv">
            <h3 class="h-tile">Рефералы — только ваши.</h3>
            <p>Человек становится рефералом того, у кого впервые участвовал на бренде. ID аккаунта сверяется с форматом каждого проекта.</p>
            <div class="tile-art" data-play="flags">
              <div class="row"><span class="av" style="background:#ff9500">А</span><span class="nm">Алексей<small>ID #A7K2Q9 · BEEF</small></span><span class="tag tag-ok">реферал ваш</span></div>
              <div class="row"><span class="av" style="background:#34c759">М</span><span class="nm">Милана<small>ID 5f2c…9a1e · Pokerdom</small></span><span class="tag tag-ok">реферал ваш</span></div>
              <div class="row"><span class="av" style="background:#8e8e93">Д</span><span class="nm">Денис<small>первое участие — в другом канале</small></span><span class="tag tag-no">не реф</span></div>
            </div>
          </article>
          <article class="tile rv" style="--d:90">
            <h3 class="h-tile">Антифрод на каждом участии.</h3>
            <p>Мультиаккаунты и боты по IP помечаются ещё до итогов.</p>
            <div class="tile-art" data-play="flags">
              <div class="row"><span class="av" style="background:#5856d6">d</span><span class="nm">dep_wolf643</span><span class="tag tag-bad">мультиаккаунт</span></div>
              <div class="row"><span class="av" style="background:#ff2d55">k</span><span class="nm">kot_spin12</span><span class="tag tag-warn">бот по IP</span></div>
            </div>
          </article>
          <article class="tile rv" data-play="results">
            <h3 class="h-tile">Итоги подводятся сами.</h3>
            <p>По таймеру или кнопкой. Каждому победителю — сообщение в личку.</p>
            <div class="tile-art">
              <div class="stage"><div class="clock" data-clock>00:00:05</div><div class="winners"><i style="background:#007aff">В</i><i style="background:#af52de">Е</i><i style="background:#ff9500">С</i><b>Победители выбраны</b></div></div>
              <button type="button" class="again" data-again>${SVG.replay}Ещё раз</button>
            </div>
          </article>
          <article class="tile rv" style="--d:90">
            <span class="coin">${PANEL_ICONS.usdt}</span>
            <h3 class="h-tile">Выплаты в USDT.</h3>
            <p>Перед выплатой бот ещё раз проверит, что победитель остался в канале.</p>
            <div class="tile-art nets">
              <span class="net">${PANEL_ICONS.trc20}TRC-20<span>Tron</span></span>
              <span class="net">${PANEL_ICONS.erc20}ERC-20<span>Ethereum</span></span>
              <span class="net">${PANEL_ICONS.bep20}BEP-20<span>BNB Chain</span></span>
            </div>
          </article>
          <article class="tile rv" style="--d:180">
            <h3 class="h-tile">Напоминания в канале.</h3>
            <p>Один пост со всеми активными розыгрышами — и кнопка к каждому.</p>
            <div class="tile-art">
              <div class="card-art in-seq" data-play="seq" style="margin:0;min-height:0;padding:12px">
                <div class="bubble" style="max-width:100%"><b>🔥 Активные розыгрыши</b><br />Успейте поучаствовать</div>
                <div class="kb kb-post" style="max-width:100%"><span>🎁 100$ · FUGU</span></div>
                <div class="kb kb-post" style="max-width:100%"><span>🎁 5 000₽ · BEEF</span></div>
                <div class="kb kb-post" style="max-width:100%"><span>🎁 50$ · Pokerdom</span></div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="sec sec-alt" id="price">
      <div class="wrap">
        <div class="sec-head"><h2 class="h-sec rv">Один доступ. Все возможности.</h2></div>
        <div class="price rv" style="--d:100">
          <div class="price-top"><span class="kicker" style="font-size:17px">Доступ для организаторов</span><span class="beta">Бета-тест</span></div>
          <div class="sum"><b>???</b><span>/ месяц</span></div>
          <p class="lead">Цена появится после бета-теста. Пока напишите нам — расскажем, как подключиться.</p>
          <ul class="incl">
            <li>${check}Розыгрыши в ваших каналах</li>
            <li>${check}Проверка участников</li>
            <li>${check}Антифрод и честные рефералы</li>
            <li>${check}Итоги и выплаты в USDT</li>
            <li>${check}Напоминания в канале</li>
            <li>${check}Поддержка в Telegram</li>
          </ul>
          <div class="price-cta"><a class="btn" href="${SUPPORT_URL}" target="_blank" rel="noopener">Написать нам</a><a class="more" href="${botUrl}" target="_blank" rel="noopener">Открыть бота ${SVG.chevron}</a></div>
        </div>
      </div>
    </section>

    <section class="sec" id="faq">
      <div class="wrap">
        <div class="sec-head"><h2 class="h-sec rv">Вопросы и ответы.</h2></div>
        <div class="faq">${FAQ.map(
          ([question, answer], index) => `<details class="rv" style="--d:${index * 60}"><summary>${escapeHtml(question)}${SVG.plus}</summary><p>${escapeHtml(answer)}</p></details>`,
        ).join("")}</div>
      </div>
    </section>
  </main>

  <footer class="foot">
    <div class="wrap">
      <p class="foot-note">RollerBot — сервис розыгрышей в Telegram для организаторов. Участие в розыгрышах бесплатное. Только для совершеннолетних.</p>
      <div class="foot-in">
        <span>© 2026 RollerBot</span>
        <a href="${botUrl}" target="_blank" rel="noopener">Бот</a>
        <a href="${SUPPORT_URL}" target="_blank" rel="noopener">Поддержка</a>
        <span class="age">18+</span>
      </div>
    </div>
  </footer>
  <script>${SCRIPT}</script>
</body>
</html>`;
}

module.exports = { renderLandingPage };
