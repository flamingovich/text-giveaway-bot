// The gz-planner design system as the mini apps use it: palette, glass, radii,
// curves, the canvas and a clean start for every control. Each screen's own
// sheet builds on this and paints its parts with the recipes below, so there
// is one place where the look is decided.
//
// The light palette is Apple's system palette, which is also what Telegram for
// iOS is drawn in - the same #F2F2F7 grouped background, the same blue.
//
// The dark one is Telegram's own Night theme, the owner's choice from four
// mockups: the chat's deep slate for the page, the chat list's slate for the
// cards, the deep blue of Telegram's filled buttons, its sky-blue links, and
// the blue of a selected chat for the picked segment. Neither black nor blue,
// so the mini app sits in the messenger as if it were part of it. The owner
// turned down iOS black, a pale sky blue and a coloured glow behind the page -
// the one light across the top is as faint and as white as it was on black.
//
// Everything is scoped to a body selector the caller passes in, because the old
// stylesheets these sheets replace are scoped the same way and the new rules
// must reach at least their specificity.

function getPlannerTokens(scope) {
  return `
  ${scope} {
    --blue: #007AFF;  --green: #34C759;  --red: #FF3B30;
    --orange: #FF9500; --yellow: #FFCC00; --indigo: #5856D6;
    --purple: #AF52DE; --pink: #FF2D55;  --gray: #8E8E93;

    --bg: #F2F2F7;
    --bg-elevated: #FFFFFF;
    --fill: rgba(120,120,128,.12);
    --fill-strong: rgba(120,120,128,.20);
    --label: #000000;
    --label-2: rgba(60,60,67,.60);
    --label-3: rgba(60,60,67,.30);
    --separator: rgba(60,60,67,.18);
    --segment: #FFFFFF;
    --tint: var(--blue);
    --on-tint: #FFFFFF;
    --tint-ink: var(--tint);

    --glass-bg: rgba(255,255,255,.72);
    --glass-brd: rgba(255,255,255,.65);
    --glass-hi: rgba(255,255,255,.55);
    --glass-rim: rgba(255,255,255,.9);
    --lg-tint: .28; --lg-glow: .45; --lg-rim: 1;
    --glass-shadow: 0 1px 1px rgba(0,0,0,.04), 0 8px 28px rgba(0,0,0,.07);
    --blur: saturate(180%) blur(30px);
    --page-glow: radial-gradient(130% 55% at 50% -8%, rgba(255,255,255,.95), transparent 70%);

    --r-card: 1.625rem;
    --r-row: 1rem;
    --r-ctl: .875rem;
    --r-sheet: 2.125rem;

    --ease: cubic-bezier(.32,.72,0,1);
    --spring: cubic-bezier(.34,1.4,.64,1);
  }

  ${scope}.app-theme-dark {
    --blue: #0A84FF;  --green: #30D158;  --red: #FF453A;
    --orange: #FF9F0A; --yellow: #FFD60A; --indigo: #5E5CE6;
    --purple: #BF5AF2; --pink: #FF375F;  --gray: #98989D;

    --bg: #0E1621;
    --bg-elevated: #17212B;
    --fill: rgba(112,132,153,.16);
    --fill-strong: rgba(112,132,153,.26);
    --label: #F5F5F5;
    --label-2: #7D8FA3;
    --label-3: rgba(125,143,163,.55);
    --separator: rgba(112,132,153,.20);
    --segment: #2B5278;
    --tint: #2F6EA5;
    --on-tint: #FFFFFF;
    --tint-ink: #6AB3F3;
    /* Telegram's buttons are flat: the full glare over this blue washed it
       out to the pale sky blue the owner turned down. */
    --gloss: .12;
    --gloss-rim: .22;

    --glass-bg: rgba(23,33,43,.86);
    --glass-brd: rgba(255,255,255,.05);
    --glass-hi: rgba(255,255,255,.10);
    --glass-rim: rgba(255,255,255,.28);
    --lg-tint: .09; --lg-glow: .1; --lg-rim: .6;
    --glass-shadow: 0 1px 1px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.35);
    --page-glow: radial-gradient(130% 55% at 50% -8%, rgba(255,255,255,.05), transparent 70%);
  }
`;
}

// The canvas, the typeface, and a clean start for every control. The old
// stylesheets' resets went with their look, so buttons would otherwise fall
// back to the browser's grey bevel.
//
// The drifting doodles behind every screen are off: glass never read as glass
// over them, because there was always a busy picture directly behind it. The
// cards are glass lying on a plain canvas with one soft light across the top.
//
// The shell is the body as the old sheet addresses it (often with a second class),
// so the canvas outranks it. The control reset stays on the plain scope on
// purpose: at the shell's weight it would outrank a screen's own button rules.
function getPlannerCanvas(scope, shell = scope) {
  return `
  ${shell} {
    background: var(--bg);
    color: var(--label);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", system-ui, "Helvetica Neue", sans-serif;
    font-size: 1.0625rem;
    line-height: 1.29;
    letter-spacing: -.022em;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  ${shell}::before {
    background-color: var(--bg);
    background-image: var(--page-glow);
    background-repeat: no-repeat;
    background-size: 100% 100%;
    background-position: center top;
    animation: none;
    height: 100%;
  }

  ${scope} .app-desktop-bg { display: none; }

  /* No scrollbars anywhere: the mini app is scrolled by touch, and in Telegram
     on a computer the bars ate the edge of every sheet and list. Scrolling
     itself still works - with the wheel, the trackpad and the finger. */
  html, ${scope}, ${scope} * { scrollbar-width: none; }
  html::-webkit-scrollbar, ${scope}::-webkit-scrollbar, ${scope} *::-webkit-scrollbar { display: none; width: 0; height: 0; }

  /* What shows past the page when it is pulled beyond its end. The body's
     palette cannot reach up here, so the two canvas colours are named. */
  html { background-color: #F2F2F7; }
  html[data-app-theme="dark"] { background-color: #0E1621; }

  ${scope} button,
  ${scope} input,
  ${scope} select,
  ${scope} textarea {
    font: inherit;
    letter-spacing: inherit;
    color: inherit;
    border: 0;
    background: none;
  }

  ${scope} button { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  ${scope} a { color: var(--tint-ink); text-decoration: none; -webkit-tap-highlight-color: transparent; }
  ${scope} b, ${scope} strong { font-weight: 650; color: var(--label); }

  @keyframes planner-rise { from { opacity: 0; transform: translateY(.5rem); } }
  @keyframes planner-pop { from { opacity: 0; transform: scale(.94) translateY(.625rem); } }
`;
}

// Recipes - declaration blocks, so every screen can put the same material on
// its own selectors. They are the planner's own, carried over as they are.

// A card: frosted glass with a hairline edge and a soft shadow under it.
const GLASS_CARD = `
    background: var(--glass-bg);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    border: .5px solid var(--glass-brd);
    box-shadow: var(--glass-shadow);`;

// Filled surfaces paint with --tint-fill when a gradient is set there, and with
// the plain tint otherwise. It is read with a fallback on purpose: a button that
// sets its own --tint, like "Оплатил" in green, then paints with that - a fill
// declared on the body would have been worked out from the body's tint instead.
const TINT_FILL = "var(--tint-fill, linear-gradient(var(--tint), var(--tint)))";

// Filled glass: the tint with light falling on it from above, and two inset
// rims for the thickness of the pane. The dark theme dims the light (--gloss,
// --gloss-rim) almost to Telegram's flat buttons; the fallbacks are the light
// theme's full glare.
const FILLED_GLASS = `
    color: var(--on-tint);
    background:
      radial-gradient(120% 85% at 50% 0%, rgba(255,255,255,var(--gloss, .4)), rgba(255,255,255,0) 58%),
      ${TINT_FILL};
    box-shadow:
      inset 0 .0625rem .03125rem rgba(255,255,255,var(--gloss-rim, .6)),
      inset 0 -.0625rem .125rem rgba(0,0,0,.14),
      inset 0 0 0 .03125rem rgba(255,255,255,.28);`;

// A secondary button: a wash of its colour with the words in that colour -
// iOS's "tinted" button. It replaced grey glass with a white rim, which in the
// dark read as muddy plastic with an outline drawn round it. Only a faint lit
// top edge is left of the glass, enough to give the pane a thickness.
function tintedGlass(color = "var(--tint)", ink = color) {
  return `
    color: ${ink};
    background: color-mix(in srgb, ${color} 15%, transparent);
    box-shadow: inset 0 .0625rem 0 rgba(255,255,255,calc(var(--lg-glow) * .5));`;
}
const TINTED_GLASS = tintedGlass("var(--tint)", "var(--tint-ink)");

// The other road - "I'm not a referral", settings: plain grey with the words
// in the text colour, iOS's "gray" button. Not tinted, so it never competes
// with the action the screen is asking for.
const GRAY_GLASS = `
    color: var(--label);
    background: var(--fill);
    box-shadow: inset 0 .0625rem 0 rgba(255,255,255,calc(var(--lg-glow) * .5));`;

// A round glass button: the gear, the back arrow, the cross.
const ROUND_GLASS = `
    color: var(--label);
    background: rgba(255,255,255,var(--lg-tint));
    -webkit-backdrop-filter: blur(.5rem) saturate(1.9) brightness(1.04);
    backdrop-filter: blur(.5rem) saturate(1.9) brightness(1.04);
    border: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 .625rem rgba(255,255,255,var(--lg-glow)), 0 .25rem 1rem rgba(0,0,0,.12);`;

// A sheet or a dialog: nearly opaque, frosted, with a lit rim on its top edge.
const SHEET_GLASS = `
    background: color-mix(in oklab, var(--bg-elevated) 94%, transparent);
    -webkit-backdrop-filter: blur(1.5rem) saturate(1.6);
    backdrop-filter: blur(1.5rem) saturate(1.6);
    border: 0;
    box-shadow: inset 0 .0625rem 0 rgba(255,255,255,calc(var(--lg-rim) * .9)), 0 -8px 40px rgba(0,0,0,.28);`;

// The selected segment of a segmented control, as UISegmentedControl draws it.
const SEGMENT_PILL = `
    color: var(--label);
    background: var(--segment);
    box-shadow:
      inset 0 .0625rem .0625rem rgba(255,255,255,var(--lg-glow)),
      inset 0 0 0 .03125rem rgba(255,255,255,calc(var(--lg-rim) * .6)),
      0 2px 6px rgba(0,0,0,.14);`;

// An icon on a tinted tile, as in the iOS Settings list.
const ICON_TILE = `
    color: var(--on-tint);
    background: linear-gradient(180deg, color-mix(in oklab, var(--tint) 72%, #fff) 0%, var(--tint) 62%);
    box-shadow: inset 0 .5px 0 rgba(255,255,255,.45), 0 .5px 1px rgba(0,0,0,.08);`;

// Controls grow on press. Shrinking reads as the button backing away from the
// finger; growing reads as it rising to meet it - the one detail that most
// marks this design out.
const GROW_MOTION = `
    transition: transform .42s var(--spring), filter .2s var(--ease), background .18s var(--ease), opacity .18s var(--ease);`;
const GROW_PRESSED = `
    transform: scale(1.03);
    filter: brightness(1.06);
    transition-duration: .18s;`;

// Capsule type: the planner's button text.
const CAPSULE = `
    border-radius: 999px;
    font-size: 1.0625rem;
    font-weight: 590;
    letter-spacing: -.022em;
    text-decoration: none;`;

module.exports = {
  getPlannerTokens,
  getPlannerCanvas,
  GLASS_CARD,
  FILLED_GLASS,
  TINTED_GLASS,
  GRAY_GLASS,
  tintedGlass,
  TINT_FILL,
  ROUND_GLASS,
  SHEET_GLASS,
  SEGMENT_PILL,
  ICON_TILE,
  GROW_MOTION,
  GROW_PRESSED,
  CAPSULE,
};
