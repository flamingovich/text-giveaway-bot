// The organizer panel's refreshed look, as approved in the «Живее» mockup:
// cards straight on the page background, brand logos instead of project names,
// figures in dollars, a filter over the history and one over the payout
// queue's networks, timers that tick, and a faint light in the corner of cards
// and buttons.
//
// Styles and the client script live here; index.js builds the markup. Every new
// class starts with pl-, so the panel's older rules - and the emboss layer's
// !important box-shadows, which match by the old class names - leave it alone.
// Where the new markup keeps an old class (history-action-btn, winner-action-btn,
// winner-copy-btn, draw-delete-btn), it is for the page script's hooks and the
// emboss layer, and the rules below restate what differs with ":root body" in
// front, which outranks the old two-class rules.

const { formatUsdStat, formatCountdownClock } = require("./panel-format");

const PANEL_ICONS = {
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  usdt:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#26A17B"/><path fill="#fff" d="M17.9 17.6c-.1 0-.7.1-1.9.1-1 0-1.7 0-1.9-.1-3.7-.2-6.5-.8-6.5-1.6s2.8-1.4 6.5-1.6v2.5c.2 0 .9.1 1.9.1 1.2 0 1.8-.1 1.9-.1v-2.5c3.7.2 6.4.8 6.4 1.6s-2.7 1.4-6.4 1.6zm0-3.4V12h5.2V8.6H8.9V12h5.2v2.2c-4.2.2-7.3 1-7.3 2s3.1 1.8 7.3 2V25h3.8v-6.8c4.2-.2 7.3-1 7.3-2s-3.1-1.8-7.3-2z"/></svg>',
  trc20:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#EF0027"/><path fill="#fff" d="M21.9 9.7 7.5 7l7.6 19.1 10.5-12.8-3.7-3.6zm-.2 1.2 2.2 2.1-6 1.1 3.8-3.2zm-5.1 3-6.4-5.3 10.4 1.9-4 3.4zm-.4.8-1 8.6-5.6-14 6.6 5.4zm1 .5 6.6-1.2-7.6 9.2 1-8z"/></svg>',
  erc20:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#627EEA"/><g fill="#fff"><path fill-opacity=".6" d="M16.5 4v8.9l7.5 3.3z"/><path d="M16.5 4 9 16.2l7.5-3.3z"/><path fill-opacity=".6" d="M16.5 22v6l7.5-10.4z"/><path d="M16.5 28v-6L9 17.6z"/><path fill-opacity=".2" d="m16.5 20.6 7.5-4.4-7.5-3.3z"/><path fill-opacity=".6" d="m9 16.2 7.5 4.4v-7.7z"/></g></svg>',
  bep20:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#F3BA2F"/><path fill="#fff" d="M12.1 14.4 16 10.5l3.9 3.9 2.3-2.3L16 5.9l-6.2 6.2 2.3 2.3zM5.9 16l2.3-2.3 2.3 2.3-2.3 2.3L5.9 16zm6.2 1.6L16 21.5l3.9-3.9 2.3 2.3L16 26.1l-6.2-6.2 2.3-2.3zm9.4-1.6 2.3-2.3 2.3 2.3-2.3 2.3-2.3-2.3zm-3.2 0L16 13.7 13.7 16 16 18.3 18.3 16z"/></svg>',
};

function getPanelLookStyles() {
  return `
    /* ---------- refreshed panel (panel-look.js) ---------- */
    body {
      --pl-card: var(--tg-theme-secondary-bg-color, #ffffff);
      --pl-bg: var(--tg-theme-bg-color, #eef3ff);
      --pl-sunk: #f5f8ff;
      --pl-text: var(--tg-theme-text-color, #151a2d);
      --pl-hint: var(--tg-theme-hint-color, #65708a);
      --pl-btn: var(--tg-theme-button-color, #325fff);
      --pl-btn-ink: var(--tg-theme-button-text-color, #ffffff);
      --pl-line: rgba(101, 112, 138, 0.2);
      --pl-line-soft: rgba(101, 112, 138, 0.13);
      --pl-tint: color-mix(in srgb, var(--pl-btn) 10%, transparent);
      --pl-ok: #1f7a45;
      --pl-ok-bg: #e5f5eb;
      --pl-warn: #946300;
      --pl-warn-bg: #fff3d4;
      --pl-bad: #c0392b;
      --pl-bad-bg: #ffebe9;
      --pl-sched: #2f55d4;
      --pl-sched-bg: #eaf0ff;
      --pl-trash: #c0392b;
      --pl-red: #d73a49;
      --pl-green: #1f9a55;
      --pl-emb: inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(22, 40, 90, 0.07);
      --pl-emb-fill: inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.16);
      --pl-lift: 0 10px 24px -18px rgba(30, 50, 110, 0.35);
      --pl-groove: inset 0 1px 2px rgba(22, 40, 90, 0.1);
      --pl-well: var(--pl-card);
      --pl-light-card: color-mix(in srgb, var(--pl-btn) 7%, transparent);
      --pl-light-tone: color-mix(in srgb, var(--pl-btn) 5%, transparent);
    }
    body.app-theme-dark {
      --pl-sunk: #1a2232;
      --pl-line: rgba(147, 160, 184, 0.24);
      --pl-line-soft: rgba(147, 160, 184, 0.14);
      --pl-ok: #7ee2a8;
      --pl-ok-bg: rgba(61, 214, 140, 0.16);
      --pl-warn: #f0c96a;
      --pl-warn-bg: rgba(240, 193, 77, 0.15);
      --pl-bad: #ff8a80;
      --pl-bad-bg: rgba(255, 107, 107, 0.14);
      --pl-sched: #9bb8ff;
      --pl-sched-bg: rgba(91, 140, 255, 0.18);
      --pl-trash: #e0574a;
      --pl-green: #22a35a;
      --pl-emb: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.28);
      --pl-emb-fill: inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 0 -2px 0 rgba(0, 0, 0, 0.22);
      --pl-lift: 0 10px 26px -18px rgba(0, 0, 0, 0.75);
      --pl-groove: inset 0 1px 2px rgba(0, 0, 0, 0.35);
      --pl-well: color-mix(in srgb, var(--pl-bg) 88%, #000);
      --pl-light-card: rgba(150, 180, 255, 0.08);
      --pl-light-tone: rgba(170, 195, 255, 0.07);
    }

    #panelLiveRoot { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; }
    .pl-card {
      position: relative;
      isolation: isolate;
      min-width: 0;
      padding: 14px;
      border-radius: 16px;
      border: 1px solid var(--pl-line-soft);
      background: var(--pl-card);
      color: var(--pl-text);
      box-shadow: var(--pl-emb), var(--pl-lift);
    }
    .pl-empty { padding: 20px 10px; text-align: center; font-size: 13px; font-weight: 600; color: var(--pl-hint); }
    .pl-empty[hidden], .pl-win[hidden] { display: none !important; }

    /* stats */
    :root body .pl-stats-title {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 0 0 12px;
      font-size: 16px;
      font-weight: 800;
      line-height: 1.2;
      color: var(--pl-text);
    }
    .pl-stats-ico { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: var(--pl-tint); color: var(--pl-btn); }
    .pl-stats-ico svg { width: 18px; height: 18px; display: block; }
    .pl-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .pl-stat { display: grid; gap: 3px; min-width: 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--pl-line-soft); background: var(--pl-sunk); box-shadow: var(--pl-emb); }
    .pl-stat-l { font-size: 11.5px; font-weight: 600; color: var(--pl-hint); }
    .pl-stat-v { font-size: 19px; font-weight: 800; line-height: 1.15; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .pl-stat-btns { display: grid; gap: 8px; margin-top: 10px; }
    :root body #panelStatsRoot .pl-stat-btns .history-panel-action-btn { width: 100%; margin: 0; }

    /* segmented filters: one pill slides under the chosen option */
    .pl-seg {
      position: relative;
      isolation: isolate;
      display: flex;
      min-width: 0;
      padding: 3px;
      border-radius: 11px;
      border: 1px solid var(--pl-line-soft);
      background: color-mix(in srgb, var(--pl-card) 92%, transparent);
      box-shadow: var(--pl-emb);
    }
    .pl-seg-ind {
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: 3px;
      width: 0;
      border-radius: 8px;
      background: var(--pl-btn);
      box-shadow: var(--pl-emb-fill);
      transition: transform 0.38s cubic-bezier(0.3, 1.2, 0.4, 1), width 0.38s cubic-bezier(0.3, 1.2, 0.4, 1);
    }
    :root body button.pl-seg-btn {
      position: relative;
      z-index: 1;
      flex: 1 1 0;
      width: auto;
      min-width: 0;
      min-height: 32px;
      margin: 0;
      padding: 5px 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border: 0;
      border-radius: 8px;
      background: none;
      box-shadow: none;
      color: var(--pl-hint);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.15;
      white-space: nowrap;
      transform: none;
      filter: none;
      cursor: pointer;
      transition: color 0.25s, transform 0.14s ease;
    }
    :root body button.pl-seg-btn[aria-pressed="true"] { color: var(--pl-btn-ink); }
    .pl-seg-btn em { font-style: normal; font-variant-numeric: tabular-nums; opacity: 0.75; }
    .pl-seg-btn svg { flex: none; width: 14px; height: 14px; display: block; transform: translateY(-0.5px); }
    /* Networks: each option as wide as its logo and label. Size containment keeps
       a squeezed bar from pushing the sheet wider than the phone. */
    .pl-net-filter { container-type: inline-size; }
    :root body .pl-net-filter button.pl-seg-btn { flex: 1 1 auto; padding: 5px; font-size: 11.5px; }
    .pl-net-filter .pl-seg-btn em { margin-left: -1px; }
    @container (max-width: 340px) {
      :root body .pl-net-filter button.pl-seg-btn { gap: 3px; padding-inline: 3px; font-size: 11px; }
      .pl-net-filter .pl-seg-btn svg { width: 13px; height: 13px; }
    }

    /* history list */
    .pl-history, .pl-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; }
    /* backwards, never both: a finished animation that still fills keeps its
       starting offset in the scrollable width of whatever holds the cards. */
    .pl-list.pl-entering > .pl-card, .pl-card.pl-enter {
      animation: pl-rise 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      animation-delay: calc(min(var(--i, 0), 6) * 40ms);
    }
    .pl-list[data-dir="next"] > .pl-card, .pl-queue-list[data-dir="next"] > .pl-win {
      animation: pl-from-right 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      animation-delay: calc(min(var(--i, 0), 6) * 40ms);
    }
    .pl-list[data-dir="prev"] > .pl-card, .pl-queue-list[data-dir="prev"] > .pl-win {
      animation: pl-from-left 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      animation-delay: calc(min(var(--i, 0), 6) * 40ms);
    }
    @keyframes pl-rise { from { opacity: 0.001; transform: translateY(10px); } }
    @keyframes pl-from-right { from { opacity: 0.001; transform: translateX(24px); } }
    @keyframes pl-from-left { from { opacity: 0.001; transform: translateX(-24px); } }
    .pl-more { display: grid; }
    :root body .pl-more .history-more-btn {
      width: 100%;
      min-height: 40px;
      margin: 0;
      border-radius: 10px;
      border: 1px solid var(--pl-line-soft);
      background: var(--pl-bg);
      color: var(--pl-text);
      font-size: 14px;
      font-weight: 800;
      box-shadow: var(--pl-emb) !important;
    }

    /* draw card */
    .pl-draw.is-active { border: 1.5px solid var(--pl-btn); }
    .pl-draw-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .pl-draw-logo { flex: none; width: 48px; height: 34px; display: flex; align-items: center; }
    :root body .pl-draw-logo img { width: 48px; height: 24px; max-width: none; object-fit: contain; object-position: left center; }
    .pl-draw-gift { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--pl-tint); color: var(--pl-btn); }
    .pl-draw-gift svg { width: 19px; height: 19px; display: block; }
    /* A 336px phone leaves the title ~20px short beside the logo; it takes a
       second line rather than turning into "Розыгры…". */
    .pl-draw-title { min-width: 0; margin-right: auto; font-size: 17px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; }
    .pl-status {
      flex: none;
      display: inline-flex;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      font-size: 11.5px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: var(--pl-emb);
    }
    .pl-status-active, .pl-status-paid { color: var(--pl-ok); background: var(--pl-ok-bg); }
    .pl-status-finished, .pl-status-draft { color: var(--pl-hint); background: var(--pl-sunk); }
    .pl-status-scheduled { color: var(--pl-sched); background: var(--pl-sched-bg); }
    .pl-del-form { flex: none; display: flex; margin: 0; }
    :root body button.pl-del {
      width: 30px;
      height: 30px;
      min-width: 30px;
      min-height: 30px;
      margin: 0;
      padding: 0;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--pl-trash);
      box-shadow: none !important;
      transition: background-color 0.2s, transform 0.14s ease;
    }
    :root body button.pl-del:hover { background: var(--pl-bad-bg); }
    :root body button.pl-del svg { width: 17px; height: 17px; }
    .pl-div { height: 1px; margin: 12px 0; background: var(--pl-line-soft); }
    .pl-period {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--pl-line-soft);
      background: var(--pl-sunk);
      font-size: 12.5px;
      font-weight: 600;
    }
    .pl-period-ico { flex: none; display: flex; color: var(--pl-btn); }
    .pl-period-ico svg { width: 15px; height: 15px; display: block; }
    .pl-period b { font-weight: 800; }
    .pl-period-sep { color: var(--pl-hint); }
    .pl-chips { container: pl-chips / inline-size; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
    .pl-chip { display: grid; gap: 1px; min-width: 0; padding: 7px 10px; border-radius: 10px; border: 1px solid var(--pl-line-soft); background: var(--pl-sunk); }
    /* "Победителей" needs 70px and a 336px phone leaves the chip 65px: narrow
       chips get less padding and a smaller label instead of "Победител / й". */
    .pl-chip-l { font-size: 10.5px; font-weight: 600; color: var(--pl-hint); white-space: nowrap; }
    .pl-chip-v { display: inline-block; font-size: 14px; font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; }
    @container pl-chips (max-width: 300px) {
      .pl-chip { padding-inline: 8px; }
      .pl-chip-l { font-size: 10px; }
    }
    .pl-chip-v.pl-bump { animation: pl-bump 0.45s ease-out; }
    @keyframes pl-bump { 0% { transform: translateY(-5px); color: var(--pl-ok); } 100% { transform: none; } }
    .pl-acts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; }
    .pl-acts.pl-acts-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pl-acts-2 > form:last-child:nth-child(odd) { grid-column: 1 / -1; }
    .pl-acts form { display: grid; min-width: 0; margin: 0; }
    :root body .pl-acts .history-action-btn {
      width: 100%;
      min-height: 38px;
      margin: 0;
      padding: 9px 12px;
      border: 0;
      border-radius: 10px;
      background: var(--pl-btn);
      color: var(--pl-btn-ink);
      font-size: 14px;
      font-weight: 800;
      line-height: 1.2;
      text-align: center;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    :root body .pl-acts .history-action-btn.pl-btn-danger { background: var(--pl-red); color: #fff; }
    .pl-fold { margin: 0; }
    .pl-fold > summary {
      position: relative;
      isolation: isolate;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 10px;
      border: 1px solid var(--pl-line-soft);
      background: var(--pl-sunk);
      font-size: 13px;
      font-weight: 700;
      list-style: none;
      cursor: pointer;
    }
    .pl-fold > summary::-webkit-details-marker { display: none; }
    .pl-fold > summary svg { width: 16px; height: 16px; flex: none; color: var(--pl-hint); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
    /* <details> shows and hides its content with no transition at all, so the
       script grows and shrinks this body. The chevron turns back as soon as
       closing starts. */
    .pl-fold[open]:not(.is-closing) > summary svg { transform: rotate(180deg); }
    .pl-fold-anim { overflow: hidden; }
    .pl-fold-in { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding-top: 8px; }
    .pl-fold-empty { margin: 0; font-size: 12px; color: var(--pl-hint); }

    /* winner card */
    .pl-win {
      position: relative;
      isolation: isolate;
      display: grid;
      gap: 8px;
      min-width: 0;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid var(--pl-line-soft);
      background: var(--pl-sunk);
      color: var(--pl-text);
    }
    .pl-win-top { display: flex; align-items: center; gap: 8px 10px; min-width: 0; }
    :root body .pl-av {
      flex: none;
      width: 36px;
      height: 36px;
      min-width: 36px;
      max-width: none;
      border-radius: 50%;
      display: grid;
      place-items: center;
      overflow: hidden;
      object-fit: cover;
      color: #fff;
      font-size: 15px;
      font-weight: 700;
    }
    .pl-win-name { flex: 1 1 auto; display: grid; gap: 1px; min-width: 0; }
    .pl-win-name-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .pl-win-name-row b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; }
    .pl-win-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; font-weight: 500; color: var(--pl-hint); }
    .pl-win-logo { flex: none; margin-left: auto; line-height: 0; }
    :root body .pl-win-logo img { width: 60px; height: 30px; max-width: none; object-fit: contain; object-position: right center; }
    /* Badges and the payout block always share one line. When the badges would be
       cut, the script adds pl-tight and the network's name goes, its logo stays;
       only past that do the badges end in "…". */
    .pl-win-row { display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
    .pl-badges { flex: 1 1 auto; display: flex; flex-wrap: nowrap; gap: 5px; min-width: 0; overflow: hidden; }
    :root body .pl-badges .winner-badge:first-child { flex-shrink: 0; }
    .pl-win-row.pl-tight .pl-pay-net > span { display: none; }
    .pl-win-row.pl-tight .pl-pay-net { padding-left: 6px; }
    :root body .pl-win .winner-badge {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      background: var(--pl-card);
      color: var(--pl-hint);
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.35;
      box-shadow: var(--pl-emb) !important;
    }
    :root body .pl-win .winner-badge-ok { color: var(--pl-ok); background: var(--pl-ok-bg); }
    :root body .pl-win .winner-badge-warn { color: var(--pl-warn); background: var(--pl-warn-bg); }
    :root body .pl-win .winner-badge-danger { color: var(--pl-bad); background: var(--pl-bad-bg); }
    /* Amount and network on one line: [USDT $12 | TRC TRC-20]. text-box trims each
       label to cap height and baseline, so flex centring puts the digits and the
       capitals on the middle of their logos without per-font nudges. */
    .pl-pay {
      flex: none;
      display: flex;
      align-items: center;
      gap: 7px;
      margin-left: auto;
      padding: 4px 9px 4px 5px;
      border-radius: 10px;
      border: 1px solid var(--pl-line-soft);
      background: var(--pl-card);
      box-shadow: var(--pl-emb);
      white-space: nowrap;
    }
    .pl-pay-amt, .pl-pay-net { display: flex; align-items: center; gap: 6px; line-height: 1; }
    .pl-pay svg { flex: none; width: 16px; height: 16px; display: block; }
    .pl-pay-amt b { font-size: 13px; font-weight: 800; }
    .pl-pay-net { gap: 5px; padding-left: 7px; border-left: 1px solid var(--pl-line-soft); }
    .pl-pay-net span { font-size: 12px; font-weight: 500; }
    .pl-pay-amt b, .pl-pay-net span { text-box: trim-both cap alphabetic; }
    .pl-pay-text { padding: 4px 9px; font-size: 12.5px; font-weight: 700; white-space: normal; }
    /* The address is always one line: the row is a size container and the text
       takes the size at which its --len characters (about 0.6em each in a
       monospace face) fill the width beside the copy button, never above 12.5px. */
    .pl-wal {
      container-type: inline-size;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      min-height: 40px;
      padding: 6px 6px 6px 10px;
      border-radius: 9px;
      border: 1px solid var(--pl-line-soft);
      background: var(--pl-card);
    }
    :root body .pl-wal code {
      min-width: 0;
      padding: 0;
      background: none;
      color: var(--pl-text);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: min(12.5px, calc((100cqw - 42px) / (var(--len, 42) * 0.6)));
      line-height: 1.35;
      white-space: nowrap;
    }

    :root body button.pl-copy {
      flex: none;
      width: 28px;
      height: 28px;
      min-width: 28px;
      min-height: 28px;
      margin: 0;
      padding: 0;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--pl-btn);
      box-shadow: none !important;
      transition: color 0.2s ease, transform 0.14s ease;
    }
    :root body button.pl-copy svg { width: 15px; height: 15px; }
    .pl-win-acts { container-type: inline-size; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .pl-win-acts form { display: grid; min-width: 0; margin: 0; }
    .pl-win-acts form.pl-wide { grid-column: 1 / -1; }
    :root body .pl-win-acts .winner-action-btn {
      width: 100%;
      min-height: 34px;
      margin: 0;
      padding: 7px 6px;
      border: 0;
      border-radius: 8px;
      background: var(--pl-btn);
      color: #fff;
      font-size: 13px !important;
      font-weight: 800;
      line-height: 1.2;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* One line, always: "Отказано в / выплате" wrapped and made both buttons of the
       row taller. The size needs !important because the shell's button chain sets
       14px at a specificity no ordinary rule reaches. Two buttons share a row, and
       the longest label, "Отказано в выплате", is 10.23em in Inter 800: the size is
       what fits half the row less the gap and padding, from 10px to 13px. */
    :root body .pl-win-acts form:not(.pl-wide) .winner-action-btn { font-size: clamp(10px, calc((50cqw - 15px) / 10.4), 13px) !important; }
    :root body .pl-win-acts .winner-action-btn.pl-btn-success { background: var(--pl-green); }
    :root body .pl-win-acts .winner-action-btn.pl-btn-danger { background: var(--pl-red); }
    :root body .pl-win-acts .winner-action-btn.pl-btn-secondary { border: 1px solid var(--pl-line-soft); background: var(--pl-bg); color: var(--pl-text); }

    /* payout queue */
    .pl-queue, .pl-queue-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; min-width: 0; }

    /* "Новый розыгрыш" and the other sheets: the same form, dressed like the cards */
    :root body .draw-block { border-radius: 14px; border-color: var(--pl-line-soft); position: relative; isolation: isolate; box-shadow: var(--pl-emb), var(--pl-lift) !important; }
    :root body .draw-file-btn, :root body .draw-paste-btn {
      border: 1px dashed color-mix(in srgb, var(--pl-btn) 45%, transparent);
      background: var(--pl-card);
      color: var(--pl-text);
      transition: transform 0.12s, border-color 0.2s;
    }
    :root body .draw-file-btn { position: relative; isolation: isolate; }
    :root body .draw-file-btn:active { transform: scale(0.97); }
    :root body .draw-submit:not(:disabled) {
      position: relative;
      isolation: isolate;
      box-shadow: var(--pl-emb-fill), 0 8px 20px -10px color-mix(in srgb, var(--pl-btn) 70%, transparent) !important;
    }
    /* Checkboxes: the tick is always there, scaled to nothing, so checking pops it
       in and unchecking shrinks it away instead of it blinking. */
    :root body input.draw-check {
      appearance: none !important;
      -webkit-appearance: none !important;
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      max-width: 18px !important;
      min-height: 18px !important;
      max-height: 18px !important;
      margin: 0 !important;
      padding: 0 !important;
      display: inline-grid !important;
      place-content: center;
      border-radius: 5px !important;
      border: 1.5px solid color-mix(in srgb, var(--pl-hint) 45%, transparent) !important;
      background: var(--pl-well) !important;
      box-shadow: var(--pl-groove) !important;
      cursor: pointer;
      transition: background-color 0.22s ease, border-color 0.22s ease, transform 0.15s ease;
    }
    :root body input.draw-check::after {
      content: "";
      width: 9px;
      height: 5px;
      border: 2px solid #fff;
      border-top: 0;
      border-right: 0;
      opacity: 0;
      transform: translateY(-1px) rotate(-45deg) scale(0.2);
      transition: transform 0.3s cubic-bezier(0.3, 1.6, 0.5, 1), opacity 0.15s ease;
    }
    :root body input.draw-check:checked {
      border-color: var(--pl-btn) !important;
      background: var(--pl-btn) !important;
      box-shadow: var(--pl-emb-fill) !important;
    }
    :root body input.draw-check:checked::after { opacity: 1; transform: translateY(-1px) rotate(-45deg) scale(1); }
    :root body input.draw-check:active { transform: scale(0.88); }
    :root body input.draw-check:disabled { opacity: 0.5; cursor: not-allowed; }
    :root body input.draw-check:focus-visible { outline: 2px solid color-mix(in srgb, var(--pl-btn) 55%, transparent); outline-offset: 2px; }
    /* Folding form fields change only a class; the script animates the height
       between the two states. The old max-height caps (220px for ~70px of
       content) made the fold rush open and pause before closing. */
    :root body .anim-collapse,
    :root body .draw-timing-row .anim-collapse.anim-collapse-open { max-height: none; transition: none; }
    :root body .anim-collapse:not(.anim-collapse-open) { height: 0; }

    /* bottom bar: icon beside the label, a lower bar */
    :root body .panel-bottom-bar .quick-action { position: relative; isolation: isolate; flex-direction: row; gap: 8px; min-height: 52px; padding: 10px 8px; border-radius: 14px; }
    :root body .panel-bottom-bar .quick-action .qa-icon,
    :root body .panel-bottom-bar .quick-action .qa-icon svg { width: 20px; height: 20px; }
    :root body .panel-bottom-bar .quick-action .qa-label { font-size: 14px; }

    /* Corner light, as on the join mini app's cards and buttons, at half its
       strength there: a list of cards repeated the lit corner down the screen.
       It lives on a pseudo-element behind the content (isolation keeps z-index -1
       inside its element) and stands still: breathing on every card and button
       kept dozens of layers animating for as long as the page was open and
       warmed the phone. Never transform it - a moved pseudo-element counts
       towards scrollable overflow even where it is transparent. */
    :root body :is(.pl-card, .pl-queue-list > .pl-win, .draw-block, .panel-sheet, .pl-seg, .pl-fold > summary, .pl-more .history-more-btn, .history-panel-action-btn, .pl-acts .history-action-btn, .pl-win-acts .winner-action-btn, .draw-file-btn, .draw-submit, .panel-bottom-bar .quick-action)::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0.85;
    }
    :root body :is(.history-panel-action-btn, .pl-acts .history-action-btn, .pl-win-acts .winner-action-btn) { position: relative; isolation: isolate; }
    :root body .panel-sheet { isolation: isolate; }
    :root body :is(.pl-card, .pl-queue-list > .pl-win, .draw-block, .panel-sheet)::before {
      background: radial-gradient(120% 90% at 100% 0%, var(--pl-light-card) 0%, transparent 62%);
    }
    /* Filled buttons get white light: the join button's navy shade only darkened
       a short panel button and read as no light at all. */
    :root body :is(.history-panel-action-btn, .pl-acts .history-action-btn, .pl-win-acts .winner-action-btn, .draw-submit, .panel-bottom-bar .quick-action)::before {
      background: radial-gradient(90% 140% at 100% 0%, rgba(255, 255, 255, 0.24) 0%, transparent 60%);
    }
    :root body :is(.pl-seg, .pl-fold > summary, .pl-more .history-more-btn, .pl-win-acts .winner-action-btn.pl-btn-secondary, .draw-file-btn)::before {
      background: radial-gradient(90% 140% at 100% 0%, var(--pl-light-tone) 0%, transparent 60%);
    }
    /* ---------- motion ---------- */
    /* Sheets. The root turned invisible the moment it closed, so the slide down
       played unseen: visibility now waits for the slide. The dimming stays painted
       and only its opacity moves, the bottom bar drops and fades instead of
       popping, and a panel swapped in fades up. */
    :root body .panel-sheet-root { transition: visibility 0s linear 0.3s; }
    :root body .panel-sheet-root.is-open { transition: visibility 0s; }
    :root body .panel-sheet { transition: transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1); }
    :root body .panel-sheet-root:not(.is-open) .panel-sheet { transition: transform 0.26s cubic-bezier(0.4, 0, 1, 1); }
    :root body .panel-sheet-backdrop,
    :root body button.panel-sheet-backdrop:hover { background: rgba(0, 0, 0, 0.55) !important; transition: opacity 0.28s ease; }
    :root body .panel-bottom-bar { transition: opacity 0.22s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
    :root body.panel-sheet-open .panel-bottom-bar { transform: translateY(18px); }
    :root body .panel-sheet-root.is-open .create-panel:not(.panel-hidden) { animation: pl-fade-up 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }

    /* What appears by losing display: none or a hidden class gets a short fade. */
    :root body #moneyPrizeFields, :root body #customPrizeFields { animation: pl-fade 0.22s ease backwards; }
    :root body #remindProjectLinksWrap:not(.panel-hidden),
    :root body #addProjectWrap:not(.panel-hidden) { animation: pl-fade-up 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }
    :root body .msg { animation: pl-fade-down 0.36s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }
    @keyframes pl-fade { from { opacity: 0.001; } }
    @keyframes pl-fade-up { from { opacity: 0.001; transform: translateY(8px); } }
    @keyframes pl-fade-down { from { opacity: 0.001; transform: translateY(-8px); } }

    /* While a filter fetches, the cards it replaces dim: the tap is answered at once. */
    .pl-list > .pl-card { transition: opacity 0.2s ease; }
    .pl-list.pl-pending > .pl-card { opacity: 0.45; }

    /* Touch. Every button answers a press with a small squeeze, and hover looks
       meant for a mouse are cancelled on touch screens, where they stayed lit
       after the finger lifted. */
    :root body :is(.history-panel-action-btn, .pl-acts .history-action-btn, .pl-more .history-more-btn, .pl-win-acts .winner-action-btn, .draw-submit, .draw-file-btn, .draw-paste-btn, .winner-profile-btn, button.pl-copy, button.pl-del, button.pl-seg-btn, .pl-fold > summary, .header-icon-btn, .theme-toggle-btn, .panel-bottom-bar .quick-action) {
      -webkit-tap-highlight-color: transparent;
    }
    :root body :is(.history-panel-action-btn, .pl-acts .history-action-btn, .pl-more .history-more-btn, .pl-win-acts .winner-action-btn, .draw-submit, .pl-fold > summary) {
      transition: transform 0.14s ease, opacity 0.2s ease;
    }
    :root body :is(.winner-profile-btn, .header-icon-btn, .theme-toggle-btn) {
      transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.14s ease;
    }
    :root body :is(.history-panel-action-btn, .pl-acts .history-action-btn, .pl-more .history-more-btn, .pl-win-acts .winner-action-btn, .draw-submit, .pl-fold > summary):active:not(:disabled) { transform: scale(0.97); }
    :root body :is(button.pl-copy, button.pl-del, .winner-profile-btn, .header-icon-btn, .theme-toggle-btn):active { transform: scale(0.9); }
    :root body button.pl-seg-btn:active { transform: scale(0.95); }
    :root body .panel-bottom-bar .quick-action:active { transform: scale(0.97) !important; }
    @media (hover: none) {
      :root body :is(.draw-submit, .winner-action-btn, .history-action-btn, .header-icon-btn, .theme-toggle-btn, .winner-profile-btn, .winner-copy-btn, .project-icon-btn):hover { filter: none !important; }
      :root body :is(.draw-submit, .winner-action-btn, .history-action-btn, .winner-profile-btn, .winner-copy-btn, .project-icon-btn):hover:not(:active) { transform: none; }
      :root body .panel-bottom-bar .quick-action:not(.qa-bar-active):hover { filter: none !important; }
      :root body button.pl-del:hover { background: transparent; }
    }
    :root body button.pl-copy.pl-copied { color: var(--pl-ok); animation: pl-pop 0.32s cubic-bezier(0.3, 1.6, 0.5, 1); }
    @keyframes pl-pop { 50% { transform: scale(1.18); } }

    /* Theme switch: surfaces cross-fade their colours for a moment instead of
       snapping. The script sets the class only for the switch. */
    :root.pl-theme-fade :is(body, .site-header, .pl-card, .pl-stat, .pl-chip, .pl-period, .pl-seg, .pl-win, .pl-pay, .pl-wal, .pl-status, .winner-badge, .pl-fold > summary, .panel-sheet, .panel-bottom-bar, .quick-action, .draw-block, .draw-input, .draw-file-btn, .draw-paste-btn, .history-action-btn, .winner-action-btn, .header-icon-btn, .theme-toggle-btn) {
      transition: background-color 0.35s ease, color 0.35s ease, border-color 0.35s ease !important;
    }

    @media (prefers-reduced-motion: reduce) {
      .pl-list > .pl-card, .pl-card.pl-enter, .pl-queue-list > .pl-win, .pl-chip-v.pl-bump,
      .msg, #moneyPrizeFields, #customPrizeFields, #remindProjectLinksWrap, #addProjectWrap, .panel-sheet-root .create-panel, button.pl-copy.pl-copied,
      :root body :is(.pl-card, .pl-queue-list > .pl-win, .draw-block, .panel-sheet, .pl-seg, .pl-fold > summary, .pl-more .history-more-btn, .history-panel-action-btn, .pl-acts .history-action-btn, .pl-win-acts .winner-action-btn, .draw-file-btn, .draw-submit, .panel-bottom-bar .quick-action)::before {
        animation: none !important;
      }
      .pl-seg-ind, .pl-fold-anim, .pl-list > .pl-card, :root body input.draw-check, :root body input.draw-check::after, :root body .anim-collapse,
      :root body .panel-sheet-root, :root body .panel-bottom-bar { transition: none !important; }
    }
  `;
}

// Runs inside the panel page's own script, after its setup functions, so it can
// call setupCopyButtons and setupProfileLinks for cards it brings in. Written
// without template literals: this whole string is one.
function getPanelLookScript({ panelBase }) {
  return `
    (function () {
      const formatUsdStat = ${formatUsdStat.toString()};
      const formatCountdownClock = ${formatCountdownClock.toString()};
      const reduceMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const FILTER_ORDER = ["all", "active", "due"];
      const NET_ORDER = ["all", "trc20", "erc20", "bep20"];

      // The pill is sized and placed from the chosen button's own box, so the
      // options can differ in width. Bars inside a closed sheet have no size yet
      // and are placed when the sheet opens.
      function placePills(root, instant) {
        const scope = root || document;
        // querySelectorAll never returns the element it is called on, and a
        // switch hands over the bar itself.
        const bars = scope.matches && scope.matches(".pl-seg") ? [scope] : scope.querySelectorAll(".pl-seg");
        bars.forEach((bar) => {
          const on = bar.querySelector('.pl-seg-btn[aria-pressed="true"]');
          const ind = bar.querySelector(".pl-seg-ind");
          if (!on || !ind || !bar.offsetWidth) return;
          if (instant) ind.style.transition = "none";
          ind.style.width = on.offsetWidth + "px";
          ind.style.transform = "translateX(" + (on.offsetLeft - 3) + "px)";
          if (instant) {
            void ind.offsetWidth;
            ind.style.transition = "";
          }
        });
      }
      window.plPlacePills = placePills;

      function authHeaders() {
        const tg = window.Telegram && window.Telegram.WebApp;
        const headers = { Accept: "application/json" };
        if (tg && tg.initData) headers["X-Telegram-Init-Data"] = tg.initData;
        return headers;
      }

      function tickCountdowns() {
        const now = Date.now();
        document.querySelectorAll("[data-countdown]").forEach((el) => {
          const end = Date.parse(el.getAttribute("data-countdown"));
          if (!Number.isFinite(end)) return;
          const text = formatCountdownClock(end - now) || el.getAttribute("data-countdown-done") || "";
          if (el.textContent !== text) el.textContent = text;
        });
      }

      // Only on opening the page. The live refresh swaps the stats in with their
      // final figures, and counting up again every few seconds would be noise.
      function countUpStats() {
        const root = document.getElementById("panelStatsRoot");
        if (!root || reduceMotion) return;
        root.querySelectorAll("[data-count-usd], [data-count-int]").forEach((el) => {
          const isInt = el.hasAttribute("data-count-int");
          const target = Number(el.getAttribute(isInt ? "data-count-int" : "data-count-usd"));
          if (!Number.isFinite(target) || target <= 0) return;
          const startedAt = performance.now();
          const step = (time) => {
            if (!el.isConnected) return;
            const k = Math.min(1, (time - startedAt) / 900);
            const value = target * (1 - Math.pow(1 - k, 3));
            el.textContent = isInt ? String(Math.round(value)) : formatUsdStat(k < 1 ? Math.floor(value) : target);
            if (k < 1) window.requestAnimationFrame(step);
          };
          window.requestAnimationFrame(step);
        });
      }

      // The entrance plays once. Cards the live refresh swaps in later must not
      // rise again, so the class goes before its first poll.
      function settleEntrance() {
        window.setTimeout(() => {
          document.querySelectorAll(".pl-entering").forEach((el) => el.classList.remove("pl-entering"));
        }, 1100);
      }

      function slideIn(list, dir) {
        list.removeAttribute("data-dir");
        void list.offsetWidth;
        list.setAttribute("data-dir", dir);
        window.setTimeout(() => {
          if (list.getAttribute("data-dir") === dir) list.removeAttribute("data-dir");
        }, 900);
      }

      function pressOnly(bar, btn) {
        bar.querySelectorAll(".pl-seg-btn").forEach((item) => item.setAttribute("aria-pressed", String(item === btn)));
        placePills(bar, false);
      }

      function replaceHistoryControls(html) {
        const controls = document.getElementById("panelHistoryControls");
        if (controls) {
          if (html) controls.outerHTML = html;
          else controls.remove();
          return;
        }
        const list = document.getElementById("panelHistoryList");
        if (html && list) list.insertAdjacentHTML("afterend", html);
      }

      let filterRequest = 0;
      function setupHistoryFilter() {
        const root = document.getElementById("panelHistoryRoot");
        if (!root) return;
        root.addEventListener("click", (event) => {
          const btn = event.target.closest(".pl-filter .pl-seg-btn");
          if (!btn) return;
          const bar = btn.closest(".pl-seg");
          const next = btn.getAttribute("data-filter");
          const current = root.getAttribute("data-filter") || "all";
          if (!next || next === current) return;
          const previousBtn = bar.querySelector('.pl-seg-btn[data-filter="' + current + '"]');
          pressOnly(bar, btn);
          root.setAttribute("data-filter", next);
          const pendingList = document.getElementById("panelHistoryList");
          if (pendingList) pendingList.classList.add("pl-pending");
          const requestId = ++filterRequest;
          fetch("${panelBase}/history?offset=0&filter=" + encodeURIComponent(next), {
            credentials: "same-origin",
            headers: authHeaders(),
          })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
              if (requestId !== filterRequest) return;
              if (!data) throw new Error("history_failed");
              const list = document.getElementById("panelHistoryList");
              if (list) {
                const from = list.offsetHeight;
                list.classList.remove("pl-pending");
                list.innerHTML = data.html || "";
                slideIn(list, FILTER_ORDER.indexOf(next) > FILTER_ORDER.indexOf(current) ? "next" : "prev");
                tweenHeight(list, from);
              }
              replaceHistoryControls(data.controlsHtml || "");
              if (data.counts) {
                bar.querySelectorAll(".pl-seg-btn").forEach((item) => {
                  const count = data.counts[item.getAttribute("data-filter")];
                  const em = item.querySelector("em");
                  if (em && Number.isFinite(Number(count))) em.textContent = "(" + count + ")";
                });
              }
              tickCountdowns();
              if (typeof setupCopyButtons === "function") setupCopyButtons();
              if (typeof setupProfileLinks === "function") setupProfileLinks();
            })
            .catch(() => {
              if (requestId !== filterRequest || !previousBtn) return;
              document.getElementById("panelHistoryList")?.classList.remove("pl-pending");
              root.setAttribute("data-filter", current);
              pressOnly(bar, previousBtn);
            });
        });
      }

      // Every waiting winner is already in the sheet, so the network filter only
      // hides and shows cards; nothing is fetched.
      function setupQueueNetworkFilter() {
        document.addEventListener("click", (event) => {
          const btn = event.target.closest(".pl-net-filter .pl-seg-btn");
          if (!btn) return;
          const queue = btn.closest(".pl-queue");
          const list = queue && queue.querySelector(".pl-queue-list");
          if (!list) return;
          const next = btn.getAttribute("data-net");
          const current = queue.getAttribute("data-net") || "all";
          if (!next || next === current) return;
          queue.setAttribute("data-net", next);
          pressOnly(btn.closest(".pl-seg"), btn);
          const from = list.offsetHeight;
          let shown = 0;
          list.querySelectorAll(":scope > .pl-win").forEach((card) => {
            const match = next === "all" || card.getAttribute("data-net") === next;
            card.hidden = !match;
            if (match) {
              card.style.setProperty("--i", String(shown));
              shown += 1;
            }
          });
          const empty = queue.querySelector(".pl-queue-empty");
          if (empty) empty.hidden = shown > 0;
          slideIn(list, NET_ORDER.indexOf(next) > NET_ORDER.indexOf(current) ? "next" : "prev");
          tweenHeight(list, from);
        });
      }

      // Ticks land just after each whole second. An interval started at an
      // arbitrary moment drifts against the clock and now and then shows a second
      // for two ticks or skips one.
      function scheduleTick() {
        tickCountdowns();
        window.setTimeout(scheduleTick, 1000 - (Date.now() % 1000) + 20);
      }

      // Height from what it was to what it is now, for lists whose content was just
      // swapped. Clipped while it runs, so incoming cards do not spill.
      function tweenHeight(el, from) {
        const to = el.offsetHeight;
        if (reduceMotion || typeof el.animate !== "function" || Math.abs(to - from) < 2) return;
        el.style.overflow = "hidden";
        const reset = () => {
          el.style.overflow = "";
        };
        el.animate([{ height: from + "px" }, { height: to + "px" }], {
          duration: 320,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        }).finished.then(reset, reset);
      }

      // "Победители и выплаты". <details> has no transition of its own, and
      // animating its height made the phone lay out the whole page on every frame
      // of it. So the card changes size once, its content is revealed with a clip,
      // and everything below glides from where it was with a transform: work the
      // compositor does without touching layout. On closing the cards below slide
      // up over it first, and the card shrinks under them at the very end, in the
      // same frame the transforms are dropped, so nothing visibly moves.
      function setupFolds() {
        document.addEventListener("click", (event) => {
          const summary = event.target.closest(".pl-fold > summary");
          if (!summary) return;
          const fold = summary.parentElement;
          const body = fold.querySelector(".pl-fold-anim");
          const card = fold.closest(".pl-card");
          if (!body || !card || reduceMotion || typeof body.animate !== "function") return;
          event.preventDefault();
          if (fold.dataset.animating === "1") return;
          fold.dataset.animating = "1";
          const movers = [];
          for (let el = card.nextElementSibling; el; el = el.nextElementSibling) movers.push(el);
          const controls = document.getElementById("panelHistoryControls");
          if (controls && card.parentElement && card.parentElement.id === "panelHistoryList") movers.push(controls);
          const opening = !fold.open;
          if (opening) fold.open = true;
          else fold.classList.add("is-closing");
          const shift = body.offsetHeight;
          const hidden = "inset(0 0 100% 0)";
          const shown = "inset(0 0 0 0)";
          const up = "translateY(" + -shift + "px)";
          const timing = { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" };
          const animations = [
            body.animate(
              opening
                ? [{ clipPath: hidden, opacity: 0 }, { clipPath: shown, opacity: 1 }]
                : [{ clipPath: shown, opacity: 1 }, { clipPath: hidden, opacity: 0 }],
              timing,
            ),
          ];
          movers.forEach((el) => {
            animations.push(
              el.animate(
                opening ? [{ transform: up }, { transform: "translateY(0)" }] : [{ transform: "translateY(0)" }, { transform: up }],
                timing,
              ),
            );
          });
          const finish = () => {
            if (!opening) fold.open = false;
            animations.forEach((animation) => animation.cancel());
            fold.dataset.animating = "";
            fold.classList.remove("is-closing");
          };
          animations[0].finished.then(finish, finish);
        });
      }

      // Form fields that fold (publish time, duration, confirmation time) change
      // only a class; the height is animated here. When the class has just been
      // removed the field already measures 0 tall, but scrollHeight still reports
      // its content, which is where the closing starts from.
      function setupCollapses() {
        const fields = document.querySelectorAll(".anim-collapse");
        if (!fields.length || typeof MutationObserver !== "function") return;
        const observer = new MutationObserver((records) => {
          records.forEach((record) => {
            const el = record.target;
            const wasOpen = String(record.oldValue || "").split(" ").includes("anim-collapse-open");
            const isOpen = el.classList.contains("anim-collapse-open");
            if (wasOpen === isOpen || reduceMotion || typeof el.animate !== "function") return;
            const height = el.scrollHeight;
            el.animate(
              isOpen
                ? [{ height: "0px", opacity: 0 }, { height: height + "px", opacity: 1 }]
                : [{ height: height + "px", opacity: 1 }, { height: "0px", opacity: 0 }],
              {
                duration: isOpen ? 300 : 220,
                easing: isOpen ? "cubic-bezier(0.2, 0.8, 0.2, 1)" : "cubic-bezier(0.4, 0, 1, 1)",
              },
            );
          });
        });
        fields.forEach((el) => observer.observe(el, { attributes: true, attributeFilter: ["class"], attributeOldValue: true }));
      }

      function setupCopyFeedback() {
        document.addEventListener("click", (event) => {
          const btn = event.target.closest("button.pl-copy");
          if (!btn) return;
          btn.classList.remove("pl-copied");
          void btn.offsetWidth;
          btn.classList.add("pl-copied");
          window.clearTimeout(btn.plCopiedTimer);
          btn.plCopiedTimer = window.setTimeout(() => btn.classList.remove("pl-copied"), 1200);
        });
      }

      // A photo that does not load - Telegram briefly unreachable, or a photo
      // deleted since the page was drawn - becomes the initial on a gradient that
      // a person without a photo gets, instead of an empty circle. Load errors do
      // not bubble, hence the capture phase; the scan catches pictures that
      // failed before this script ran.
      function setupAvatarFallback() {
        const swap = (img) => {
          if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-fallback")) return;
          const span = document.createElement("span");
          span.className = img.getAttribute("data-fallback-class") || img.className;
          span.setAttribute("style", img.getAttribute("data-fallback-style") || "");
          span.textContent = img.getAttribute("data-fallback");
          img.replaceWith(span);
        };
        document.addEventListener("error", (event) => swap(event.target), true);
        document.querySelectorAll("img[data-fallback]").forEach((img) => {
          if (img.complete && img.naturalWidth === 0) swap(img);
        });
      }

      // Registered in the capture phase so the class is on before the theme
      // itself switches in the button's own handler.
      function setupThemeFade() {
        const btn = document.getElementById("themeToggleBtn");
        if (!btn || reduceMotion) return;
        btn.addEventListener(
          "click",
          () => {
            const root = document.documentElement;
            root.classList.add("pl-theme-fade");
            window.clearTimeout(root.plThemeFadeTimer);
            root.plThemeFadeTimer = window.setTimeout(() => root.classList.remove("pl-theme-fade"), 450);
          },
          true,
        );
      }

      // A row is refitted whenever its width changes, which includes a sheet
      // opening or a fold unfolding, and when cards arrive from the filter,
      // "Показать ещё" or the live refresh.
      function fitWinnerRow(row) {
        if (!row.offsetWidth) return;
        const badges = Array.from(row.querySelectorAll(".winner-badge"));
        const isCut = () => badges.some((badge) => badge.scrollWidth > badge.clientWidth + 1);
        row.classList.remove("pl-tight");
        if (isCut()) row.classList.add("pl-tight");
        badges.forEach((badge) => {
          if (badge.scrollWidth > badge.clientWidth + 1) badge.title = badge.textContent.trim();
          else badge.removeAttribute("title");
        });
      }
      const rowObserver =
        "ResizeObserver" in window ? new ResizeObserver((entries) => entries.forEach((entry) => fitWinnerRow(entry.target))) : null;
      function watchWinnerRows(root, watch) {
        root.querySelectorAll(".pl-win-row").forEach((row) => {
          if (!rowObserver) fitWinnerRow(row);
          else if (watch) rowObserver.observe(row);
          else rowObserver.unobserve(row);
        });
      }
      watchWinnerRows(document, true);
      new MutationObserver((records) => {
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;
            watchWinnerRows(node, true);
            // The server drew their clock a round trip ago.
            if (node.querySelector("[data-countdown]")) tickCountdowns();
          });
          record.removedNodes.forEach((node) => {
            if (node.nodeType === 1) watchWinnerRows(node, false);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });

      setupAvatarFallback();
      placePills(document, true);
      countUpStats();
      settleEntrance();
      scheduleTick();
      setupHistoryFilter();
      setupQueueNetworkFilter();
      setupFolds();
      setupCollapses();
      setupCopyFeedback();
      setupThemeFade();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          placePills(document, true);
          document.querySelectorAll(".pl-win-row").forEach(fitWinnerRow);
        });
      }
      window.addEventListener("resize", () => placePills(document, true));
    })();
  `;
}

module.exports = {
  PANEL_ICONS,
  getPanelLookStyles,
  getPanelLookScript,
};
