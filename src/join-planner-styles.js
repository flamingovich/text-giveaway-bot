// How the join flow looks, written from scratch in the gz-planner design language.
//
// Where everything sits comes from the old stylesheet with its look stripped out
// (css-layout-filter.js keeps position, size, spacing, visibility and state and
// drops colour, surface, edge, shadow and type). Everything a person actually
// sees is decided here and nowhere else, so there is nothing underneath to fight
// and no !important anywhere below.
//
// Values are the planner's own - palette, radii, curves, the glass recipe - and
// the recipes are carried over as they are rather than reinterpreted. The one
// idea that makes the whole thing work, and that is invisible in the CSS alone:
// the cards are glass lying on a pure black canvas with a single soft light
// across the top. Glass over a busy picture reads as muddy paint.

const {
  getPlannerTokens,
  getPlannerCanvas,
  FILLED_GLASS,
  TINTED_GLASS,
  GRAY_GLASS,
  TINT_FILL,
} = require("./planner-theme");

const TOKENS = getPlannerTokens("body.join-flow");
const BASE = getPlannerCanvas("body.join-flow", "body.join-flow.mini-app-shell");

// One object for every panel. Inner blocks are a fill on the card, not glass
// in glass - nesting glass turns both to soup.
const SURFACES = `
  body.join-flow .join-step-card,
  body.join-flow .join-progress {
    background: var(--glass-bg);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    border: .5px solid var(--glass-brd);
    border-radius: var(--r-card);
    box-shadow: var(--glass-shadow);
  }

  body.join-flow .join-step-card { padding: 1.25rem 1rem 1rem; }

  body.join-flow .join-step-head { border-bottom: .5px solid var(--separator); }
  body.join-flow .join-stack-divider { background: var(--separator); height: .5px; }

  body.join-flow .join-step-badge {
    font-size: .8125rem;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--label-2);
  }

  body.join-flow .join-step-title {
    font-size: 1.375rem;
    font-weight: 680;
    letter-spacing: -.3px;
    line-height: 1.18;
    color: var(--label);
  }

  body.join-flow .join-step-text {
    font-size: .9375rem;
    line-height: 1.4;
    color: var(--label-2);
  }

  body.join-flow #walletIntroText { color: var(--label); }
  body.join-flow #walletIntroText b { font-weight: 680; }

  body.join-flow .join-step-icon {
    border-radius: .5rem;
    color: var(--on-tint);
    background: linear-gradient(180deg, color-mix(in oklab, var(--tint) 72%, #fff) 0%, var(--tint) 62%);
    box-shadow: inset 0 .5px 0 rgba(255,255,255,.45), 0 .5px 1px rgba(0,0,0,.08);
  }

  body.join-flow .join-brand-logo img { border-radius: .75rem; }
`;

// The steps as the planner would draw them: small quiet marks, the current one
// in the tint, finished ones filled. No shimmer and no pulse - those were the
// animations the owner asked to be rid of.
const PROGRESS = `
  body.join-flow .join-progress-track { background: var(--fill-strong); border-radius: 999px; }
  body.join-flow .join-progress-fill {
    border-radius: inherit;
    background: ${TINT_FILL};
    transition: width .5s var(--ease);
  }
  body.join-flow .join-progress-fill::after { display: none; }

  body.join-flow .join-progress-node {
    border-radius: 50%;
    background: var(--bg-elevated);
    box-shadow: inset 0 0 0 1.5px var(--fill-strong);
    color: var(--label-2);
    font-size: .6875rem;
    font-weight: 650;
    transition: background .3s var(--ease), box-shadow .3s var(--ease), color .3s var(--ease), transform .42s var(--spring);
  }

  body.join-flow .join-progress-label {
    font-size: .6875rem;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--label-2);
  }

  body.join-flow .join-progress-dot.is-active .join-progress-node {
    background: var(--bg-elevated);
    box-shadow: inset 0 0 0 2px var(--tint);
    color: var(--tint-ink);
    transform: none;
  }
  body.join-flow .join-progress-dot.is-active:not(.is-done) .join-progress-node::after { display: none; }
  body.join-flow .join-progress-dot.is-active .join-progress-label { color: var(--label); font-weight: 650; }

  body.join-flow .join-progress-dot.is-done .join-progress-node {
    background: var(--tint);
    box-shadow: none;
    color: var(--on-tint);
  }
  body.join-flow .join-progress-dot.is-done .join-progress-label { color: var(--label); }
`;

// Capsules that grow on press. Shrinking reads as the button backing away from
// the finger; growing reads as it rising to meet it - the one detail that most
// marks this design out.
const BUTTONS = `
  body.join-flow .join-btn {
    text-decoration: none;
    border-radius: 999px;
    padding: .875rem 1.375rem;
    font-size: 1.0625rem;
    font-weight: 590;
    letter-spacing: -.022em;
    transition: transform .42s var(--spring), filter .2s var(--ease), background .18s var(--ease), opacity .18s var(--ease);
  }

  body.join-flow .join-btn:not(:disabled):not(.join-btn-locked):active {
    transform: scale(1.03);
    filter: brightness(1.06);
    transition-duration: .18s;
  }

  /* Filled glass: the tint with light falling on it from above, and two inset
     rims for the thickness of the pane. The rainbow that used to slide across
     the invite button is gone - it belonged to nothing else on screen. */
  body.join-flow .join-btn-primary:not(:disabled):not(.join-btn-locked),
  body.join-flow .join-btn-gradient:not(:disabled) {
    ${FILLED_GLASS}
  }

  /* The invite buttons used to open with "✨", and the old sheet moved their
     padding over to push the words back to the middle. The emoji is gone, so
     the padding is even again - left uneven, it put the words off centre. */
  body.join-flow .join-btn.join-btn-gradient:not(:disabled),
  body.join-flow .join-btn.join-btn-gradient:disabled { padding: .875rem 1.375rem; }

  /* Going somewhere - the project, the bot, the channel: a wash of the tint. */
  body.join-flow .join-btn-secondary,
  body.join-flow .join-btn-guide {
    ${TINTED_GLASS}
  }

  /* The link to the project's site, and the one to the channel: the first
     thing to do on each of those steps (on registration the confirm button
     stays locked until the site has been opened). The owner chose it filled,
     like the confirm button - no glow, no shine. The arrow after the words
     says "this leaves the app"; a spacer as wide as the arrow sits before
     them, so the words themselves stay in the middle. */
  body.join-flow .join-btn.join-btn-go {
    ${FILLED_GLASS}
  }
  body.join-flow .join-btn-go::before {
    content: "";
    position: static;
    inset: auto;
    z-index: auto;
    flex: none;
    width: 1.375rem;
    height: 1px;
    background: none;
    opacity: 1;
  }
  /* One line always: a long brand name shrinks the words (fitGoLabel in the
     page script) instead of breaking them onto a second line. */
  body.join-flow .join-btn-go .join-btn-label { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; }
  body.join-flow .join-btn.join-btn-go { padding-left: .875rem; padding-right: .875rem; }
  body.join-flow .join-btn-go .join-btn-go-arrow {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin-left: .375rem;
    color: currentColor;
  }

  /* The other road - "I'm not a referral", anonymous: plain grey. */
  body.join-flow .join-btn-outline {
    ${GRAY_GLASS}
  }

  body.join-flow .join-btn-guide[aria-expanded="true"] { background: var(--fill-strong); color: var(--label); }

  body.join-flow .join-btn-ghost { color: var(--tint-ink); background: none; font-size: .9375rem; font-weight: 590; border-radius: 999px; }
  body.join-flow .join-btn-ghost:active { opacity: .5; }

  body.join-flow .join-btn-primary:disabled,
  body.join-flow .join-btn-primary.join-btn-locked,
  body.join-flow .join-btn-gradient:disabled {
    color: var(--label-3);
    background: var(--fill);
    box-shadow: none;
  }

  body.join-flow .join-btn-secondary:disabled:not(.is-loading):not(.is-done) { opacity: .45; }
  body.join-flow .join-btn-secondary.join-btn-locked {
    color: var(--label-3);
    background: var(--fill);
    box-shadow: none;
  }

  /* The ⓘ beside "шанс": a small grey dot, not a button made of glass. */
  body.join-flow .join-done-info-btn {
    color: var(--label-2);
    background: var(--fill-strong);
    border-radius: 50%;
    transition: transform .42s var(--spring);
  }
  body.join-flow .join-done-info-btn:active { transform: scale(1.2); }

  /* Anonymous mode on: the button keeps its place and turns purple. */
  body.join-flow .join-done-anon-btn.is-on {
    color: var(--purple);
    background: color-mix(in srgb, var(--purple) 16%, transparent);
    box-shadow: none;
  }

  body.join-flow .join-btn.is-loading { opacity: .85; }

  body.join-flow .join-btn-primary.is-done,
  body.join-flow .join-btn-secondary.is-done {
    color: var(--green);
    background: color-mix(in srgb, var(--green) 16%, transparent);
    box-shadow: none;
  }

  body.join-flow .join-btn-ico,
  body.join-flow .join-btn-spinner { color: currentColor; }

  /* The ✕: round glass, grows a little more than a capsule does. */
  body.join-flow .join-guide-sheet-close,
  body.join-flow .join-boost-close {
    color: var(--label);
    background: rgba(255,255,255,var(--lg-tint));
    -webkit-backdrop-filter: blur(.5rem) saturate(1.9) brightness(1.04);
    backdrop-filter: blur(.5rem) saturate(1.9) brightness(1.04);
    border-radius: 50%;
    box-shadow: inset 0 0 .625rem rgba(255,255,255,var(--lg-glow)), 0 .25rem 1rem rgba(0,0,0,.12);
    font-size: 1.25rem;
    font-weight: 400;
    transition: transform .42s var(--spring), filter .2s var(--ease);
  }

  body.join-flow .join-guide-sheet-close:active,
  body.join-flow .join-boost-close:active {
    transform: scale(1.1);
    filter: brightness(1.06);
    transition-duration: .18s;
  }

  body.join-flow .join-guide-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: .375rem;
    color: var(--tint-ink);
    font-size: .9375rem;
    font-weight: 590;
    text-decoration: none;
  }
  body.join-flow .join-guide-link svg { flex: none; width: 1.125rem; height: 1.125rem; }
  body.join-flow .join-guide-link:active { opacity: .5; }
`;

const INPUTS = `
  body.join-flow .join-input,
  body.join-flow .join-id-input-row {
    background: var(--fill);
    border-radius: var(--r-ctl);
    box-shadow: inset 0 0 0 .5px transparent;
    color: var(--label);
    font-size: 1.0625rem;
    transition: box-shadow .2s var(--ease), background .2s var(--ease);
  }

  body.join-flow .join-input:focus,
  body.join-flow .join-id-input-row:focus-within {
    outline: none;
    background: var(--fill-strong);
    box-shadow: inset 0 0 0 1.5px var(--tint);
  }

  /* Inside the row the row is the field; the input is just its text. */
  body.join-flow .join-id-input-row .join-input.join-input-id {
    background: none;
    box-shadow: none;
    font-weight: 590;
    letter-spacing: .02em;
  }
  body.join-flow .join-id-input-row .join-input.join-input-id:focus { background: none; box-shadow: none; }

  body.join-flow .join-input::placeholder { color: var(--label-3); font-weight: 400; letter-spacing: normal; opacity: 1; }

  body.join-flow .join-id-prefix { color: var(--label-2); font-size: 1.0625rem; font-weight: 590; }
  body.join-flow .join-id-input-row-no-prefix .join-input.join-input-id { font-size: 1rem; letter-spacing: .01em; }
  body.join-flow .join-input.join-input-id.join-input-id-pokerdom { font-weight: 400; letter-spacing: normal; }

  /* Paste beside the wallet field: a tinted square with the field's corners. */
  body.join-flow .join-paste-btn {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 16%, transparent);
    border-radius: var(--r-ctl);
    transition: transform .42s var(--spring);
  }
  body.join-flow .join-paste-btn:active { transform: scale(1.06); }
  body.join-flow .join-id-paste-btn { color: var(--tint-ink); }
  body.join-flow .join-id-paste-btn:active { opacity: .5; }

  body.join-flow .join-field-label {
    color: var(--label-2);
    font-size: .8125rem;
    font-weight: 400;
  }
  body.join-flow #registrationProjectIdMode .join-field-label { color: var(--label); font-size: 1.0625rem; }
  /* No caption beside the ID field any more: the field is the whole row. */
  body.join-flow #registrationProjectIdMode .join-trc20-field-compact .join-id-input-row { flex: 1 1 auto; width: 100%; }

  body.join-flow .join-field-status { font-size: .8125rem; border-radius: var(--r-ctl); }
  body.join-flow .join-field-status-error { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
  body.join-flow .join-field-status-loading { color: var(--label-2); background: none; }

  /* A wrong network loses the prize, so this is the red callout, not a hint.
     It sits in its own tinted block, which needs room around the words. */
  body.join-flow .join-network-warning {
    padding: .625rem .75rem;
    color: var(--red);
    background: color-mix(in srgb, var(--red) 12%, transparent);
    border-radius: var(--r-ctl);
    font-size: .8125rem;
    font-weight: 500;
    line-height: 1.4;
  }
  body.join-flow .join-network-warning b { color: inherit; font-weight: 700; }
`;

const REFERRAL = `
  body.join-flow .join-ref-status { border-radius: var(--r-row); background: var(--fill); font-size: .875rem; line-height: 1.4; color: var(--label-2); }
  body.join-flow .join-ref-status-icon { color: var(--on-tint); background: var(--tint); border-radius: 50%; }
  body.join-flow .join-ref-status-text { color: var(--label); font-weight: 590; }

  body.join-flow .join-ref-status-ok { background: color-mix(in srgb, var(--green) 14%, transparent); }
  body.join-flow .join-ref-status-ok .join-ref-status-icon { color: #fff; background: var(--green); }
  body.join-flow .join-ref-status-error { background: color-mix(in srgb, var(--red) 12%, transparent); }
  body.join-flow .join-ref-status-error .join-ref-status-icon { color: #fff; background: var(--red); }
`;

// The channel step and the permission step. The step card is already the glass;
// the panel inside is only its content - a second surface there reads as a box
// inside a box.
const STEPS = `
  body.join-flow .join-channel-panel { background: none; }

  /* The round badge above the name, tinted like an iOS permission prompt. */
  body.join-flow .join-channel-avatar-wrap {
    border-radius: 50%;
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 16%, transparent);
  }
  body.join-flow .join-channel-avatar { border-radius: 50%; }
  body.join-flow .join-channel-avatar-fallback { font-size: 1.875rem; line-height: 1; }

  body.join-flow .join-channel-name {
    color: var(--label);
    font-size: 1.25rem;
    font-weight: 680;
    letter-spacing: -.3px;
  }
  body.join-flow .join-channel-lead { color: var(--label-2); font-size: .9375rem; line-height: 1.4; }

  body.join-flow .join-notify-error { color: var(--red); font-size: .8125rem; }
`;

// The success screen. The mark keeps its landing animation - that one carries
// meaning - but is drawn in the planner's green as filled glass.
const DONE = `
  /* The mark's box is taller than its disc, to give the rings room, and the
     card, its body and the panel each added their own top padding on top of
     that - some fifty points of nothing above the tick. Now the disc sits as
     far from the card's top edge as the content does from its sides. */
  body.join-flow .join-done-card { padding-top: .75rem; }
  body.join-flow .join-done-card .join-step-body,
  body.join-flow .join-done-panel { padding-top: 0; }
  body.join-flow .join-done-mark { margin-top: -.5rem; }

  body.join-flow .join-done-mark-disc,
  body.join-flow .join-done-mark-halo,
  body.join-flow .join-done-mark-sparks i::before { border-radius: 50%; }

  /* The tick is drawn by animating its dash, so the dash values are what make
     the draw work - not decoration. */
  body.join-flow .join-done-mark-tick {
    stroke: #fff;
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }

  body.join-flow .join-done-mark-disc {
    color: #fff;
    background:
      radial-gradient(120% 85% at 50% 0%, rgba(255,255,255,var(--gloss, .4)), rgba(255,255,255,0) 58%),
      var(--green);
    box-shadow:
      inset 0 .0625rem .03125rem rgba(255,255,255,var(--gloss-rim, .6)),
      inset 0 -.0625rem .125rem rgba(0,0,0,.14),
      0 .5rem 1.5rem color-mix(in srgb, var(--green) 35%, transparent);
  }
  /* A still glow behind the mark; the old one breathed in a loop forever. */
  body.join-flow .join-done-mark-halo {
    background: radial-gradient(closest-side, color-mix(in srgb, var(--green) 30%, transparent), transparent);
    animation: none;
  }
  body.join-flow .join-done-mark-wave { border: 1.5px solid color-mix(in srgb, var(--green) 55%, transparent); border-radius: 50%; }
  body.join-flow .join-done-mark-sparks i::before { background: var(--green); }
  body.join-flow .join-done-mark-sparks i:nth-child(even)::before { background: var(--tint); }

  body.join-flow .join-done-title {
    color: var(--label);
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -.02em;
    line-height: 1.1;
  }

  body.join-flow .join-done-sub { color: var(--label-2); font-size: .9375rem; }

  /* The planner's figure row: big tabular number, small grey caption, all on
     one fill, divided by hairlines rather than boxed separately. */
  body.join-flow .join-done-stats {
    background: var(--fill);
    border-radius: var(--r-row);
  }
  body.join-flow .join-done-stat-col + .join-done-stat-col { border-left: .5px solid var(--separator); }
  body.join-flow .join-done-stat-value {
    color: var(--label);
    font-size: 1.1875rem;
    font-weight: 700;
    letter-spacing: -.01em;
    font-variant-numeric: tabular-nums;
  }
  body.join-flow .join-done-stat-value-accent { color: var(--tint-ink); }
  body.join-flow .join-done-stat-value-timer { color: var(--label); }
  body.join-flow .join-done-stat-label { color: var(--label-2); font-size: .75rem; font-weight: 400; }

  body.join-flow .join-done-anon-icon { color: currentColor; }
  body.join-flow .join-done-anon-note { color: var(--label-2); font-size: .8125rem; }
  body.join-flow .join-done-anon-note-error { color: var(--red); }

  body.join-flow .join-done-tips { background: var(--fill); border-radius: var(--r-row); }
  body.join-flow .join-done-tip + .join-done-tip { border-top: .5px solid var(--separator); }
  body.join-flow .join-done-tip-icon { color: var(--label-2); }
  body.join-flow .join-done-tip-text { color: var(--label-2); font-size: .8125rem; line-height: 1.35; }

  /* Participants as a planner list: one grouped block, rows divided by
     hairlines that start where the text starts, as in iOS lists. */
  body.join-flow .join-done-participants-title {
    color: var(--label-2);
    font-size: .8125rem;
    font-weight: 400;
    text-transform: none;
    padding: 0 .25rem;
  }
  body.join-flow .join-done-list {
    gap: 0;
    padding-right: 0;
    background: var(--fill);
    border-radius: var(--r-row);
  }
  body.join-flow .join-done-row {
    position: relative;
    padding: .5rem .875rem;
    background: none;
    border-radius: 0;
    transition: background .15s var(--ease);
  }
  body.join-flow .join-done-row + .join-done-row::before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    left: calc(.875rem + 34px + 10px);
    height: .5px;
    background: var(--separator);
  }
  body.join-flow .join-done-row-link:active { background: var(--fill); }
  body.join-flow .join-done-row-you { background: color-mix(in srgb, var(--tint) 10%, transparent); }

  body.join-flow .join-done-row-name { color: var(--label); font-size: .9375rem; font-weight: 590; }
  body.join-flow .join-done-row-link .join-done-row-name { color: var(--label); }
  body.join-flow .join-done-row-handle { color: var(--label-2); font-size: .8125rem; }
  body.join-flow .join-done-row-handle-muted { color: var(--label-3); }
  body.join-flow .join-done-row-chevron,
  body.join-flow .join-done-row-link .join-done-row-chevron { color: var(--label-3); }

  body.join-flow .join-done-you {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 16%, transparent);
    border-radius: 999px;
    font-size: .6875rem;
    font-weight: 650;
  }

  /* Telegram's own avatar gradients, so a face-less row still looks like a
     Telegram contact. */
  body.join-flow .join-done-avatar { border-radius: 50%; }
  body.join-flow .join-done-avatar-fallback {
    color: #fff;
    background: linear-gradient(180deg, var(--avatar-grad-top, #7BD3FF) 0%, var(--avatar-grad-bottom, #2AABEE) 100%);
    font-size: .875rem;
    font-weight: 650;
  }
`;

// The permission step's bell lands and rings the way the tick on the done step
// lands and draws: the same filled-glass disc with two rings going out from it
// and sparks, then the bell swings on its hook and the clapper lags behind it.
// The taps played with it are in join-miniapp.js (NOTIFY_HAPTIC_BEATS) and are
// timed to these keyframes - move one, move the other.
const NOTIFY = `
  body.join-flow .join-notify-mark {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
  }
  body.join-flow .join-notify-mark > span { grid-area: 1 / 1; }

  body.join-flow .join-notify-mark .join-notify-mark-disc {
    color: var(--on-tint);
    background:
      radial-gradient(120% 85% at 50% 0%, rgba(255,255,255,var(--gloss, .4)), rgba(255,255,255,0) 58%),
      ${TINT_FILL};
    box-shadow:
      inset 0 .0625rem .03125rem rgba(255,255,255,var(--gloss-rim, .6)),
      inset 0 -.0625rem .125rem rgba(0,0,0,.14),
      0 .5rem 1.5rem color-mix(in srgb, var(--tint) 38%, transparent);
  }
  body.join-flow .join-notify-mark .join-notify-mark-disc svg { color: var(--on-tint); overflow: visible; }

  /* Swings from the hook at the top of the bell, in the icon's own units. */
  body.join-flow .join-notify-bell { transform-origin: 12px 2px; }

  body.join-flow .join-notify-mark-wave {
    width: 72px;
    height: 72px;
    box-sizing: border-box;
    border: 1.5px solid color-mix(in srgb, var(--tint) 60%, transparent);
    border-radius: 50%;
    opacity: 0;
  }

  body.join-flow .join-notify-mark-sparks { position: relative; width: 0; height: 0; }
  body.join-flow .join-notify-mark-sparks i { position: absolute; left: 0; top: 0; }
  body.join-flow .join-notify-mark-sparks i::before {
    content: "";
    position: absolute;
    left: -3px;
    top: -3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--tint);
    opacity: 0;
  }
  body.join-flow .join-notify-mark-sparks i:nth-child(even)::before {
    left: -2px;
    top: -2px;
    width: 4px;
    height: 4px;
    background: var(--yellow);
  }
  body.join-flow .join-notify-mark-sparks i:nth-child(2) { transform: rotate(45deg); }
  body.join-flow .join-notify-mark-sparks i:nth-child(3) { transform: rotate(90deg); }
  body.join-flow .join-notify-mark-sparks i:nth-child(4) { transform: rotate(135deg); }
  body.join-flow .join-notify-mark-sparks i:nth-child(5) { transform: rotate(180deg); }
  body.join-flow .join-notify-mark-sparks i:nth-child(6) { transform: rotate(225deg); }
  body.join-flow .join-notify-mark-sparks i:nth-child(7) { transform: rotate(270deg); }
  body.join-flow .join-notify-mark-sparks i:nth-child(8) { transform: rotate(315deg); }

  body.join-flow .join-notify-mark.is-playing .join-notify-mark-disc {
    animation: join-notify-pop .5s cubic-bezier(.34,1.56,.64,1) .1s both;
  }
  body.join-flow .join-notify-mark.is-playing .join-notify-mark-wave {
    animation: join-notify-wave 1s cubic-bezier(.2,.6,.35,1) .38s both;
  }
  body.join-flow .join-notify-mark.is-playing .join-notify-mark-wave + .join-notify-mark-wave { animation-delay: .6s; }
  body.join-flow .join-notify-mark.is-playing .join-notify-mark-sparks i::before {
    animation: join-notify-spark .8s cubic-bezier(.2,.7,.3,1) .45s both;
  }
  body.join-flow .join-notify-mark.is-playing .join-notify-bell {
    animation: join-notify-ring 1.1s ease-in-out .5s both;
  }
  body.join-flow .join-notify-mark.is-playing .join-notify-clapper {
    animation: join-notify-clapper 1.1s ease-in-out .54s both;
  }

  @keyframes join-notify-pop {
    from { opacity: 0; transform: scale(.3); }
    60% { opacity: 1; }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes join-notify-wave {
    0% { opacity: 0; transform: scale(1); }
    12% { opacity: .75; }
    100% { opacity: 0; transform: scale(1.75); }
  }
  @keyframes join-notify-spark {
    0% { opacity: 0; transform: translateY(-30px) scale(.4); }
    25% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-54px) scale(1); }
  }
  /* A bell struck once: a wide first swing, dying away. */
  @keyframes join-notify-ring {
    0% { transform: rotate(0); }
    10% { transform: rotate(20deg); }
    24% { transform: rotate(-17deg); }
    38% { transform: rotate(13deg); }
    52% { transform: rotate(-9deg); }
    66% { transform: rotate(5deg); }
    80% { transform: rotate(-2deg); }
    100% { transform: rotate(0); }
  }
  /* The clapper hangs inside the bell and lags a beat behind each swing. */
  @keyframes join-notify-clapper {
    0% { transform: translateX(0); }
    10% { transform: translateX(1.6px); }
    24% { transform: translateX(-1.4px); }
    38% { transform: translateX(1px); }
    52% { transform: translateX(-.7px); }
    66% { transform: translateX(.35px); }
    100% { transform: translateX(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    body.join-flow .join-notify-mark.is-playing .join-notify-mark-disc,
    body.join-flow .join-notify-mark.is-playing .join-notify-mark-wave,
    body.join-flow .join-notify-mark.is-playing .join-notify-mark-sparks i::before,
    body.join-flow .join-notify-mark.is-playing .join-notify-bell,
    body.join-flow .join-notify-mark.is-playing .join-notify-clapper { animation: none; }
  }
`;

// Sheets slide up from the bottom, frosted, with the planner's larger top
// radius and a lit rim along their upper edge.
const SHEETS = `
  body.join-flow .join-guide-sheet-backdrop,
  body.join-flow .join-boost-backdrop,
  body.join-flow .join-done-info-backdrop,
  body.join-flow .join-unregistered-modal {
    background: rgba(0,0,0,.4);
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
  }

  /* Only the card is the surface; .join-boost-sheet around it is just the
     positioned frame that slides, and painting both drew two edges. */
  body.join-flow .join-guide-sheet-card,
  body.join-flow .join-boost-card,
  body.join-flow .join-done-info-card {
    background: color-mix(in oklab, var(--bg-elevated) 94%, transparent);
    -webkit-backdrop-filter: blur(1.5rem) saturate(1.6);
    backdrop-filter: blur(1.5rem) saturate(1.6);
    border-radius: var(--r-sheet);
    box-shadow: inset 0 .0625rem 0 rgba(255,255,255,calc(var(--lg-rim) * .9)), 0 -8px 40px rgba(0,0,0,.28);
    color: var(--label);
  }

  body.join-flow .join-guide-sheet-title,
  body.join-flow .join-boost-title,
  body.join-flow .join-done-info-title {
    color: var(--label);
    font-size: 1.25rem;
    font-weight: 680;
    letter-spacing: -.3px;
  }

  body.join-flow .join-boost-text,
  body.join-flow .join-done-info-text,
  body.join-flow .join-guide-step { color: var(--label-2); font-size: .9375rem; line-height: 1.4; }
  body.join-flow .join-guide-step b,
  body.join-flow .join-boost-text b { color: var(--label); }

  body.join-flow .join-guide-step-num {
    color: var(--on-tint);
    background: var(--tint);
    border-radius: 50%;
    font-size: .75rem;
    font-weight: 650;
  }
  body.join-flow .join-guide-heading { color: var(--label); font-size: .9375rem; font-weight: 650; }
  body.join-flow .join-guide-img-wrap { border-radius: var(--r-row); background: var(--fill); }
  body.join-flow .join-guide-img { border-radius: var(--r-row); }

  body.join-flow .join-boost-counter { color: var(--tint-ink); font-size: .9375rem; font-weight: 650; }

  /* The +50% chip: the tint as a small glass capsule, not a pink one. */
  body.join-flow .join-boost-badge {
    color: var(--on-tint);
    background:
      radial-gradient(120% 85% at 50% 0%, rgba(255,255,255,var(--gloss, .4)), rgba(255,255,255,0) 58%),
      ${TINT_FILL};
    border-radius: 999px;
    font-size: .9375rem;
    font-weight: 700;
    box-shadow: inset 0 .0625rem .03125rem rgba(255,255,255,var(--gloss-rim, .6)), 0 .25rem .875rem rgba(0,0,0,.18);
  }

  body.join-flow .join-boost-link-preview,
  body.join-flow .join-boost-link-notice {
    background: var(--fill);
    border-radius: var(--r-ctl);
    color: var(--label-2);
    font-size: .8125rem;
  }
  body.join-flow .join-boost-link-notice.is-ok { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
`;

// The stand-in captcha drawn the planner's way: a row with a check.
const CAPTCHA = `
  /* The widget ships its own grey outlines in the page's inline styles; the
     row needs none - the fill is the edge. */
  body.join-flow .mock-recaptcha {
    border: 0;
    box-shadow: none;
    background: var(--fill);
    border-radius: var(--r-row);
    color: var(--label);
  }
  body.join-flow .mock-recaptcha-check {
    border: 0;
    background: var(--bg-elevated);
    border-radius: .375rem;
    box-shadow: inset 0 0 0 1.5px var(--fill-strong);
  }
  body.join-flow .mock-recaptcha.is-checked .mock-recaptcha-check { background: var(--tint); box-shadow: none; }
  body.join-flow .mock-recaptcha-label { color: var(--label); font-size: 1.0625rem; font-weight: 400; }
  body.join-flow .mock-recaptcha-brand-text { color: var(--label-2); font-size: .6875rem; }
  body.join-flow .mock-recaptcha-mark { color: var(--on-tint); }
  body.join-flow .mock-recaptcha.is-error { box-shadow: inset 0 0 0 1.5px var(--red); }
`;

const LOADING = `
  body.join-flow .msg { border-radius: var(--r-row); font-size: .875rem; line-height: 1.4; }
  body.join-flow .msg.error { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }
  body.join-flow .msg.ok { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }

  body.join-flow .loading { color: var(--label-2); font-size: .9375rem; }
  body.join-flow .loading-retry-text { color: var(--label-2); font-size: .8125rem; }
`;

// The design switcher is a developer tool, but it sits on the screen being
// judged, so it speaks the same language as everything around it.
const PREVIEW = `
  /* By id: the shell styles every button with a long :not() chain whose
     specificity no class selector reaches, and this toolbar is not a join button. */
  #previewToolbar #previewNav button {
    color: var(--label);
    background: var(--fill);
    border: 0;
    border-radius: 999px;
    box-shadow: none;
    font-size: .8125rem;
    font-weight: 590;
    transition: transform .42s var(--spring), background .18s var(--ease);
  }
  #previewToolbar #previewNav button.active { color: var(--on-tint); background: ${TINT_FILL}; }
  #previewToolbar #previewNav button:active { transform: scale(1.05); }

  /* The theme switch beside it: a round glass button, like the planner's gear. */
  #previewToolbar .theme-toggle-btn {
    border: 0;
    border-radius: 50%;
    color: var(--label);
    background: rgba(255,255,255,var(--lg-tint));
    -webkit-backdrop-filter: blur(.5rem) saturate(1.9) brightness(1.04);
    backdrop-filter: blur(.5rem) saturate(1.9) brightness(1.04);
    box-shadow: inset 0 0 .625rem rgba(255,255,255,var(--lg-glow)), 0 .25rem 1rem rgba(0,0,0,.12);
    transition: transform .42s var(--spring);
  }
  #previewToolbar .theme-toggle-btn:active { transform: scale(1.1); }

`;

// "Проверить ID" waits under the ID field until there is something to check,
// then opens the way a row opens in the planner: the space grows on the
// planner's curve while the button fades in and settles. The grid row moves
// from 0fr to 1fr, which is how a height can animate to its natural size. While
// closed, the negative margin takes back the stack's 10px gap above it, so the
// closed reveal leaves no hole. The inner box clips the growing height, with a
// little room at the sides for the grow-on-press.
const REVEAL = `
  body.join-flow .join-reveal {
    display: grid;
    grid-template-rows: 0fr;
    margin-top: -10px;
    opacity: 0;
    transform: translateY(-.375rem) scale(.98);
    pointer-events: none;
    transition:
      grid-template-rows .42s var(--ease),
      margin-top .42s var(--ease),
      opacity .3s var(--ease),
      transform .42s var(--ease);
  }
  body.join-flow .join-reveal.is-open {
    grid-template-rows: 1fr;
    margin-top: 0;
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
  body.join-flow .join-reveal-inner {
    min-height: 0;
    overflow: hidden;
    margin: 0 -.5rem;
    padding: 0 .5rem;
  }
  @media (prefers-reduced-motion: reduce) {
    body.join-flow .join-reveal { transition: none; }
  }
`;

// Steps cross-fade with a short rise instead of sliding a card-width sideways -
// the slide was what made the flow feel like a slideshow. The duration stays at
// 0.34s: showStep waits exactly that long before tidying up the old card.
const MOTION = `
  body.join-flow .join-step-card {
    transform: translateY(.625rem);
    transition: opacity .34s var(--ease), transform .34s var(--ease);
  }
  body.join-flow .join-step-card.is-active { transform: none; }
  body.join-flow .join-step-card.is-leaving { transform: translateY(-.375rem); }

  /* The old sideways slide needed the viewport to clip sideways. The steps now
     rise in place, and that clip only cut the cards' shadows into a band with
     hard edges under every card in the light theme. */
  body.join-flow .join-steps-viewport { overflow: visible; }

  /* The body still clips stray wide content, but with room at the sides - out
     to the card's own edge - so a full-width capsule can grow on press without
     losing its rounded ends, and a glow under a button is not cut square.
     "clip" rather than the old "hidden": hidden sideways also turns the height
     into a scroll box, which cut off the rings and sparks of the marks at the
     top of a card. Browsers without clip keep the old hidden. */
  body.join-flow .join-step-body {
    overflow-x: clip;
    width: auto;
    max-width: none;
    margin-left: -1rem;
    margin-right: -1rem;
    padding-left: 1rem;
    padding-right: 1rem;
  }

  @media (prefers-reduced-motion: reduce) {
    body.join-flow .join-step-card,
    body.join-flow .join-step-card.is-leaving { transition: none; transform: none; }
    body.join-flow .join-btn { transition: none; }
    body.join-flow .join-btn:active { transform: none; }
  }
`;

// The screenshot step: the person shows their profile on the project instead
// of typing the ID, and the bot reads it. The upload is a dashed tinted well;
// while the picture is read a light passes over it, which is the "wait" and
// stops with reduced motion.
const SHOT = `
  body.join-flow .join-shot,
  body.join-flow .join-shot-view { display: flex; flex-direction: column; gap: .75rem; }
  body.join-flow .join-shot-note { margin: .125rem .5rem 0; color: var(--label-2); font-size: .8125rem; line-height: 1.4; text-align: center; }
  body.join-flow .join-shot-lead { margin: 0; color: var(--label); font-size: .9375rem; font-weight: 500; line-height: 1.35; text-align: center; }

  body.join-flow .join-shot-drop {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .25rem;
    margin: 0;
    padding: 1.125rem 1rem;
    border: 1.5px dashed color-mix(in srgb, var(--tint) 55%, transparent);
    border-radius: var(--r-row);
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 8%, transparent);
    text-align: center;
    cursor: pointer;
    transition: background .2s var(--ease), transform .3s var(--spring);
  }
  body.join-flow .join-shot-drop:active { transform: scale(.98); background: color-mix(in srgb, var(--tint) 14%, transparent); }
  body.join-flow .join-shot-drop input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    opacity: 0;
    cursor: pointer;
  }
  body.join-flow .join-shot-drop-icon { width: 1.75rem; height: 1.75rem; }
  body.join-flow .join-shot-drop-title { font-size: 1.0625rem; font-weight: 600; }
  body.join-flow .join-shot-drop-hint { color: var(--label-2); font-size: .75rem; }
  /* Right under the request it explains, a little closer than the gap. */
  body.join-flow .join-shot-view .join-guide-link { align-self: center; margin-top: -.375rem; }

  body.join-flow .join-shot-thumb {
    position: relative;
    width: 7.5rem;
    height: 12rem;
    margin: 0 auto;
    overflow: hidden;
    border-radius: .875rem;
    background: var(--fill);
    box-shadow: 0 0 0 .5px var(--separator);
  }
  body.join-flow .join-shot-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  body.join-flow .join-shot-scan {
    position: absolute;
    left: 0;
    right: 0;
    top: -2.5rem;
    height: 2.5rem;
    background: linear-gradient(transparent, color-mix(in srgb, var(--tint) 45%, transparent), transparent);
    animation: join-shot-scan 1.4s var(--ease) infinite;
  }
  @keyframes join-shot-scan { to { top: 100%; } }

  body.join-flow .join-shot-result {
    display: flex;
    align-items: center;
    gap: .875rem;
    padding: .75rem;
    border-radius: var(--r-row);
    background: var(--fill);
  }
  body.join-flow .join-shot-result-thumb {
    flex: none;
    width: 3rem;
    height: 4.5rem;
    border-radius: .5rem;
    object-fit: cover;
    object-position: top;
    background: var(--fill-strong);
  }
  body.join-flow .join-shot-result-text { display: grid; gap: .125rem; min-width: 0; }
  body.join-flow .join-shot-result-label { color: var(--label-2); font-size: .8125rem; }
  body.join-flow .join-shot-result-id {
    color: var(--label);
    font: 650 1.375rem/1.2 ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    word-break: break-all;
  }

  body.join-flow .join-shot-error { display: grid; justify-items: center; gap: .375rem; padding: .25rem .5rem .5rem; text-align: center; }
  body.join-flow .join-shot-error-mark {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    color: var(--red);
    background: color-mix(in srgb, var(--red) 14%, transparent);
    font-size: 1.25rem;
    font-weight: 800;
  }
  body.join-flow .join-shot-error-mark-info {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 14%, transparent);
    font-family: Georgia, "Times New Roman", serif;
    font-style: italic;
  }
  body.join-flow .join-shot-error-title { color: var(--label); font-size: 1.0625rem; font-weight: 650; }
  body.join-flow .join-shot-error-text { margin: 0; color: var(--label-2); font-size: .875rem; line-height: 1.4; }

  @media (prefers-reduced-motion: reduce) {
    body.join-flow .join-shot-scan { animation: none; top: 0; height: 100%; opacity: .35; }
  }
`;

// Without backdrop-filter, glass is just a see-through fill - give it a solid
// one so text keeps its contrast.
const FALLBACKS = `
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    body.join-flow .join-step-card,
    body.join-flow .join-progress,
    body.join-flow .join-guide-sheet-card,
    body.join-flow .join-boost-card,
    body.join-flow .join-done-info-card { background: var(--bg-elevated); }
  }
`;

function getJoinPlannerStyles() {
  return [TOKENS, BASE, SURFACES, PROGRESS, BUTTONS, INPUTS, REFERRAL, STEPS, NOTIFY, DONE, SHEETS, CAPTCHA, LOADING, PREVIEW, REVEAL, SHOT, MOTION, FALLBACKS].join("\n");
}

module.exports = { getJoinPlannerStyles };
