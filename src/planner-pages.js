// How the small screens look - a participant's profile, the results of a draw
// and the closed door an organiser without a subscription sees - drawn in the
// gz-planner design language, the same way as the join flow.
//
// Each screen keeps its old stylesheet for where things sit (with the look
// stripped out by css-layout-filter.js) and takes everything a person sees
// from here. These sheets go last on their pages.

const {
  getPlannerTokens,
  getPlannerCanvas,
  GLASS_CARD,
  FILLED_GLASS,
  ROUND_GLASS,
  SEGMENT_PILL,
  ICON_TILE,
  GROW_MOTION,
  GROW_PRESSED,
  CAPSULE,
} = require("./planner-theme");

// The theme switch on the design previews: round glass, like the planner's gear.
function previewToolbar(scope) {
  return `
  ${scope} .preview-toolbar .theme-toggle-btn {
    ${ROUND_GLASS}
    transition: transform .42s var(--spring);
  }
  ${scope} .preview-toolbar .theme-toggle-btn:active { transform: scale(1.1); }
`;
}

// A participant's profile: a contact card - the face, the name, one chip, and
// the figures on a single glass card.
function getProfilePlannerStyles() {
  const s = "body.profile-page";
  return `
  ${getPlannerTokens(s)}
  ${getPlannerCanvas(s, "body.profile-page.mini-app-shell")}
  ${previewToolbar(s)}

  ${s} .profile-back-btn {
    ${ROUND_GLASS}
    transition: transform .42s var(--spring);
  }
  ${s} .profile-back-btn:active { transform: scale(1.1); }

  ${s} .profile-avatar {
    border-radius: 50%;
    background: var(--fill);
    box-shadow: 0 .5rem 1.5rem rgba(0,0,0,.18);
  }
  ${s} .profile-avatar-fallback { color: #fff; font-size: 2.25rem; font-weight: 600; }

  ${s} .profile-name {
    color: var(--label);
    font-size: 1.625rem;
    font-weight: 700;
    letter-spacing: -.02em;
  }

  /* Open in Telegram: a small tinted circle beside the name. */
  ${s} .profile-tg-btn {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 16%, transparent);
    border: 0;
    border-radius: 50%;
    ${GROW_MOTION}
  }
  ${s} .profile-tg-btn:active { transform: scale(1.1); }

  ${s} .profile-username { color: var(--label-2); font-size: .9375rem; }

  ${s} .profile-level {
    word-spacing: .15em;
    color: var(--orange);
    background: color-mix(in srgb, var(--orange) 16%, transparent);
    border: 0;
    border-radius: 999px;
    font-size: .8125rem;
    font-weight: 650;
  }

  ${s} .profile-stats {
    ${GLASS_CARD}
    border-radius: var(--r-card);
    animation: planner-rise .42s var(--ease) both;
  }

  ${s} .profile-stat-value {
    color: var(--label);
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -.01em;
    font-variant-numeric: tabular-nums;
  }
  ${s} .profile-stat-value-date { font-size: 1rem; font-weight: 650; }

  ${s} .profile-stat-label,
  ${s} .profile-stat-label-wins { color: var(--label-2); font-size: .75rem; font-weight: 400; }
  ${s} .profile-stat-ico { color: var(--tint-ink); }

  /* Wins in the planner's orange rather than a painted gold. */
  ${s} .profile-wins-gold-text {
    background: none;
    -webkit-text-fill-color: currentColor;
    color: var(--orange);
  }
  ${s} .profile-wins-count { font-size: 1.375rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  ${s} .profile-wins-sum { font-size: .8125rem; font-weight: 500; }

  /* «Мои розыгрыши»: an inset grouped list under the figures - a caption
     above the card, rows with hairlines, the outcome as a tinted capsule. */
  ${s} .profile-draws { margin-top: 1.5rem; animation: planner-rise .42s var(--ease) both; }
  ${s} .profile-draws-head {
    display: flex;
    align-items: baseline;
    gap: .375rem;
    padding: 0 1rem .4375rem;
  }
  ${s} .profile-draws-title {
    margin: 0;
    color: var(--label-2);
    font-size: .8125rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: .02em;
  }
  ${s} .profile-draws-count { color: var(--label-3); font-size: .8125rem; font-variant-numeric: tabular-nums; }

  ${s} .profile-draws-list {
    ${GLASS_CARD}
    border-radius: var(--r-card);
    overflow: hidden;
  }
  ${s} .profile-draw-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: .75rem;
    padding: .6875rem 1rem;
  }
  ${s} .profile-draw-row + .profile-draw-row::before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    left: 1rem;
    height: .5px;
    background: var(--separator);
  }
  ${s} .profile-draw-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .125rem; }
  ${s} .profile-draw-prize {
    color: var(--label);
    font-size: 1.0625rem;
    font-weight: 590;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${s} .profile-draw-sub,
  ${s} .profile-draw-hint {
    color: var(--label-2);
    font-size: .8125rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${s} .profile-draw-hint { color: var(--orange); white-space: normal; }

  ${s} .profile-draw-chip {
    flex: none;
    padding: .25rem .625rem;
    border-radius: 999px;
    font-size: .8125rem;
    font-weight: 590;
    white-space: nowrap;
    color: var(--chip, var(--label-2));
    background: color-mix(in srgb, var(--chip, var(--gray)) 15%, transparent);
  }
  ${s} .profile-draw-chip.tone-tint { --chip: var(--tint-ink); }
  ${s} .profile-draw-chip.tone-green { --chip: var(--green); }
  ${s} .profile-draw-chip.tone-orange { --chip: var(--orange); }
  ${s} .profile-draw-chip.tone-red { --chip: var(--red); }
  ${s} .profile-draw-chip.tone-muted { color: var(--label-2); background: var(--fill); }

  ${s} .profile-draws-empty { margin: 0; padding: 1rem; color: var(--label-2); font-size: .9375rem; text-align: center; }

  /* "Show more": a plain tinted text button under the card, as in Settings. */
  ${s} .profile-draws-more {
    display: block;
    width: 100%;
    margin-top: .25rem;
    padding: .75rem 1rem;
    border: 0;
    background: none;
    color: var(--tint-ink);
    font: inherit;
    font-size: .9375rem;
    font-weight: 590;
    cursor: pointer;
  }
  ${s} .profile-draws-more:active { opacity: .5; }
`;
}

// The results of a draw: a header card with a segmented switch, then the
// people as one planner list with hairlines between the rows.
function getWinnersPlannerStyles() {
  const s = "body.winners-page";
  return `
  ${getPlannerTokens(s)}
  ${getPlannerCanvas(s, "body.winners-page.mini-app-shell")}
  ${previewToolbar(s)}

  ${s} .winners-header {
    ${GLASS_CARD}
    border-radius: var(--r-card);
    padding: 1rem;
    margin-bottom: .75rem;
  }

  ${s} .winners-title {
    color: var(--label);
    font-size: 1.25rem;
    font-weight: 680;
    letter-spacing: -.3px;
    line-height: 1.2;
  }

  ${s} .winners-header-icon {
    ${ICON_TILE}
    border-radius: .5rem;
  }

  /* Did I win: a tinted row, the icon on a circle of its own colour. */
  ${s} .winners-viewer-banner { border: 0; border-radius: var(--r-row); background: var(--fill); }
  ${s} .winners-viewer-banner-icon { border-radius: 50%; color: var(--label-2); background: var(--fill-strong); }
  ${s} .winners-viewer-banner-title { color: var(--label); font-size: .9375rem; font-weight: 650; }
  ${s} .winners-viewer-banner-sub { color: var(--label-2); font-size: .8125rem; font-weight: 400; }

  ${s} .winners-viewer-banner.is-won { background: color-mix(in srgb, var(--green) 14%, transparent); }
  ${s} .winners-viewer-banner.is-won .winners-viewer-banner-icon { color: #fff; background: var(--green); }
  ${s} .winners-viewer-banner.is-won .winners-viewer-banner-title { color: var(--green); }

  ${s} .winners-viewer-banner.is-none { background: color-mix(in srgb, var(--tint) 10%, transparent); }
  ${s} .winners-viewer-banner.is-none .winners-viewer-banner-icon { color: var(--on-tint); background: var(--tint); }

  /* Winners / participants: a segmented control. */
  ${s} .winners-stats {
    gap: 0;
    padding: .1875rem;
    border-radius: 999px;
    background: var(--fill);
  }
  ${s} .winners-stat-btn {
    justify-content: center;
    border: 0;
    border-radius: 999px;
    color: var(--label-2);
    background: none;
    box-shadow: none;
    transition: color .22s var(--ease), background .22s var(--ease), box-shadow .22s var(--ease);
  }
  ${s} .winners-stat-btn.is-active { ${SEGMENT_PILL} }
  ${s} .winners-stat-btn:focus-visible { outline: none; }
  ${s} .winners-stat-icon { color: currentColor; background: none; border-radius: 0; }
  ${s} .winners-stat-value { color: currentColor; font-size: .9375rem; font-weight: 590; }
  ${s} .winners-stat-btn:not(.is-active) .winners-stat-value { color: var(--label-2); font-weight: 550; }
  ${s} .winners-stat-btn:not(.is-active) .winners-stat-icon,
  ${s} .winners-stat-btn.is-active .winners-stat-icon { color: currentColor; background: none; }
  ${s} .winners-stat-btn.is-active .winners-stat-value { color: var(--label); }

  ${s} .winners-list {
    ${GLASS_CARD}
    gap: 0;
    border-radius: var(--r-card);
    overflow: hidden;
    animation: planner-rise .42s var(--ease) both;
  }

  ${s} .winners-row {
    position: relative;
    padding: .75rem 1rem;
    background: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    transform: none;
    animation: none;
    transition: background .15s var(--ease);
  }
  ${s} .winners-row + .winners-row::before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    left: calc(1rem + 38px + 10px);
    height: .5px;
    background: var(--separator);
  }
  ${s} .winners-row-link:active { background: var(--fill); }

  ${s} .winners-avatar { border: 0; border-radius: 50%; }
  ${s} .winners-avatar-img { border-radius: 50%; }
  ${s} .winners-avatar-fallback {
    color: #fff;
    border: 0;
    border-radius: 50%;
    background: linear-gradient(180deg, var(--avatar-grad-top, #7BD3FF) 0%, var(--avatar-grad-bottom, #2AABEE) 100%);
    font-size: 1.0625rem;
    font-weight: 600;
  }

  ${s} .winners-row-name { color: var(--label); font-size: 1.0625rem; font-weight: 590; }
  ${s} .winners-row-handle { color: var(--label-2); font-size: .8125rem; font-weight: 400; }
  ${s} .winners-row-chevron { color: var(--label-3); }

  ${s} .winners-row-prize-label { color: var(--label-2); font-size: .6875rem; font-weight: 400; }
  ${s} .winners-row-prize-value {
    color: var(--green);
    font-size: 1.0625rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  ${s} .winners-empty {
    ${GLASS_CARD}
    border-radius: var(--r-card);
  }
  ${s} .winners-empty-icon { border-radius: 50%; color: var(--label-2); background: var(--fill); }
  ${s} .winners-empty-title { color: var(--label-2); font-size: .9375rem; font-weight: 500; }

  ${s} .winners-app-status { color: var(--label-2); font-size: .9375rem; }
  ${s} .winners-app-error { color: var(--red); }
`;
}

// An organiser without a subscription: one glass card, a lock on a tinted
// tile, and one filled button to the site.
function getGatePlannerStyles() {
  const s = "body.gate-page";
  return `
  ${getPlannerTokens(s)}
  ${getPlannerCanvas(s, "body.gate-page.mini-app-shell")}
  ${previewToolbar(s)}

  ${s} .gate-card {
    ${GLASS_CARD}
    border-radius: var(--r-card);
    animation: planner-pop .42s var(--ease) both;
  }

  /* The ring was a painted conic gradient; the tile inside it is the mark. */
  ${s} .gate-lock-ring::before,
  ${s} .gate-lock-ring::after { background: none; }
  ${s} .gate-lock-icon {
    ${ICON_TILE}
    border-radius: 1.125rem;
    box-shadow: inset 0 .5px 0 rgba(255,255,255,.45), 0 .5rem 1.5rem color-mix(in srgb, var(--tint) 35%, transparent);
  }

  ${s} .gate-badge {
    color: var(--tint-ink);
    background: color-mix(in srgb, var(--tint) 14%, transparent);
    border: 0;
    border-radius: 999px;
    font-size: .8125rem;
    font-weight: 590;
  }

  ${s} .gate-title {
    color: var(--label);
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -.02em;
    line-height: 1.15;
  }
  ${s} .gate-lead { color: var(--label-2); font-size: .9375rem; font-weight: 400; }
  ${s} .gate-lead-site { color: var(--tint-ink); font-weight: 590; }

  ${s} .gate-cta-btn {
    ${CAPSULE}
    ${FILLED_GLASS}
    border: 0;
    ${GROW_MOTION}
  }
  ${s} .gate-cta-btn:active { ${GROW_PRESSED} }

  ${s} .gate-tip { border: 0; border-radius: var(--r-row); background: var(--fill); }
  ${s} .gate-tip-icon { border-radius: 50%; color: var(--label-2); background: var(--fill); }
  ${s} .gate-tip-text { color: var(--label-2); font-size: .8125rem; font-weight: 400; line-height: 1.4; }
`;
}

module.exports = { getProfilePlannerStyles, getWinnersPlannerStyles, getGatePlannerStyles };
