// The web admin's «Связи»: clusters of linked people (link-graph.js) and the
// graph of one cluster - people as faces, the evidence they share as tiles
// between them, the way Arkham draws wallets. Own SVG, no libraries, the
// layout worked out on the server so the page has no script to run.
const { collectLinkEvidence, buildClusters, STRONG } = require("./link-graph");
const { identityOf } = require("./admin-format");
const { scriptJson } = require("./script-json");
const { linkGraphClient } = require("./admin-link-graph-client");

const KIND_INFO = {
  wallet: { title: "Общий кошелёк", tone: "red", icon: "wallet" },
  account: { title: "Общий ID проекта", tone: "red", icon: "person" },
  shot: { title: "Один скрин профиля", tone: "red", icon: "doc" },
  device: { title: "Одно устройство", tone: "red", icon: "cpu" },
  fpnet: { title: "Отпечаток + сеть", tone: "red", icon: "cpu" },
  ip: { title: "Одна сеть", tone: "blue", icon: "pulse" },
  ipdraw: { title: "Одна сеть в розыгрыше", tone: "teal", icon: "pulse" },
  chain: { title: "Общий кошелёк в блокчейне", tone: "red", icon: "link" },
  chainpending: { title: "Блокчейн: проверяется", tone: "orange", icon: "link" },
  referral: { title: "Пригласил", tone: "gray", icon: "gift" },
};

const shortAddress = (value) => {
  const text = String(value || "");
  return text.length > 14 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text;
};

// What a piece of evidence says, in a line.
function describeEvidence(entry) {
  const info = KIND_INFO[entry.kind] || { title: entry.kind };
  switch (entry.kind) {
    case "wallet":
      return { title: info.title, detail: shortAddress(entry.label), full: entry.label };
    case "account": {
      const [brand, ...rest] = String(entry.label).split(" ");
      const id = rest.join(" ");
      return { title: info.title, detail: `${brand} ${id.length > 14 ? shortAddress(id) : id}`, full: entry.label };
    }
    case "shot":
      return { title: info.title, detail: "тот же файл", full: entry.label };
    case "device":
      return { title: info.title, detail: "тот же телефон", full: "один и тот же ID устройства в Telegram" };
    case "fpnet":
      return { title: info.title, detail: "тот же телефон и сеть", full: "одинаковый отпечаток устройства из одной сети" };
    case "ip":
      return { title: info.title, detail: `${entry.meta?.draws || 2} розыгр. вместе`, full: "один IP в нескольких розыгрышах" };
    case "ipdraw":
      return { title: info.title, detail: "этот розыгрыш", full: "один IP у нескольких участников этого розыгрыша" };
    case "chain":
      return entry.meta?.kind === "transfer"
        ? { title: "Перевод между их адресами", detail: "в блокчейне", full: entry.label }
        : { title: info.title, detail: shortAddress(entry.label), full: `небольшой кошелёк, связанный с их адресами: ${entry.label}` };
    case "chainpending":
      return { title: info.title, detail: shortAddress(entry.label), full: `общий кошелёк, ещё не проверено — касса это или человек: ${entry.label}` };
    case "referral":
      return { title: info.title, detail: "", full: "приглашение по ссылке" };
    default:
      return { title: entry.kind, detail: "", full: "" };
  }
}

/** Wins and paid prizes per person, from the draws. */
function countPrizes(draws) {
  const wins = new Map();
  const paid = new Map();
  for (const draw of draws) {
    for (const winnerId of draw.winnerIds || []) {
      const key = String(winnerId);
      wins.set(key, (wins.get(key) || 0) + 1);
      if (draw.winnerNotifications?.[key]?.paidAt) paid.set(key, (paid.get(key) || 0) + 1);
    }
  }
  return { wins, paid };
}

/** Everything the two pages show. */
function buildLinksView({ draws = [], userProfiles = {}, projects = [], counterparties = [], networkTypes, partyKinds, normalizeAccountId }) {
  const evidence = collectLinkEvidence({ draws, userProfiles, projects, counterparties, networkTypes, partyKinds, normalizeAccountId });
  const clusters = buildClusters(evidence);
  const { wins, paid } = countPrizes(draws);
  const users = userProfiles.users || {};
  const view = clusters.map((cluster) => {
    const members = cluster.users.map((userId) => ({
      identity: identityOf(userId, users[userId]?.meta || {}),
      wins: wins.get(userId) || 0,
      paid: paid.get(userId) || 0,
    }));
    const kinds = {};
    for (const entry of cluster.evidence) kinds[entry.kind] = (kinds[entry.kind] || 0) + 1;
    return {
      id: cluster.id,
      strong: cluster.strong,
      members,
      evidence: cluster.evidence,
      kinds,
      wins: members.reduce((s, m) => s + m.wins, 0),
      paid: members.reduce((s, m) => s + m.paid, 0),
    };
  });
  // Clusters that cost money first: paid prizes, then wins, then size.
  view.sort((a, b) => Number(b.strong) - Number(a.strong) || b.paid - a.paid || b.wins - a.wins || b.members.length - a.members.length);
  return {
    clusters: view,
    // Kept for «Розыгрыши», which reads the same evidence inside each draw.
    evidence,
    totals: {
      clusters: view.length,
      people: view.reduce((s, c) => s + c.members.length, 0),
      strong: view.filter((c) => c.strong).length,
      withWins: view.filter((c) => c.wins > 0).length,
      paidInClusters: view.reduce((s, c) => s + c.paid, 0),
    },
  };
}

// ── graph ──────────────────────────────────────────────────────────────────

/**
 * A force layout (Fruchterman-Reingold) from a fixed start, so the same
 * cluster is always drawn the same way. → Map(id -> { x, y }) inside width × height.
 */
function layoutGraph(nodeIds, edges, { width = 760, height = 460, iterations = 400, pad = 72 } = {}) {
  const n = nodeIds.length;
  const pos = new Map();
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    pos.set(id, { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 });
  });
  if (n === 1) {
    pos.set(nodeIds[0], { x: width / 2, y: height / 2 });
    return pos;
  }
  const area = width * height;
  const k = 0.8 * Math.sqrt(area / n);
  let temperature = width / 8;
  for (let step = 0; step < iterations; step++) {
    const disp = new Map(nodeIds.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(nodeIds[i]);
        const b = pos.get(nodeIds[j]);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.max(0.01, Math.hypot(dx, dy));
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        disp.get(nodeIds[i]).x += dx;
        disp.get(nodeIds[i]).y += dy;
        disp.get(nodeIds[j]).x -= dx;
        disp.get(nodeIds[j]).y -= dy;
      }
    }
    for (const [s, t] of edges) {
      const a = pos.get(s);
      const b = pos.get(t);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const force = (dist * dist) / k;
      disp.get(s).x -= (dx / dist) * force;
      disp.get(s).y -= (dy / dist) * force;
      disp.get(t).x += (dx / dist) * force;
      disp.get(t).y += (dy / dist) * force;
    }
    for (const id of nodeIds) {
      const d = disp.get(id);
      const len = Math.max(0.01, Math.hypot(d.x, d.y));
      const p = pos.get(id);
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
    }
    temperature *= 0.985;
  }
  // Lay the drawing along its long side: a chain of people comes out of the
  // forces at any angle, and fitted as it is, a steep one was a thin column
  // with the names on top of each other.
  const points = [...pos.values()];
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  for (const p of points) {
    const x = p.x - cx;
    const y = p.y - cy;
    p.x = x * cos - y * sin;
    p.y = x * sin + y * cos;
  }
  // Fit the drawing into the box.
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((width - 2 * pad) / Math.max(1, maxX - minX), (height - 2 * pad) / Math.max(1, maxY - minY));
  for (const p of pos.values()) {
    p.x = pad + (p.x - minX) * scale + ((width - 2 * pad) - (maxX - minX) * scale) / 2;
    p.y = pad + (p.y - minY) * scale + ((height - 2 * pad) - (maxY - minY) * scale) / 2;
  }
  // Nobody sits on anybody: two people tied to the same tile end up in the
  // same spot from the forces alone. Pushed apart to a face and a name's room.
  const minGap = 64;
  const list = [...pos.values()];
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minGap) continue;
        if (dist < 0.01) {
          dx = 0;
          dy = 1;
          dist = 1;
        }
        const push = (minGap - dist) / 2;
        a.x -= (dx / dist) * push;
        a.y -= (dy / dist) * push;
        b.x += (dx / dist) * push;
        b.y += (dy / dist) * push;
        moved = true;
      }
    }
    for (const p of list) {
      p.x = Math.min(width - pad / 2, Math.max(pad / 2, p.x));
      p.y = Math.min(height - pad, Math.max(pad / 2, p.y));
    }
    if (!moved) break;
  }
  return pos;
}

// An admin icon is an <svg> sized by CSS; inside a drawing it needs its own size.
const sizedIcon = (icon, name) => String(icon(name)).replace("<svg ", '<svg width="24" height="24" ');

const esc = (text) =>
  String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (text, max) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));

/**
 * The SVG of one cluster. `icon(name)` is the admin's icon set (an <svg> string).
 * Person nodes link to the person's card.
 */
function renderClusterGraph(cluster, { icon, avatarStyle, width = 760, height = 460 }) {
  const persons = cluster.members.map((m) => ({ id: `u:${m.identity.userId}`, member: m }));
  const tiles = cluster.evidence.filter((e) => e.kind !== "referral").map((e) => ({ id: `e:${e.key}`, entry: e }));
  const edges = [];
  for (const tile of tiles) {
    for (const userId of tile.entry.users) edges.push([`u:${userId}`, tile.id, tile.entry.kind]);
  }
  for (const entry of cluster.evidence.filter((e) => e.kind === "referral")) {
    edges.push([`u:${entry.meta.from}`, `u:${entry.meta.to}`, "referral"]);
  }
  const pos = layoutGraph(
    [...persons.map((p) => p.id), ...tiles.map((t) => t.id)],
    edges.map(([a, b]) => [a, b]),
    { width, height },
  );

  const lines = edges
    .map(([a, b, kind]) => {
      const p = pos.get(a);
      const q = pos.get(b);
      if (!p || !q) return "";
      const referral = kind === "referral";
      return `<line class="lg-edge lg-${kind}" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"${referral ? ' marker-end="url(#lg-arrow)"' : ""} />`;
    })
    .join("");

  const tileNodes = tiles
    .map(({ id, entry }) => {
      const p = pos.get(id);
      const info = KIND_INFO[entry.kind] || {};
      const text = describeEvidence(entry);
      return `<g class="lg-tile lg-${entry.kind}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
        <title>${esc(`${text.title}: ${text.full}`)}</title>
        <rect x="-15" y="-15" width="30" height="30" rx="9" transform="rotate(45)" />
        <g transform="translate(-8 -8) scale(0.667)" class="lg-glyph">${sizedIcon(icon, info.icon || "link")}</g>
        <text class="lg-tile-label" y="31" text-anchor="middle">${esc(clip(text.detail || text.title, 18))}</text>
      </g>`;
    })
    .join("");

  const personNodes = persons
    .map(({ id, member }) => {
      const p = pos.get(id);
      const ident = member.identity;
      const clipId = `lg-c-${esc(ident.userId)}`;
      const sub = member.sub || (member.wins ? `${member.wins} поб.${member.paid ? ` · ${member.paid} выпл.` : ""}` : "без побед");
      return `<a href="/admin/users/${encodeURIComponent(ident.userId)}" class="lg-person${member.paid ? " is-paid" : ""}${member.winner ? " is-winner" : ""}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
        <title>${esc(`${ident.title}${ident.handle ? ` ${ident.handle}` : ""} — ${sub}`)}</title>
        <clipPath id="${clipId}"><circle r="22" /></clipPath>
        <circle class="lg-ring" r="25" />
        <g style="${esc(avatarStyle(ident.userId || ident.title))}"><circle class="lg-face" r="22" style="fill:var(--ava-b)" /><text class="lg-initials" dy="0.35em" text-anchor="middle">${esc(ident.initials || "?")}</text></g>
        ${ident.avatarUrl ? `<image href="${esc(ident.avatarUrl)}" x="-22" y="-22" width="44" height="44" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />` : ""}
        <text class="lg-name" y="40" text-anchor="middle">${esc(clip(ident.title, 16))}</text>
        <text class="lg-sub" y="54" text-anchor="middle">${esc(sub)}</text>
      </a>`;
    })
    .join("");

  return `<svg class="lg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Граф связей">
    <defs>
      <marker id="lg-arrow" viewBox="0 0 10 10" refX="34" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="lg-arrow" /></marker>
    </defs>
    ${lines}${tileNodes}${personNodes}
  </svg>`;
}

const GLYPHS = { wallet: "₮", account: "ID", shot: "▣", device: "▯", fpnet: "≈", ip: "IP", ipdraw: "IP", chain: "↔", chainpending: "?" };

// What a tile means, in a sentence for the side panel.
function explainEvidence(entry) {
  const n = entry.users.size;
  switch (entry.kind) {
    case "wallet":
      return `Один кошелёк указали ${n} аккаунта. Адрес пополнения у каждого аккаунта на проекте свой — у них один хозяин. Приз обнуляется.`;
    case "account":
      return `Один ID проекта у ${n} аккаунтов. Одного аккаунта на проекте у двух людей быть не может. Приз обнуляется.`;
    case "shot":
      return `Один и тот же файл скриншота профиля от ${n} аккаунтов. Приз обнуляется.`;
    case "device":
      return "Один телефон: одинаковый ID устройства в Telegram. Приз обнуляется.";
    case "fpnet":
      return "Одинаковый отпечаток телефона из одной и той же сети. Приз обнуляется.";
    case "ip":
      return `Одна сеть в ${entry.meta?.draws || 2} розыгрышах вместе. Бывает у соседей и семьи — только наблюдение, приз не режет.`;
    case "chain":
      return entry.meta?.kind === "transfer"
        ? "Деньги ходили напрямую между адресами этих людей. Один кошелёк не может быть у разных людей. Приз обнуляется."
        : `Небольшой кошелёк (не касса и не биржа) связан с адресами ${n} наших людей — у них один хозяин. Приз обнуляется.`;
    case "ipdraw":
      return `Один IP у ${n} участников этого розыгрыша. В одном розыгрыше так бывает у семьи и соседей — только наблюдение, приз не режет.`;
    case "chainpending":
      return "Общий кошелёк ещё не проверен: касса или биржа это или человек. Пока только наблюдение — проверка идёт в фоне.";
    case "referral":
      return "Приглашение по реферальной ссылке.";
    default:
      return "";
  }
}

/** The live graph's data: positions from the server's layout, every text ready. */
function buildGraphData(cluster, { avatarColor, width = 960, height = 560 }) {
  const persons = cluster.members.map((m) => ({ id: `u:${m.identity.userId}`, member: m }));
  const tiles = cluster.evidence.filter((e) => e.kind !== "referral").map((e) => ({ id: `e:${e.key}`, entry: e }));
  const edges = [];
  for (const tile of tiles) for (const userId of tile.entry.users) edges.push({ source: `u:${userId}`, target: tile.id, kind: tile.entry.kind });
  for (const entry of cluster.evidence.filter((e) => e.kind === "referral")) {
    edges.push({ source: `u:${entry.meta.from}`, target: `u:${entry.meta.to}`, kind: "referral" });
  }
  const pos = layoutGraph([...persons.map((p) => p.id), ...tiles.map((t) => t.id)], edges.map((e) => [e.source, e.target]), { width, height });
  const nodes = [
    ...persons.map(({ id, member }) => ({
      id,
      type: "person",
      userId: member.identity.userId,
      title: member.identity.title,
      handle: member.identity.handle || "",
      initials: member.identity.initials || "?",
      avatarUrl: member.identity.avatarUrl || "",
      color: avatarColor(member.identity.userId || member.identity.title),
      wins: member.wins,
      paid: member.paid,
      sub: member.sub || "",
      winner: Boolean(member.winner),
      href: `/admin/users/${encodeURIComponent(member.identity.userId)}`,
      x: pos.get(id).x,
      y: pos.get(id).y,
    })),
    ...tiles.map(({ id, entry }) => {
      const text = describeEvidence(entry);
      return {
        id,
        type: "evidence",
        kind: entry.kind,
        kindTitle: (KIND_INFO[entry.kind] || {}).title || entry.kind,
        title: text.title,
        detail: text.detail,
        full: text.full,
        copy: ["wallet", "chain"].includes(entry.kind) && entry.meta?.kind !== "transfer" ? entry.label : entry.kind === "account" ? String(entry.label).split(" ").slice(1).join(" ") : "",
        explain: explainEvidence(entry),
        people: entry.users.size,
        glyph: GLYPHS[entry.kind] || "•",
        x: pos.get(id).x,
        y: pos.get(id).y,
      };
    }),
  ];
  return { width, height, nodes, edges };
}

/** The live graph: the static drawing underneath, data, and the script that takes over. */
function renderLiveGraph(cluster, { icon, avatarStyle, width = 960, height = 560 }) {
  const avatarColor = (seed) => (/--ava-b:([^;]+)/.exec(avatarStyle(seed)) || [])[1] || "#8E8E93";
  const data = buildGraphData(cluster, { avatarColor, width, height });
  const kinds = [...new Set(cluster.evidence.map((e) => e.kind))].sort((a, b) => Number(STRONG.has(b)) - Number(STRONG.has(a)));
  const filters = kinds
    .map((kind) => {
      const info = KIND_INFO[kind] || { title: kind, icon: "link" };
      return `<button type="button" class="lg-chip lg-${kind} lg-filter" data-lg-kind="${esc(kind)}" aria-pressed="true">${icon(info.icon)}${esc(info.title)}</button>`;
    })
    .join("");
  return `<div class="lg-root" data-lg-root>
    <div class="lg-toolbar">
      <div class="lg-chips" data-lg-filters>${filters}</div>
      <div class="lg-tools">
        <button type="button" class="lg-tool" data-lg-act="out" aria-label="Отдалить">−</button>
        <button type="button" class="lg-tool" data-lg-act="in" aria-label="Приблизить">+</button>
        <button type="button" class="lg-tool lg-tool-text" data-lg-act="fit">Вписать</button>
        <button type="button" class="lg-tool lg-tool-text" data-lg-act="reset">Сбросить</button>
      </div>
    </div>
    <div class="lg-canvas">
      <div class="lg-stage" data-lg-stage>${renderClusterGraph(cluster, { icon, avatarStyle, width: data.width, height: data.height })}</div>
      <div class="lg-tip" data-lg-tip hidden></div>
      <aside class="lg-side" data-lg-side hidden></aside>
    </div>
    <div class="lg-hint">Тащите кружки и фон · Ctrl/⌘ + колесо или щипок — масштаб · наведение — связи · клик — подробности · двойной клик — открепить</div>
    <script type="application/json" data-lg-json>${scriptJson(data)}</script>
    <script>(${linkGraphClient.toString()})(document.currentScript.closest("[data-lg-root]"), JSON.parse(document.currentScript.previousElementSibling.textContent));</script>
  </div>`;
}

// Styles of the graph, on top of the admin's tokens.
const LINK_GRAPH_STYLES = `
.lg { width: 100%; height: auto; display: block; }
.lg-edge { stroke-width: 1.6; stroke-linecap: round; opacity: .55; }
.lg-wallet, .lg-account, .lg-shot, .lg-device, .lg-fpnet, .lg-chain { --kind: var(--red); }
.lg-ip { --kind: var(--blue); }
.lg-ipdraw { --kind: var(--teal); }
.lg-chainpending { --kind: var(--orange); }
.lg-referral { --kind: var(--gray); }
.lg-edge { stroke: var(--kind); }
.lg-edge.lg-referral { stroke-dasharray: 4 4; opacity: .7; }
.lg-arrow { fill: var(--gray); }
.lg-tile rect { fill: color-mix(in srgb, var(--kind) 16%, var(--bg-elevated)); stroke: var(--kind); stroke-width: 1.4; }
.lg-tile .lg-glyph { color: var(--kind); }
.lg-tile-label { font-size: 10.5px; font-weight: 600; fill: var(--label-2); }
.lg-person { cursor: pointer; }
.lg-person .lg-ring { fill: var(--bg-elevated); stroke: var(--separator); stroke-width: 1.5; }
.lg-person.is-paid .lg-ring { stroke: var(--red); stroke-width: 2.5; }
.lg-person.is-winner .lg-ring { stroke: var(--yellow); stroke-width: 3.5; }
.lg-initials { fill: #fff; font-size: 15px; font-weight: 700; }
.lg-name { font-size: 12px; font-weight: 650; fill: var(--label); }
.lg-sub { font-size: 10.5px; fill: var(--label-3); }
.lg-person:hover .lg-ring { stroke: var(--tint); stroke-width: 2.5; }
.lg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lg-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600;
  color: var(--kind); background: color-mix(in srgb, var(--kind) 14%, transparent); }
.lg-chip .ic { width: 13px; height: 13px; }
.lg-faces { display: flex; }
.lg-faces > * { margin-left: -8px; box-shadow: 0 0 0 2px var(--bg-elevated); border-radius: 50%; }
.lg-faces > *:first-child { margin-left: 0; }

.lg-root { position: relative; }
.lg-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.lg-tools { display: flex; gap: 6px; }
.lg-tool { min-width: 34px; height: 32px; padding: 0 10px; border: 0; border-radius: 10px; background: var(--fill); color: var(--label); font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
.lg-tool-text { font-size: 13px; }
.lg-tool:hover { background: var(--fill-strong); }
.lg-filter { border: 0; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; }
.lg-filter.is-off { opacity: .4; text-decoration: line-through; }
.lg-canvas { position: relative; border-radius: 16px; background:
  radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--label) 9%, transparent) 1px, transparent 0) 0 0 / 22px 22px, var(--fill);
  overflow: hidden; touch-action: none; }
.lg-stage { height: min(620px, 72vh); min-height: 380px; }
.lg-stage .lg { width: 100%; height: 100%; }
.lg-live { cursor: grab; user-select: none; -webkit-user-select: none; }
.lg-live.is-dragging { cursor: grabbing; }
.lg-live .lg-person, .lg-live .lg-tile { cursor: pointer; transition: opacity .18s; }
.lg-live .lg-edge { transition: opacity .18s, stroke-width .18s; }
.lg-live.has-focus .lg-person:not(.is-lit), .lg-live.has-focus .lg-tile:not(.is-lit) { opacity: .18; }
.lg-live.has-focus .lg-edge { opacity: .06; }
.lg-live.has-focus .lg-edge.is-lit { opacity: 1; stroke-width: 2.6; }
.lg-live .is-selected .lg-ring { stroke: var(--tint); stroke-width: 3; }
.lg-live .lg-tile.is-selected rect { stroke-width: 2.6; }
.lg-live .is-pinned .lg-ring { stroke-dasharray: 3 3; }
.lg-live.is-far .lg-tile-label, .lg-live.is-far .lg-sub { display: none; }
.lg-tile-glyph { font-size: 11px; font-weight: 800; fill: var(--kind); }
.lg-tip { position: absolute; left: 0; top: 0; z-index: 3; max-width: 280px; padding: 10px 12px; border-radius: 12px; pointer-events: none;
  background: var(--bg-elevated); color: var(--label); box-shadow: 0 10px 30px rgba(0,0,0,.25), 0 0 0 .5px var(--separator); font-size: 12.5px; }
.lg-tip-title { font-weight: 700; font-size: 13.5px; margin-bottom: 2px; }
.lg-tip-sub { color: var(--label-2); overflow-wrap: anywhere; }
.lg-tip-list { margin: 6px 0 0; padding-left: 16px; color: var(--label); }
.lg-tip-list li { margin: 1px 0; }
.lg-tip-more { color: var(--label-3); list-style: none; margin-left: -16px; }
.lg-side { position: absolute; top: 12px; right: 12px; bottom: 12px; z-index: 2; width: min(300px, calc(100% - 24px)); overflow: auto; padding: 14px;
  border-radius: 14px; background: var(--bg-elevated); box-shadow: 0 12px 40px rgba(0,0,0,.28), 0 0 0 .5px var(--separator); }
.lg-side-head { position: relative; padding-right: 28px; }
.lg-side-kind { color: var(--label-2); font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.lg-side-title { font-size: 17px; font-weight: 700; margin: 2px 0 4px; overflow-wrap: anywhere; }
.lg-side-close { position: absolute; top: -4px; right: -4px; width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--fill); color: var(--label); font-size: 18px; cursor: pointer; }
.lg-side-sub { color: var(--label-2); font-size: 13px; margin: 4px 0 10px; overflow-wrap: anywhere; }
.lg-side-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 6px 0 12px; }
.lg-side-stat { padding: 8px; border-radius: 10px; background: var(--fill); text-align: center; }
.lg-side-stat b { display: block; font-size: 17px; }
.lg-side-stat span { color: var(--label-2); font-size: 11.5px; }
.lg-side-btn { display: inline-flex; align-items: center; justify-content: center; height: 34px; padding: 0 14px; margin: 0 6px 10px 0; border: 0; border-radius: 10px;
  background: var(--tint); color: #fff; font: inherit; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; }
.lg-side-copy { background: var(--fill); color: var(--label); }
.lg-side-code { display: block; padding: 8px 10px; margin: 6px 0 8px; border-radius: 10px; background: var(--fill); font-size: 12px; overflow-wrap: anywhere; }
.lg-side-section { margin: 12px 0 6px; color: var(--label-2); font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.lg-side-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.lg-side-list button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border: 0; border-radius: 9px; background: var(--fill); color: var(--label); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.lg-side-list button:hover { background: var(--fill-strong); }
.lg-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--kind, var(--gray)); }
.lg-side-list .lg-k-wallet, .lg-side-list .lg-k-account, .lg-side-list .lg-k-shot, .lg-side-list .lg-k-device, .lg-side-list .lg-k-fpnet, .lg-side-list .lg-k-chain { --kind: var(--red); }
.lg-side-list .lg-k-ip { --kind: var(--blue); }
.lg-side-list .lg-k-ipdraw { --kind: var(--teal); }
.lg-side-list .lg-k-chainpending { --kind: var(--orange); }
.lg-hint { margin-top: 8px; color: var(--label-3); font-size: 12px; }
.lg-verdict { display: flex; flex-wrap: wrap; gap: 14px 22px; align-items: center; }
.lg-verdict-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-weight: 700; font-size: 13px; }
.lg-verdict-badge.is-strong { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.lg-verdict-badge.is-watch { color: var(--label-2); background: var(--fill); }
.lg-verdict-text { flex: 1 1 320px; font-size: 14px; color: var(--label); }
.lg-verdict-stats { display: flex; gap: 18px; }
.lg-verdict-stats div { text-align: center; }
.lg-verdict-stats b { display: block; font-size: 20px; }
.lg-verdict-stats span { color: var(--label-2); font-size: 12px; }
.lg-search { box-sizing: border-box; width: 100%; height: 38px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--fill); color: var(--label); font: inherit; font-size: 14px; }
.lg-reason { color: var(--label-2); font-size: 12.5px; margin-top: 3px; }
[data-lg-filter] .segmented { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
@media (max-width: 720px) {
  .lg-side { top: auto; left: 12px; width: auto; max-height: 55%; }
  .lg-row .lg-verdict-badge { display: none; }
  .lg-row .lg-faces > *:nth-child(n+3) { display: none; }
  .lg-row .row-main { min-width: 0; }
}
`;

// The cluster in one line: its strongest pieces of evidence, in words.
function summarizeCluster(cluster) {
  const order = ["account", "wallet", "shot", "device", "fpnet", "chain", "chainpending", "ip", "ipdraw", "referral"];
  const parts = [];
  for (const kind of order) {
    const items = cluster.evidence.filter((e) => e.kind === kind);
    if (!items.length) continue;
    const biggest = Math.max(...items.map((e) => e.users.size));
    const full = (KIND_INFO[kind] || { title: kind }).title;
    // Only the first letter goes small: "ID" stays "ID".
    const title = full.charAt(0).toLowerCase() + full.slice(1);
    parts.push(kind === "referral" ? `${title} ×${items.length}` : `${title}${biggest > 2 ? ` у ${biggest}` : ""}${items.length > 1 ? ` (×${items.length})` : ""}`);
  }
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// What the search box on the list looks through.
function searchTextOf(cluster) {
  return [
    ...cluster.members.flatMap((m) => [m.identity.title, m.identity.handle, m.identity.userId]),
    ...cluster.evidence.map((e) => e.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderKindChips(kinds, icon) {
  return Object.entries(kinds)
    .sort((a, b) => Number(STRONG.has(b[0])) - Number(STRONG.has(a[0])))
    .map(([kind, n]) => {
      const info = KIND_INFO[kind] || { title: kind, icon: "link" };
      return `<span class="lg-chip lg-${kind}">${icon(info.icon)}${esc(info.title)}${n > 1 ? ` ×${n}` : ""}</span>`;
    })
    .join("");
}

module.exports = {
  KIND_INFO,
  describeEvidence,
  buildLinksView,
  layoutGraph,
  renderClusterGraph,
  renderLiveGraph,
  buildGraphData,
  explainEvidence,
  summarizeCluster,
  searchTextOf,
  renderKindChips,
  LINK_GRAPH_STYLES,
};
