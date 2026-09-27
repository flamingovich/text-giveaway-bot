// Charts for the admin, in the planner's manner: a smooth line over a soft
// fill, glass-tube columns and bars, activity rings. They are drawn on the
// server as SVG and HTML - no chart library, nothing loaded from elsewhere - and
// a small client script adds the hover cards.
//
// A line chart's svg is stretched to the card's width, so its x runs 0..1000
// and y is in pixels; strokes keep their width with non-scaling-stroke, and the
// dot and card on hover are placed by the script from the same numbers.

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const VIEW_WIDTH = 1000;
const PAD_TOP = 14;
const PAD_BOTTOM = 4;

// The top of the axis: a round number just above the peak, one that splits
// into four even steps (347 -> 400, 12 606 -> 16 000), so the curve fills the
// card instead of a third of it standing empty.
function niceMax(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 4) {
    return 4;
  }
  const power = 10 ** Math.floor(Math.log10(number));
  for (const step of [1, 1.2, 1.6, 2, 2.4, 3, 4, 6, 8, 10]) {
    if (number <= step * power) {
      return step * power;
    }
  }
  return 10 * power;
}

function compactNumber(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);
  if (abs >= 1000000) {
    return `${(number / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(".", ",").replace(",0", "")} млн`;
  }
  if (abs >= 10000) {
    return `${(number / 1000).toFixed(abs >= 100000 ? 0 : 1).replace(".", ",").replace(",0", "")} тыс.`;
  }
  return Math.round(number).toLocaleString("ru-RU");
}

// A smooth line through the points that never overshoots them (monotone cubic,
// Fritsch-Carlson): a count cannot dip below zero between two days.
function monotonePath(points) {
  const n = points.length;
  if (n === 0) {
    return "";
  }
  const f = (value) => Math.round(value * 10) / 10;
  if (n === 1) {
    return `M${f(points[0][0])},${f(points[0][1])}`;
  }
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1][0] - points[i][0];
    slope[i] = dx[i] === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx[i];
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangent[i] = 0;
    } else {
      tangent[i] =
        (3 * (dx[i - 1] + dx[i])) /
        ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]);
    }
  }
  tangent[n - 1] = slope[n - 2];
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C${f(points[i][0] + h)},${f(points[i][1] + h * tangent[i])} ${f(points[i + 1][0] - h)},${f(
      points[i + 1][1] - h * tangent[i + 1],
    )} ${f(points[i + 1][0])},${f(points[i + 1][1])}`;
  }
  return d;
}

function yFor(value, max, height) {
  return PAD_TOP + (1 - (Number(value) || 0) / max) * (height - PAD_TOP - PAD_BOTTOM);
}

function lineGeometry(values, max, height) {
  const n = values.length;
  const points = values.map((value, index) => [
    n === 1 ? VIEW_WIDTH / 2 : (index / (n - 1)) * VIEW_WIDTH,
    yFor(value, max, height),
  ]);
  const line = monotonePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  const fill = points.length ? `${line} L${last[0]},${height} L${first[0]},${height} Z` : "";
  return { line, fill };
}

let chartSeq = 0;
function nextId(prefix) {
  chartSeq += 1;
  return `${prefix}${chartSeq}`;
}

// Evenly spread labels under the axis, the first and last always among them.
function pickAxisLabels(labels, count = 6) {
  if (labels.length <= count) {
    return labels.map((label, index) => ({ label, index }));
  }
  const picked = [];
  for (let k = 0; k < count; k += 1) {
    const index = Math.round((k / (count - 1)) * (labels.length - 1));
    picked.push({ label: labels[index], index });
  }
  return picked;
}

// labels: one per point; series: [{ name, values, tone, dashed, axis: "right" }].
// A right-axis series gets its own scale - a running total next to daily counts.
function areaChart({ labels = [], series = [], height = 240, empty = "Данных пока нет" }) {
  const points = labels.length;
  if (!points || !series.length || series.every((item) => !(item.values || []).some((value) => value > 0))) {
    return `<div class="ac-empty" style="--h:${height}px">${escapeHtml(empty)}</div>`;
  }
  const leftMax = niceMax(Math.max(...series.filter((item) => item.axis !== "right").flatMap((item) => item.values || [0])));
  const rightSeries = series.filter((item) => item.axis === "right");
  const rightMax = rightSeries.length ? niceMax(Math.max(...rightSeries.flatMap((item) => item.values || [0]))) : null;

  const paths = series
    .map((item, index) => {
      const max = item.axis === "right" ? rightMax : leftMax;
      const { line, fill } = lineGeometry(item.values, max, height);
      const tone = item.tone || "blue";
      const gradientId = nextId("acg");
      const area =
        index === 0 && !item.dashed
          ? `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--${tone})" stop-opacity=".30"/><stop offset=".75" stop-color="var(--${tone})" stop-opacity=".06"/><stop offset="1" stop-color="var(--${tone})" stop-opacity="0"/></linearGradient></defs><path class="ac-fill" d="${fill}" fill="url(#${gradientId})"/>`
          : "";
      return `${area}<path class="ac-line${item.dashed ? " is-dashed" : ""}" d="${line}" vector-effect="non-scaling-stroke" style="stroke: var(--${tone})"/>`;
    })
    .join("");

  const grid = [1, 0.75, 0.5, 0.25, 0]
    .map((share) => {
      const top = yFor(leftMax * share, leftMax, height);
      const right = rightMax !== null ? `<span class="ac-yr">${escapeHtml(compactNumber(rightMax * share))}</span>` : "";
      return `<div class="ac-gl${share === 0 ? " is-base" : ""}" style="top:${top.toFixed(1)}px"><span class="ac-y">${escapeHtml(compactNumber(leftMax * share))}</span>${right}</div>`;
    })
    .join("");

  const axis = pickAxisLabels(labels)
    .map(({ label, index }) => {
      const left = points === 1 ? 50 : (index / (points - 1)) * 100;
      return `<span style="left:${left.toFixed(2)}%">${escapeHtml(label)}</span>`;
    })
    .join("");

  const data = {
    labels,
    height,
    padTop: PAD_TOP,
    padBottom: PAD_BOTTOM,
    series: series.map((item) => ({
      name: item.name,
      values: item.values,
      tone: item.tone || "blue",
      max: item.axis === "right" ? rightMax : leftMax,
      suffix: item.suffix || "",
    })),
  };

  return `<div class="ac${rightMax !== null ? " has-right" : ""}" style="--h:${height}px" data-chart="${escapeHtml(JSON.stringify(data))}">
    <div class="ac-plot">
      <div class="ac-grid">${grid}</div>
      <svg class="ac-svg" viewBox="0 0 ${VIEW_WIDTH} ${height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>
      <div class="ac-hover"><div class="ac-guide"></div><div class="ac-dot"></div></div>
      <div class="ac-pop" role="status"></div>
    </div>
    <div class="ac-x">${axis}</div>
  </div>`;
}

// A tiny line with its fill, no axes: the shape of the last weeks under a number.
function sparkline(values = [], { tone = "blue", height = 46 } = {}) {
  if (!values.length || !values.some((value) => value > 0)) {
    return "";
  }
  const max = Math.max(...values) * 1.08 || 1;
  const { line, fill } = lineGeometry(values, max, height);
  const gradientId = nextId("spg");
  return `<svg class="spark" viewBox="0 0 ${VIEW_WIDTH} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--${tone})" stop-opacity=".28"/><stop offset="1" stop-color="var(--${tone})" stop-opacity="0"/></linearGradient></defs>
    <path class="ac-fill" d="${fill}" fill="url(#${gradientId})"/>
    <path class="ac-line" d="${line}" vector-effect="non-scaling-stroke" style="stroke: var(--${tone})"/>
  </svg>`;
}

// Glass-tube columns, as in the planner's spending chart. items: [{ label,
// value, display, highlight }]; the hover card says label and display.
function columns(items = [], { height = 150, tone = "blue", axis = null, empty = "Данных пока нет" } = {}) {
  if (!items.length || !items.some((item) => item.value > 0)) {
    return `<div class="ac-empty" style="--h:${height}px">${escapeHtml(empty)}</div>`;
  }
  const max = Math.max(...items.map((item) => item.value)) || 1;
  const bars = items
    .map((item, index) => {
      const share = Math.max(item.value > 0 ? 2.5 : 1.2, (item.value / max) * 100);
      return `<button type="button" class="col${item.highlight ? " is-hl" : ""}" style="--v:${share.toFixed(2)}%;--i:${Math.min(index, 60)}" data-label="${escapeHtml(item.label)}" data-display="${escapeHtml(item.display ?? item.value)}" aria-label="${escapeHtml(`${item.label}: ${item.display ?? item.value}`)}"><i></i></button>`;
    })
    .join("");
  const axisLabels = axis || [items[0].label, items[items.length - 1].label];
  return `<div class="cols" style="--h:${height}px;--tone: var(--${tone})">
    <div class="cols-bars">${bars}</div>
    <div class="cols-axis">${axisLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
    <div class="ac-pop cols-pop" role="status"></div>
  </div>`;
}

// Horizontal bars with the label above: [{ label, value, display, tone, lead }].
// lead is html before the label (a brand logo, an avatar).
function hbars(items = [], { max = null, empty = "Данных пока нет" } = {}) {
  if (!items.length) {
    return `<div class="note">${escapeHtml(empty)}</div>`;
  }
  const top = max ?? Math.max(1, ...items.map((item) => item.value));
  return `<div class="hb">${items
    .map((item, index) => {
      const share = top ? Math.max(item.value > 0 ? 1.5 : 0, (item.value / top) * 100) : 0;
      return `<div class="hb-row" style="--i:${index}">
        <div class="hb-top">${item.lead || ""}<span class="hb-label">${escapeHtml(item.label)}</span><span class="hb-val">${escapeHtml(item.display ?? item.value)}</span></div>
        <div class="hb-track"><i style="width:${share.toFixed(2)}%;--tone: var(--${item.tone || "blue"})"></i></div>
      </div>`;
    })
    .join("")}</div>`;
}

// One bar of shares with a legend under it, the planner's "Куда ушёл доход".
// parts: [{ label, value, tone }].
function shareBar(parts = [], { unit = "" } = {}) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  if (!total) {
    return `<div class="note">Данных пока нет</div>`;
  }
  const segments = parts
    .filter((part) => part.value > 0)
    .map((part) => `<i style="flex:${part.value};--tone: var(--${part.tone || "gray"})" title="${escapeHtml(part.label)}"></i>`)
    .join("");
  const legend = parts
    .map((part) => {
      const percent = Math.round((Math.max(0, part.value) / total) * 100);
      return `<div class="sb-row"><span class="sb-dot" style="--tone: var(--${part.tone || "gray"})"></span><span class="sb-label">${escapeHtml(part.label)}</span><span class="sb-val tnum">${escapeHtml(Number(part.value).toLocaleString("ru-RU"))}${unit}</span><span class="sb-pct tnum">${percent}%</span></div>`;
    })
    .join("");
  return `<div class="sb"><div class="sb-bar">${segments}</div><div class="sb-legend">${legend}</div></div>`;
}

// An activity ring: percent of a circle, rounded ends, a gradient along it.
function ring(percent, { tone = "blue", size = 72, stroke = 9, center = null, toneTo = null } = {}) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const offset = length * (1 - value / 100);
  const gradientId = nextId("rg");
  const label = center ?? `${Math.round(value)}%`;
  return `<div class="ring" style="--size:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--${toneTo || tone})"/><stop offset="1" stop-color="var(--${tone})"/></linearGradient></defs>
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" style="stroke: var(--${tone})"/>
      <circle class="ring-bar" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" stroke="url(#${gradientId})" stroke-dasharray="${length.toFixed(2)}" style="--len:${length.toFixed(2)};--off:${offset.toFixed(2)};stroke-dashoffset:${offset.toFixed(2)}"/>
    </svg>
    <span class="ring-center">${escapeHtml(label)}</span>
  </div>`;
}

// The join funnel as a stack of bars: how many reached each step, how many of
// them went on (tint) and how many stopped there (red).
function funnelSteps(steps = [], { total = 0 } = {}) {
  const top = Math.max(1, total, ...steps.map((step) => step.reached));
  return `<div class="fn">${steps
    .map((step, index) => {
      const reached = (step.reached / top) * 100;
      const passed = step.reached ? (step.passed / step.reached) * 100 : 0;
      const rate = step.reached
        ? `<span class="chip ${step.passRate >= 85 ? "chip-green" : step.passRate >= 65 ? "chip-orange" : "chip-red"}">${step.passRate}% проходят</span>`
        : `<span class="chip chip-muted">не было</span>`;
      return `<div class="fn-row" style="--i:${index}">
        <div class="fn-head">
          <div><div class="fn-label">${escapeHtml(step.label)}</div>${step.hint ? `<div class="fn-hint">${escapeHtml(step.hint)}</div>` : ""}</div>
          <div class="fn-nums"><span class="tnum"><b>${escapeHtml(step.reached.toLocaleString("ru-RU"))}</b> дошли</span>${
            step.stuck ? `<span class="tnum fn-stuck">−${escapeHtml(step.stuck.toLocaleString("ru-RU"))}</span>` : ""
          }${rate}</div>
        </div>
        <div class="fn-track"><div class="fn-reach" style="width:${reached.toFixed(2)}%"><i class="fn-pass" style="width:${passed.toFixed(2)}%"></i></div></div>
      </div>`;
    })
    .join("")}</div>`;
}

// Several series side by side for each group, never stacked: the same person
// can stand behind two bars. groups: [{ label, values }]; series: [{ label, tone }].
function groupedBars(groups = [], series = [], { unit = "" } = {}) {
  if (!groups.length) {
    return `<div class="note">Данных пока нет</div>`;
  }
  const top = Math.max(1, ...groups.flatMap((group) => group.values));
  const legend = `<div class="gb-legend">${series
    .map((item) => `<span class="gb-key"><span class="sb-dot" style="--tone: var(--${item.tone})"></span>${escapeHtml(item.label)}</span>`)
    .join("")}</div>`;
  const rows = groups
    .map((group, groupIndex) => {
      const bars = group.values
        .map((value, index) => {
          if (!value) {
            return "";
          }
          const share = Math.max(1.2, (value / top) * 100);
          return `<div class="gb-bar"><i style="width:${share.toFixed(2)}%;--tone: var(--${series[index]?.tone || "gray"})" title="${escapeHtml(`${series[index]?.label || ""}: ${value}${unit}`)}"></i><span class="tnum">${escapeHtml(value.toLocaleString("ru-RU"))}</span></div>`;
        })
        .join("");
      return `<div class="gb-group" style="--i:${groupIndex}"><div class="gb-label">${escapeHtml(group.label)}</div><div class="gb-bars">${bars || '<span class="note">—</span>'}</div></div>`;
    })
    .join("");
  return `<div class="gb">${legend}${rows}</div>`;
}

function chartStyles() {
  return `
/* ── charts ──────────────────────────────────────────────────────────── */
.ac { position: relative; }
.ac-plot { position: relative; height: var(--h); margin-left: 44px; }
.ac.has-right .ac-plot { margin-right: 44px; }
.ac-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.ac-grid { position: absolute; inset: 0; pointer-events: none; }
.ac-gl { position: absolute; left: 0; right: 0; height: 0; border-top: .5px dashed var(--separator); }
.ac-gl.is-base { border-top-style: solid; }
.ac-y, .ac-yr { position: absolute; top: -8px; font-size: 11.5px; color: var(--label-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ac-y { right: calc(100% + 10px); }
.ac-yr { left: calc(100% + 10px); color: var(--label-3); }
/* The line is revealed left to right by a clip, not drawn with a dash offset:
   with non-scaling-stroke a dash is measured in screen pixels, and a
   normalised dash of 1 came out as a dotted saw. */
.ac-svg, .spark { animation: ac-reveal 1.3s var(--ease) .1s both; }
.ac-line { fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.ac-line.is-dashed { stroke-width: 1.6; stroke-dasharray: 5 6; opacity: .8; }
.ac-fill { animation: ac-fill 1.1s var(--ease) .3s both; }
@keyframes ac-reveal { from { clip-path: inset(-20px 100% -20px -20px); } to { clip-path: inset(-20px -20px -20px -20px); } }
@keyframes ac-fill { from { opacity: 0; } }
.ac-x { position: relative; height: 26px; margin-left: 44px; }
.ac.has-right .ac-x { margin-right: 44px; }
.ac-x span { position: absolute; top: 9px; transform: translateX(-50%); font-size: 11.5px; color: var(--label-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ac-x span:first-child { transform: none; }
.ac-x span:last-child { transform: translateX(-100%); }
.ac-hover { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .15s var(--ease); }
.ac.is-hover .ac-hover { opacity: 1; }
.ac-guide { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid var(--label-3); }
.ac-dot { position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border-radius: 50%; background: var(--bg-elevated); border: 2.5px solid var(--tint); box-shadow: 0 2px 6px rgba(0,0,0,.18); }
.ac-pop {
  position: absolute; z-index: 10; top: 0; left: 0; min-width: 150px; max-width: 240px;
  padding: 10px 12px; border-radius: 14px; pointer-events: none;
  background: var(--bg-elevated); box-shadow: 0 10px 30px rgba(0,0,0,.16), 0 1px 3px rgba(0,0,0,.08), inset 0 0 0 .5px var(--separator);
  opacity: 0; transform: translateY(6px) scale(.96); transition: opacity .16s var(--ease), transform .28s var(--spring);
}
.ac-pop.is-shown { opacity: 1; transform: none; }
.pop-date { font-size: 12px; font-weight: 600; color: var(--label-2); margin-bottom: 4px; }
.pop-row { display: flex; align-items: center; gap: 7px; font-size: 13.5px; }
.pop-row b { margin-left: auto; font-variant-numeric: tabular-nums; }
.pop-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ac-empty { display: grid; place-items: center; height: var(--h); color: var(--label-2); font-size: 14px; border-radius: 16px; background: color-mix(in oklab, var(--fill) 50%, transparent); }

.spark { display: block; width: 100%; height: 46px; overflow: visible; }
.spark .ac-line { stroke-width: 2; }

.cols { position: relative; }
.cols-bars { display: flex; align-items: flex-end; gap: 3px; height: var(--h); }
.col {
  flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: none; cursor: pointer;
  display: flex; flex-direction: column; justify-content: flex-end; border-radius: 6px;
  transition: opacity .2s var(--ease);
}
.col i {
  display: block; width: 100%; height: var(--v); min-height: 3px; border-radius: 6px;
  background: linear-gradient(90deg, rgba(255,255,255,.4), rgba(255,255,255,.1) 50%, rgba(0,0,0,.06)), color-mix(in oklab, var(--tone) 70%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.5), inset 0 0 0 .5px rgba(255,255,255,.25);
  transform-origin: bottom; animation: col-grow .7s var(--ease) both; animation-delay: calc(var(--i) * 12ms);
}
.col.is-hl i { background: linear-gradient(90deg, rgba(255,255,255,.42), rgba(255,255,255,.12) 50%, rgba(0,0,0,.07)), var(--tone); }
.cols-bars:hover .col:not(:hover) { opacity: .45; }
@keyframes col-grow { from { transform: scaleY(0); } }
.cols-axis { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11.5px; color: var(--label-2); font-variant-numeric: tabular-nums; }

.hb { display: flex; flex-direction: column; gap: 14px; }
.hb-top { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.hb-label { flex: 1; min-width: 0; font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hb-val { flex: none; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.hb-track { height: 10px; border-radius: 999px; background: color-mix(in oklab, var(--gray) 18%, transparent); overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,.06); }
.hb-track i {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.42), rgba(255,255,255,.12) 45%, rgba(0,0,0,.06)), var(--tone);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.55);
  transform-origin: left; animation: bar-grow .9s var(--ease) both; animation-delay: calc(var(--i, 0) * 60ms + .1s);
}
@keyframes bar-grow { from { transform: scaleX(0); } }
.brand-logo { width: 22px; height: 22px; border-radius: 6px; object-fit: contain; flex: none; background: var(--fill); padding: 2px; }

.sb-bar { display: flex; gap: 3px; height: 14px; border-radius: 999px; overflow: hidden; }
.sb-bar i {
  display: block; min-width: 4px; height: 100%;
  background: linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,.12) 45%, rgba(0,0,0,.06)), var(--tone);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.5);
  transform-origin: left; animation: bar-grow 1s var(--ease) .1s both;
}
.sb-legend { margin-top: 14px; display: flex; flex-direction: column; }
.sb-row { display: flex; align-items: center; gap: 10px; min-height: 36px; font-size: 14.5px; }
.sb-row + .sb-row { border-top: .5px solid var(--separator); }
.sb-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--tone); box-shadow: inset 0 1px 0 rgba(255,255,255,.4); }
.sb-label { flex: 1; min-width: 0; }
.sb-val { font-weight: 600; }
.sb-pct { width: 42px; text-align: right; color: var(--label-2); font-size: 13px; }

.ring { position: relative; width: var(--size); height: var(--size); flex: none; }
.ring svg { width: 100%; height: 100%; transform: rotate(-90deg); display: block; }
.ring circle { fill: none; }
.ring-track { opacity: .16; }
.ring-bar { stroke-linecap: round; animation: ring-fill 1.3s var(--ease) .15s both; }
@keyframes ring-fill { from { stroke-dashoffset: var(--len); } }
.ring-center { position: absolute; inset: 0; display: grid; place-items: center; font-size: calc(var(--size) * .24); font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }

.fn { display: flex; flex-direction: column; gap: 18px; }
.fn-row { animation: rise .5s var(--ease) both; animation-delay: calc(var(--i) * 70ms); }
.fn-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
.fn-label { font-size: 15px; font-weight: 600; }
.fn-hint { font-size: 12.5px; color: var(--label-2); margin-top: 1px; }
.fn-nums { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: var(--label-2); }
.fn-nums b { color: var(--label); font-weight: 650; }
.fn-stuck { color: var(--red); font-weight: 600; }
.fn-track { height: 16px; border-radius: 999px; background: color-mix(in oklab, var(--gray) 14%, transparent); overflow: hidden; }
.fn-reach {
  height: 100%; border-radius: 999px; overflow: hidden;
  background: color-mix(in oklab, var(--red) 34%, transparent);
  transform-origin: left; animation: bar-grow 1s var(--ease) both; animation-delay: calc(var(--i) * 70ms + .1s);
}
.fn-pass {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,.12) 45%, rgba(0,0,0,.06)), var(--tint);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.5);
}

.gb-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 16px; font-size: 13.5px; color: var(--label-2); }
.gb-key { display: inline-flex; align-items: center; gap: 7px; }
.gb-group { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; align-items: start; padding: 10px 0; }
.gb-group + .gb-group { border-top: .5px solid var(--separator); }
.gb-label { font-size: 14.5px; font-weight: 600; padding-top: 1px; }
.gb-bars { display: flex; flex-direction: column; gap: 6px; }
.gb-bar { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--label-2); }
.gb-bar i {
  display: block; height: 10px; border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,.12) 45%, rgba(0,0,0,.06)), var(--tone);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.5);
  transform-origin: left; animation: bar-grow .9s var(--ease) both; animation-delay: calc(var(--i) * 50ms + .1s);
}
@media (max-width: 560px) { .gb-group { grid-template-columns: 1fr; gap: 6px; } }
`;
}

// Hover cards for the line charts and columns, and [data-tabs] switching.
function adminChartsScript() {
  return `<script>
(function () {
  var fmt = new Intl.NumberFormat("ru-RU");
  // Built from nodes, not html: a label can one day be a prize an organiser typed.
  function fill(pop, title, rows) {
    pop.textContent = "";
    var head = document.createElement("div");
    head.className = "pop-date";
    head.textContent = title;
    pop.appendChild(head);
    rows.forEach(function (row) {
      var line = document.createElement("div");
      line.className = "pop-row";
      if (row.tone) {
        var dot = document.createElement("span");
        dot.className = "pop-dot";
        dot.style.background = "var(--" + row.tone + ")";
        line.appendChild(dot);
      }
      if (row.name) line.appendChild(document.createTextNode(row.name));
      var value = document.createElement("b");
      if (!row.name) value.style.marginLeft = "0";
      value.textContent = row.value;
      line.appendChild(value);
      pop.appendChild(line);
    });
  }
  function place(pop, plot, x, y) {
    var w = pop.offsetWidth, h = pop.offsetHeight, pw = plot.clientWidth;
    var left = Math.min(Math.max(x - w / 2, -8), pw - w + 8);
    var top = y - h - 14;
    if (top < -10) top = y + 16;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }
  document.querySelectorAll(".ac[data-chart]").forEach(function (chart) {
    var data;
    try { data = JSON.parse(chart.dataset.chart); } catch (e) { return; }
    var plot = chart.querySelector(".ac-plot");
    var guide = chart.querySelector(".ac-guide");
    var dot = chart.querySelector(".ac-dot");
    var pop = chart.querySelector(".ac-pop");
    var n = data.labels.length;
    function yOf(value, max) { return data.padTop + (1 - (Number(value) || 0) / max) * (data.height - data.padTop - data.padBottom); }
    function show(clientX) {
      var rect = plot.getBoundingClientRect();
      var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      var index = n === 1 ? 0 : Math.round(ratio * (n - 1));
      var x = n === 1 ? rect.width / 2 : (index / (n - 1)) * rect.width;
      var first = data.series[0];
      var y = yOf(first.values[index], first.max);
      guide.style.left = x + "px";
      dot.style.left = x + "px";
      dot.style.top = y + "px";
      dot.style.borderColor = "var(--" + first.tone + ")";
      fill(pop, data.labels[index], data.series.map(function (s) {
        return { tone: s.tone, name: s.name, value: fmt.format(s.values[index] || 0) + s.suffix };
      }));
      chart.classList.add("is-hover");
      pop.classList.add("is-shown");
      place(pop, plot, x, y);
    }
    function hide() { chart.classList.remove("is-hover"); pop.classList.remove("is-shown"); }
    plot.addEventListener("mousemove", function (e) { show(e.clientX); });
    plot.addEventListener("mouseleave", hide);
    plot.addEventListener("touchstart", function (e) { show(e.touches[0].clientX); }, { passive: true });
    plot.addEventListener("touchmove", function (e) { show(e.touches[0].clientX); }, { passive: true });
    plot.addEventListener("touchend", function () { setTimeout(hide, 1200); });
  });
  document.querySelectorAll(".cols").forEach(function (box) {
    var pop = box.querySelector(".cols-pop");
    var bars = box.querySelector(".cols-bars");
    box.querySelectorAll(".col").forEach(function (col) {
      function show() {
        fill(pop, col.dataset.label, [{ value: col.dataset.display }]);
        pop.classList.add("is-shown");
        var bar = col.querySelector("i");
        var x = col.offsetLeft + col.offsetWidth / 2;
        var y = bars.offsetTop + (bars.offsetHeight - bar.offsetHeight);
        place(pop, box, x, y);
      }
      col.addEventListener("mouseenter", show);
      col.addEventListener("focus", show);
      col.addEventListener("click", show);
      col.addEventListener("mouseleave", function () { pop.classList.remove("is-shown"); });
      col.addEventListener("blur", function () { pop.classList.remove("is-shown"); });
    });
  });
  document.querySelectorAll("[data-tabs]").forEach(function (box) {
    var tabs = box.querySelectorAll("[data-tab]");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.toggle("is-active", t === tab); t.setAttribute("aria-selected", t === tab ? "true" : "false"); });
        box.querySelectorAll("[data-panel]").forEach(function (panel) {
          var on = panel.dataset.panel === tab.dataset.tab;
          panel.classList.toggle("hidden", !on);
          if (on) panel.querySelectorAll(".ac-svg, .ac-fill").forEach(function (p) { p.style.animation = "none"; p.getBoundingClientRect(); p.style.animation = ""; });
        });
      });
    });
  });
})();
</script>`;
}

module.exports = {
  niceMax,
  compactNumber,
  monotonePath,
  pickAxisLabels,
  areaChart,
  sparkline,
  columns,
  hbars,
  shareBar,
  ring,
  funnelSteps,
  groupedBars,
  chartStyles,
  adminChartsScript,
};
