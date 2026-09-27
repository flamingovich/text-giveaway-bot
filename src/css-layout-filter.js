// Keeps the layout of a stylesheet and throws away its look.
//
// Rebuilding the join flow in the planner's design language meant the old
// stylesheet had to stop deciding what anything looks like - three attempts to
// paint over it with !important left the old interface showing through every
// time. But it could not simply be dropped: it also holds where everything
// sits, which step is showing, how a sheet slides in, what hides a modal. Those
// had to survive exactly, because the owner asked for every button and every
// line of text to stay where it was.
//
// So each declaration is sorted by what it does. Position, size, spacing,
// visibility and state stay; colour, surface, edge, shadow and type go, and the
// planner stylesheet supplies them fresh with nothing left to fight.

// Anything that decides only how a thing looks. Spacing is deliberately NOT
// here: margins and paddings are where things sit.
const VISUAL_PROPERTIES = [
  /^color$/,
  /^background(-.*)?$/,
  /^border(-(?!collapse|spacing).*)?$/,
  /^outline(-.*)?$/,
  /^box-shadow$/,
  /^text-shadow$/,
  /^filter$/,
  /^-webkit-backdrop-filter$/,
  /^backdrop-filter$/,
  /^font(-.*)?$/,
  /^letter-spacing$/,
  /^text-transform$/,
  /^text-decoration(-.*)?$/,
  /^text-underline-offset$/,
  /^-webkit-text-fill-color$/,
  /^fill$/,
  /^stroke(-.*)?$/,
  /^caret-color$/,
  /^accent-color$/,
  /^mix-blend-mode$/,
];

// Decorative motion the owner asked to lose is the kind that never stops: the
// shimmer, the pulse, the drifting gradient, the bobbing lock. Motion that
// carries meaning - a spinner saying "wait" - is kept by selector.
//
// One-shot animations are kept whatever they are. An entrance often starts the
// element hidden (opacity: 0) and only its animation brings it in; dropping the
// animation and keeping the opacity left a whole screen blank.
const FUNCTIONAL_ANIMATION_SELECTOR = /is-loading|spinner|is-playing|join-done-mark|join-btn-spin/;
const LOOPING = /\binfinite\b/;

function isVisual(property) {
  return VISUAL_PROPERTIES.some((pattern) => pattern.test(property));
}

function stripComments(css) {
  return String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// Splits "a: b; c: d" into declarations without tripping over the semicolons
// and colons inside url(), var() fallbacks or quoted content.
function splitDeclarations(block) {
  const out = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const ch of block) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === ";" && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function isAnimationProperty(property) {
  return property === "animation" || property.startsWith("animation-");
}

function filterDeclarations(selector, block) {
  const declarations = splitDeclarations(block)
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      return colon < 0 ? null : { declaration, property: declaration.slice(0, colon).trim().toLowerCase() };
    })
    .filter(Boolean);
  // A loop is decided per rule: "animation-iteration-count: infinite" makes the
  // name declared beside it a loop too.
  const loops = declarations.some(({ declaration, property }) => isAnimationProperty(property) && LOOPING.test(declaration));
  const dropMotion = loops && !FUNCTIONAL_ANIMATION_SELECTOR.test(selector);
  const kept = [];
  for (const { declaration, property } of declarations) {
    if (isVisual(property)) continue;
    if (dropMotion && isAnimationProperty(property)) continue;
    kept.push(declaration);
  }
  return kept;
}

// Walks the stylesheet with a brace counter. Keyframes are kept whole - they
// are harmless unless something runs them, and the functional animations need
// theirs. Media and supports blocks are recursed into.
function keepLayout(css) {
  const source = stripComments(css);
  let out = "";
  let index = 0;

  function readBlock(start) {
    let depth = 0;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return source.length - 1;
  }

  while (index < source.length) {
    const open = source.indexOf("{", index);
    if (open < 0) break;
    // A block-less statement such as "@import url(...);" runs straight into the
    // next rule's selector; without this cut, ":root" would be taken for part
    // of the @import and the whole :root block - the page's layout variables -
    // would be thrown away with it.
    let prelude = source.slice(index, open);
    const statementEnd = prelude.lastIndexOf(";");
    if (statementEnd >= 0) prelude = prelude.slice(statementEnd + 1);
    prelude = prelude.trim();
    const close = readBlock(open);
    const inner = source.slice(open + 1, close);

    if (/^@keyframes|^@-webkit-keyframes/.test(prelude)) {
      out += `${prelude}{${inner}}\n`;
    } else if (/^@(media|supports)/.test(prelude)) {
      const nested = keepLayout(inner);
      if (nested.trim()) out += `${prelude}{\n${nested}}\n`;
    } else if (prelude && !prelude.startsWith("@")) {
      const kept = filterDeclarations(prelude, inner);
      if (kept.length) out += `${prelude}{${kept.join(";")};}\n`;
    }
    index = close + 1;
  }
  return out;
}

module.exports = { keepLayout, isVisual, splitDeclarations };
