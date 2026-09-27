// How the organiser panel looks, drawn in the gz-planner design language.
//
// The panel's old stylesheets - the page's own, the shared mini-app one, the
// emoji picker's, the emboss layer and the "Живее" refresh in panel-look.js -
// still decide where everything sits, with their look stripped out by
// css-layout-filter.js. Everything a person sees is decided here, last on the
// page, with no !important: there is nothing underneath left to fight.
//
// The panel's body carries no class of its own, so the scope is plain "body".
// Sheets are where the forms live, and in a sheet the planner draws controls
// as grey fills straight on the sheet - groups are told apart by space and a
// hairline, never by a box inside a box.

const {
  getPlannerTokens,
  getPlannerCanvas,
  GLASS_CARD,
  FILLED_GLASS,
  TINTED_GLASS,
  GRAY_GLASS,
  tintedGlass,
  ROUND_GLASS,
  SHEET_GLASS,
  SEGMENT_PILL,
  ICON_TILE,
  GROW_MOTION,
  GROW_PRESSED,
  CAPSULE,
} = require("./planner-theme");

// The buttons the old sheet painted as the primary colour by default: every
// button except these. The same list, so exactly the same buttons stay primary.
const DEFAULT_BUTTON = "body button" + [
  "pl-seg-btn", "theme-toggle-btn", "settings-action-btn", "winner-copy-btn", "quick-action",
  "project-icon-btn", "draw-link-btn", "history-action-btn", "winner-action-btn", "panel-sheet-close",
  "panel-sheet-backdrop", "header-icon-btn", "draw-file-btn", "draw-paste-btn", "draw-submit",
  "emoji-open", "emoji-cell", "emoji-tab", "pl-del", "pl-copy", "winner-profile-btn",
].map((name) => `:not(.${name})`).join("");

const FIELD = `body input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="range"]), body select, body textarea, body .draw-input`;

// A grey chevron for selects. A data URI cannot read a CSS variable, so it is
// the one grey that reads on both themes.
const SELECT_CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238E8E93' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

// The top bar: the page shows through it frosted, as under an iOS nav bar.
const HEADER = `
  body .site-header {
    background: color-mix(in oklab, var(--bg) 72%, transparent);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    backdrop-filter: saturate(180%) blur(20px);
    border: 0;
    border-bottom: .5px solid var(--separator);
    box-shadow: none;
  }
  body .page-logo { border-radius: .625rem; box-shadow: none; }
  body .page-title { font-size: 1.0625rem; }
  body .page-title-brand { color: var(--label); font-weight: 700; letter-spacing: -.02em; }
  body .page-title-sub { color: var(--label-2); font-size: .8125rem; font-weight: 400; }

  body .header-icon-btn,
  body button.theme-toggle-btn {
    ${ROUND_GLASS}
    transition: transform .42s var(--spring), background .18s var(--ease);
  }
  body .header-icon-btn:active,
  body button.theme-toggle-btn:active { transform: scale(1.1); }
  body .header-icon-btn.header-icon-btn-active { ${FILLED_GLASS} border-radius: 50%; }
`;

// Cards lie on the page as glass.
const SURFACES = `
  body .pl-card {
    ${GLASS_CARD}
    border-radius: var(--r-card);
    color: var(--label);
  }
  body .pl-draw.is-active { border-color: color-mix(in srgb, var(--tint) 55%, transparent); }

  body .pl-empty { color: var(--label-2); font-size: .9375rem; font-weight: 400; }

  body .msg {
    color: var(--green);
    background: color-mix(in srgb, var(--green) 14%, transparent);
    border: 0;
    border-radius: var(--r-row);
    font-size: .9375rem;
    font-weight: 500;
  }
`;

// The history summary: an icon tile and a title, four figures on grey tiles.
const STATS = `
  body .pl-stats-title {
    color: var(--label);
    font-size: 1.25rem;
    font-weight: 680;
    letter-spacing: -.3px;
  }
  body .pl-stats-ico { ${ICON_TILE} border-radius: .5rem; }

  body .pl-stat {
    background: var(--fill);
    border: 0;
    border-radius: var(--r-row);
    box-shadow: none;
  }
  body .pl-stat-l { color: var(--label-2); font-size: .8125rem; font-weight: 400; }
  body .pl-stat-v {
    color: var(--label);
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -.01em;
    font-variant-numeric: tabular-nums;
  }
`;

// Filters are the planner's segmented control: a grey track and a lit pill
// that slides between the segments (panel-look.js already moves it).
const SEGMENTS = `
  body .pl-seg {
    background: var(--fill);
    border: 0;
    border-radius: 999px;
    box-shadow: none;
  }
  body .pl-seg-ind { ${SEGMENT_PILL} border-radius: 999px; }
  body button.pl-seg-btn {
    color: var(--label-2);
    background: none;
    border: 0;
    border-radius: 999px;
    box-shadow: none;
    font-size: .875rem;
    font-weight: 550;
    transition: color .22s var(--ease);
  }
  body button.pl-seg-btn[aria-pressed="true"] { color: var(--label); font-weight: 600; }
  body .pl-seg-btn em { font-style: normal; font-variant-numeric: tabular-nums; opacity: .7; }
  body .pl-net-filter button.pl-seg-btn { font-size: .8125rem; }
`;

// One draw: title row with a status capsule, the period, three figures, the
// winners fold and the actions.
const DRAWS = `
  body .pl-draw-gift { ${ICON_TILE} border-radius: .5rem; }
  body .pl-draw-title {
    color: var(--label);
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -.01em;
  }

  body .pl-status {
    border: 0;
    border-radius: 999px;
    box-shadow: none;
    font-size: .75rem;
    font-weight: 590;
  }
  body .pl-status-active,
  body .pl-status-paid { color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
  body .pl-status-finished,
  body .pl-status-draft { color: var(--label-2); background: var(--fill); }
  body .pl-status-scheduled { color: var(--orange); background: color-mix(in srgb, var(--orange) 16%, transparent); }

  body button.pl-del {
    color: var(--red);
    background: none;
    border: 0;
    border-radius: 50%;
    box-shadow: none;
    transition: transform .42s var(--spring), background .18s var(--ease);
  }
  body button.pl-del:active { background: color-mix(in srgb, var(--red) 14%, transparent); transform: scale(1.1); }

  body .pl-div { background: var(--separator); }

  body .pl-period {
    color: var(--label);
    background: var(--fill);
    border: 0;
    border-radius: var(--r-ctl);
    font-size: .8125rem;
    font-weight: 500;
  }
  body .pl-period-ico { color: var(--tint-ink); }
  body .pl-period b { font-weight: 650; }
  body .pl-period-sep { color: var(--label-2); }

  body .pl-chip { background: var(--fill); border: 0; border-radius: var(--r-ctl); }
  body .pl-chip-l { color: var(--label-2); font-size: .6875rem; font-weight: 400; }
  body .pl-chip-v {
    color: var(--label);
    font-size: .9375rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  body .pl-fold > summary {
    color: var(--label);
    background: var(--fill);
    border: 0;
    border-radius: var(--r-ctl);
    font-size: .9375rem;
    font-weight: 590;
  }
  body .pl-fold > summary svg { color: var(--label-3); }
  body .pl-fold-empty { color: var(--label-2); font-size: .8125rem; }

  body .pl-acts .history-action-btn,
  body .history-panel-action-btn {
    ${CAPSULE}
    ${FILLED_GLASS}
    border: 0;
    font-size: .9375rem;
    ${GROW_MOTION}
  }
  body .pl-acts .history-action-btn.pl-btn-danger { ${tintedGlass("var(--red)")} }
  /* Side by side, "Завершить сейчас" broke onto two lines at the usual inner
     margins on a 375-point phone. The old layout's padding rule is weighed with
     ":root body", so this one is too. */
  :root body .pl-acts.pl-acts-2 .history-action-btn { padding-inline: .5rem; }
  body .pl-acts .history-action-btn:active,
  body .history-panel-action-btn:active { ${GROW_PRESSED} }
  body .history-panel-action-label { font-weight: 650; }
  body .history-panel-action-meta { font-weight: 400; opacity: .85; }

  body .pl-more .history-more-btn {
    ${CAPSULE}
    ${TINTED_GLASS}
    border: 0;
    font-size: .9375rem;
    ${GROW_MOTION}
  }
  body .pl-more .history-more-btn:active { ${GROW_PRESSED} }

  body .status-pill { color: var(--label-2); background: var(--fill); border: 0; border-radius: 999px; font-size: .75rem; font-weight: 590; }
  body .history-cover-side,
  body .history-thumb { border-radius: .625rem; }
`;

// A winner: a grey card with a face, the name, grey details, capsule badges,
// the payout, the wallet in monospace, and the decision buttons.
const WINNERS = `
  body .pl-win {
    color: var(--label);
    background: var(--fill);
    border: 0;
    border-radius: var(--r-row);
    box-shadow: none;
  }
  body .pl-av { border-radius: 50%; color: #fff; font-size: 1rem; font-weight: 600; }
  body .pl-win-name-row b { color: var(--label); font-size: 1rem; font-weight: 600; }
  body .pl-win-meta { color: var(--label-2); font-size: .8125rem; font-weight: 400; }

  body .pl-win .winner-badge,
  body .winner-badge {
    color: var(--label-2);
    background: var(--fill);
    border: 0;
    border-radius: 999px;
    box-shadow: none;
    font-size: .6875rem;
    font-weight: 590;
  }
  body .pl-win .winner-badge-ok,
  body .winner-badge-ok { color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
  body .pl-win .winner-badge-warn,
  body .winner-badge-warn { color: var(--orange); background: color-mix(in srgb, var(--orange) 16%, transparent); }
  body .pl-win .winner-badge-danger,
  body .winner-badge-danger { color: var(--red); background: color-mix(in srgb, var(--red) 16%, transparent); }
  body .pl-win .winner-badge-anon,
  body .winner-badge-anon { color: var(--purple); background: color-mix(in srgb, var(--purple) 16%, transparent); }

  body .pl-pay {
    background: var(--fill);
    border: 0;
    border-radius: 999px;
    box-shadow: none;
  }
  body .pl-pay-amt b { color: var(--label); font-size: .875rem; font-weight: 650; font-variant-numeric: tabular-nums; }
  body .pl-pay-net { border-left: .5px solid var(--separator); }
  body .pl-pay-net span { color: var(--label-2); font-size: .8125rem; font-weight: 500; }
  body .pl-pay-text { color: var(--label); font-size: .8125rem; font-weight: 590; }

  body .pl-wal { background: var(--fill); border: 0; border-radius: var(--r-ctl); }
  body .pl-wal code {
    color: var(--label);
    background: none;
    font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace;
    font-size: min(.8125rem, calc((100cqw - 42px) / (var(--len, 42) * 0.6)));
    letter-spacing: 0;
  }
  body button.pl-copy {
    color: var(--tint-ink);
    background: none;
    border: 0;
    border-radius: 50%;
    box-shadow: none;
  }
  body button.pl-copy:active { transform: scale(1.15); }
  body button.pl-copy.pl-copied { color: var(--green); }

  /* Paid is the one filled button; refusing is red text on glass, so the two
     never look alike under a thumb. The width formula is the old one: two
     buttons share a row and their words must fit it. */
  body .pl-win-acts .winner-action-btn {
    ${CAPSULE}
    ${FILLED_GLASS}
    border: 0;
    font-size: .9375rem;
    ${GROW_MOTION}
  }
  body .pl-win-acts form:not(.pl-wide) .winner-action-btn { font-size: clamp(.6875rem, calc((50cqw - 15px) / 10.4), .9375rem); }
  body .pl-win-acts .winner-action-btn.pl-btn-success { --tint: var(--green); --on-tint: #fff; --tint-fill: initial; }
  body .pl-win-acts .winner-action-btn.pl-btn-danger { ${tintedGlass("var(--red)")} }
  body .pl-win-acts .winner-action-btn.pl-btn-secondary,
  body .winner-action-btn.winner-action-secondary { ${TINTED_GLASS} }
  body .pl-win-acts .winner-action-btn:active { ${GROW_PRESSED} }

  body .winner-profile-btn,
  body .winner-copy-btn {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 16%, transparent);
    border: 0;
    border-radius: 50%;
    box-shadow: none;
  }
  body .winner-profile-btn:active,
  body .winner-copy-btn:active { transform: scale(1.15); }
`;

// Fields are grey fills on the sheet, the planner's control; the caption above
// each is small and grey; the tick boxes are the planner's round checks.
const FORMS = `
  body .create-title {
    color: var(--label);
    font-size: 1.25rem;
    font-weight: 680;
    letter-spacing: -.3px;
  }
  body .create-title-icon { color: var(--tint-ink); }

  body .draw-block {
    background: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding-left: 0;
    padding-right: 0;
  }
  body .draw-block + .draw-block { border-top: .5px solid var(--separator); }

  body .draw-label { color: var(--label-2); font-size: .8125rem; font-weight: 500; }
  body .draw-ico { color: var(--tint-ink); }
  body label { color: var(--label-2); font-size: .8125rem; font-weight: 500; }

  ${FIELD} {
    color: var(--label);
    background-color: var(--fill);
    border: 0;
    border-radius: var(--r-ctl);
    box-shadow: none;
    font-size: 1.0625rem;
    font-weight: 400;
    letter-spacing: -.022em;
    transition: box-shadow .2s var(--ease), background-color .2s var(--ease);
  }
  body input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="range"]):focus,
  body select:focus,
  body textarea:focus,
  body .draw-input:focus {
    outline: none;
    background-color: var(--fill-strong);
    box-shadow: inset 0 0 0 1.5px var(--tint);
  }
  body input::placeholder,
  body textarea::placeholder { color: var(--label-3); opacity: 1; }

  body select,
  body .draw-form select.draw-input {
    background-image: ${SELECT_CHEVRON};
    background-repeat: no-repeat;
    background-position: right .75rem center;
    background-size: .75rem;
  }

  body .draw-input-num { font-size: 1rem; }
  body .draw-input-unit { font-size: .9375rem; }

  /* The round check: an empty ring, filled with the tint and a white tick
     when on - the planner's task check. */
  body input.draw-check {
    border: 1.5px solid var(--label-3);
    border-radius: 50%;
    background: none;
    box-shadow: none;
    transition: background .2s var(--ease), border-color .2s var(--ease);
  }
  body input.draw-check::after { border: 2px solid var(--on-tint); border-top: 0; border-right: 0; }
  body input.draw-check:checked { background: var(--tint); border-color: var(--tint); }
  body input.draw-check:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tint) 30%, transparent); }
  body .draw-check-label { color: var(--label); font-size: .9375rem; font-weight: 400; }
  body .draw-check-title { color: var(--label); font-size: .9375rem; font-weight: 400; }
  body .draw-check-hint { color: var(--label-2); font-size: .8125rem; font-weight: 400; }
  body .draw-check-disabled .draw-check-title { color: var(--label-2); }

  body .draw-file-btn,
  body .draw-paste-btn {
    ${TINTED_GLASS}
    border: 0;
    border-radius: var(--r-ctl);
    font-size: .9375rem;
    font-weight: 590;
    ${GROW_MOTION}
  }
  body .draw-file-btn:active,
  body .draw-paste-btn:active { ${GROW_PRESSED} }
  body .draw-file-btn.is-ready,
  body .draw-paste-btn.is-ready { background: color-mix(in srgb, var(--tint) 28%, transparent); box-shadow: none; }

  body .draw-link-btn { color: var(--tint-ink); background: none; border: 0; font-size: .8125rem; font-weight: 590; }
  body .draw-link-btn:active { opacity: .5; }

  body .draw-image-preview-wrap { background: var(--fill); border: 0; border-radius: var(--r-row); box-shadow: none; }
  body .draw-image-preview { background: var(--fill); }
  body .draw-image-preview-label { color: var(--tint-ink); font-size: .8125rem; font-weight: 590; }
  body .draw-image-clear-btn { color: var(--red); background: none; border: 0; font-size: .8125rem; font-weight: 590; }

  body .draw-submit,
  body button.draw-submit {
    ${CAPSULE}
    ${FILLED_GLASS}
    border: 0;
    ${GROW_MOTION}
  }
  body .draw-submit:not(:disabled):active { ${GROW_PRESSED} }
  body .draw-submit .draw-ico { color: currentColor; }
  body .draw-submit-secondary,
  body button.draw-submit.draw-submit-secondary { ${GRAY_GLASS} }

  /* Everything the old sheet made primary by default stays primary. */
  ${DEFAULT_BUTTON} {
    ${CAPSULE}
    ${FILLED_GLASS}
    border: 0;
    font-size: .9375rem;
    ${GROW_MOTION}
  }
  ${DEFAULT_BUTTON}:not(:disabled):active { ${GROW_PRESSED} }
  body button.btn-secondary { ${GRAY_GLASS} }
  body button.btn-danger { ${tintedGlass("var(--red)")} }
`;

// The emoji picker: a frosted popover like the planner's menus, the search as
// a grey field, the section tabs quiet until chosen.
const EMOJI = `
  body .emoji-field button.emoji-open {
    background: none;
    border: 0;
    border-radius: 50%;
    font-size: 1.125rem;
  }
  body .emoji-field button.emoji-open.is-open { background: var(--fill); }

  body .emoji-pop {
    background: color-mix(in oklab, var(--bg-elevated) 94%, transparent);
    -webkit-backdrop-filter: blur(1.5rem) saturate(1.6);
    backdrop-filter: blur(1.5rem) saturate(1.6);
    border: .5px solid var(--glass-brd);
    border-radius: var(--r-row);
    box-shadow: 0 1rem 2.5rem rgba(0,0,0,.28);
  }
  body .emoji-search {
    color: var(--label);
    background: var(--fill);
    border: 0;
    border-radius: 999px;
    font-size: .9375rem;
  }
  body .emoji-search:focus { outline: none; box-shadow: inset 0 0 0 1.5px var(--tint); }
  body .emoji-recent-title,
  body .emoji-group-title { color: var(--label-2); font-size: .6875rem; font-weight: 590; letter-spacing: .03em; text-transform: uppercase; }

  /* The emoji need their own fonts back - the layout filter took the type. */
  body .emoji-pop button.emoji-cell {
    background: none;
    border: 0;
    border-radius: .5rem;
    font-size: 21px;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
    letter-spacing: 0;
  }
  body .emoji-pop button.emoji-cell:active { background: var(--fill); transform: scale(1.15); }
  body .emoji-tabs { background: none; border-top: .5px solid var(--separator); }
  body .emoji-tabs button.emoji-tab {
    background: none;
    border: 0;
    border-radius: .5rem;
    font-size: 17px;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
    opacity: .55;
  }
  body .emoji-tabs button.emoji-tab.is-active { background: var(--fill); opacity: 1; }
  body .emoji-empty { color: var(--label-2); font-size: .8125rem; }
`;

// Sheets slide up frosted, with the planner's larger corners, a lit top rim
// and a grabber, and a round glass cross.
const SHEETS = `
  body .panel-sheet {
    ${SHEET_GLASS}
    border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    color: var(--label);
  }
  body .panel-sheet::after {
    content: "";
    position: absolute;
    top: .4375rem;
    left: 50%;
    width: 2.25rem;
    height: .3125rem;
    margin-left: -1.125rem;
    border-radius: 999px;
    background: var(--label-3);
    pointer-events: none;
    z-index: 4;
  }
  body .panel-sheet-backdrop,
  body button.panel-sheet-backdrop {
    background: rgba(0,0,0,.4);
    border: 0;
    box-shadow: none;
  }
  body button.panel-sheet-close {
    ${ROUND_GLASS}
    transition: transform .42s var(--spring);
  }
  body button.panel-sheet-close:active { transform: scale(1.1); }
`;

// The two big actions at the bottom float over the page on a frosted strip:
// creating is the filled one, settings the plain glass one.
const BOTTOM_BAR = `
  body .panel-bottom-bar {
    background: color-mix(in oklab, var(--bg) 70%, transparent);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    backdrop-filter: saturate(180%) blur(20px);
    border: 0;
    border-top: .5px solid var(--separator);
    box-shadow: none;
  }
  body .panel-bottom-bar .quick-action {
    ${GRAY_GLASS}
    border: 0;
    border-radius: 1.375rem;
    ${GROW_MOTION}
  }
  body .panel-bottom-bar #toggleCreateDrawBtn { ${FILLED_GLASS} }
  body .panel-bottom-bar .quick-action:active { ${GROW_PRESSED} }
  body .panel-bottom-bar .quick-action .qa-icon { color: currentColor; }
  body .panel-bottom-bar .quick-action .qa-label { color: currentColor; font-size: .9375rem; font-weight: 590; }
`;

// Settings and access: lists of grey rows with a caption over each list.
const LISTS = `
  body .projects-list-title,
  body .access-list-title {
    color: var(--label-2);
    font-size: .8125rem;
    font-weight: 400;
    letter-spacing: .02em;
    text-transform: uppercase;
  }
  body .projects-list-title .draw-ico,
  body .access-list-title .draw-ico { color: var(--label-2); }

  body .project-card,
  body .channel-card,
  body .access-card {
    background: var(--fill);
    border: 0;
    border-radius: var(--r-row);
    box-shadow: none;
  }
  body .access-card-super { background: color-mix(in srgb, var(--tint) 12%, transparent); }
  body .project-card-needs-setup { box-shadow: inset 0 0 0 1.5px var(--orange); }

  body .project-card-brand-logo,
  body .project-card-logo-wrap { background: var(--bg-elevated); border: 0; border-radius: .625rem; }
  body .project-card-logo-fallback { color: var(--label-3); }
  body .channel-card-logo-wrap { border-radius: 50%; }

  body .project-card-name { color: var(--label); font-size: 1rem; font-weight: 600; }
  body .channel-card .project-card-name { font-size: .9375rem; font-weight: 600; }
  body .project-card-setup-hint { color: var(--orange); font-size: .8125rem; font-weight: 500; }
  body .project-card-link,
  body .project-card-promo { color: var(--tint-ink); font-size: .8125rem; font-weight: 500; }
  body .channel-card-meta { color: var(--label-2); font-size: .8125rem; font-weight: 400; }

  body .project-icon-btn {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 14%, transparent);
    border: 0;
    border-radius: 50%;
    box-shadow: none;
    ${GROW_MOTION}
  }
  body .project-icon-btn:active { transform: scale(1.1); }
  body .project-delete-btn,
  body .channel-delete-btn,
  body .access-delete-btn { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }

  body .projects-empty,
  body .access-empty {
    color: var(--label-2);
    background: var(--fill);
    border: 0;
    border-radius: var(--r-row);
    font-size: .875rem;
  }
  body .projects-empty .draw-ico,
  body .access-empty .draw-ico { color: var(--label-3); }

  body .access-avatar { border: 0; border-radius: 50%; }
  body .access-avatar-fallback {
    color: #fff;
    border: 0;
    border-radius: 50%;
    background: linear-gradient(180deg, var(--avatar-grad-top, #7BD3FF) 0%, var(--avatar-grad-bottom, #2AABEE) 100%);
    font-size: 1.125rem;
    font-weight: 600;
  }
  body .access-card-name { color: var(--label); font-size: 1rem; font-weight: 600; }
  body .access-card-meta { color: var(--label-2); font-size: .8125rem; }
  body .access-badge {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 16%, transparent);
    border: 0;
    border-radius: 999px;
    font-size: .6875rem;
    font-weight: 650;
  }

  body .settings-action-btn,
  body button.settings-action-btn,
  body a.settings-action-btn {
    ${TINTED_GLASS}
    border: 0;
    border-radius: 999px;
    font-size: .9375rem;
    font-weight: 590;
    text-decoration: none;
    ${GROW_MOTION}
  }
  body .settings-action-btn:active { ${GROW_PRESSED} }
  body .settings-action-btn.settings-action-active { background: color-mix(in srgb, var(--tint) 28%, transparent); box-shadow: none; }

  /* Remind about the running draws. */
  body .remind-draw-item { background: var(--fill); border: 0; border-radius: var(--r-row); }
  body .remind-draw-title { color: var(--label); font-size: 1rem; font-weight: 600; }
  body .remind-draw-line { color: var(--label-2); font-size: .8125rem; }
  body .remind-draw-cover-fallback { color: var(--label-3); background: var(--fill); border-radius: .625rem; }
  body .remind-project-links-wrap { border-top: .5px solid var(--separator); }
  body .remind-project-links-title {
    color: var(--label-2);
    font-size: .8125rem;
    font-weight: 400;
    letter-spacing: .02em;
    text-transform: uppercase;
  }
`;

const FALLBACKS = `
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    body .pl-card,
    body .panel-sheet { background: var(--bg-elevated); }
    body .site-header,
    body .panel-bottom-bar { background: var(--bg); }
  }
  @media (prefers-reduced-motion: reduce) {
    body button, body .quick-action { transition: none; }
  }
`;

function getPanelPlannerStyles() {
  return [
    getPlannerTokens("body"),
    getPlannerCanvas("body", "body.mini-app-shell"),
    HEADER,
    SURFACES,
    STATS,
    SEGMENTS,
    DRAWS,
    WINNERS,
    FORMS,
    EMOJI,
    SHEETS,
    BOTTOM_BAR,
    LISTS,
    FALLBACKS,
  ].join("\n");
}

module.exports = { getPanelPlannerStyles };
