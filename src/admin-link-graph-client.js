// The live graph of a cluster on «Связи»: the faces can be dragged, the
// drawing panned and zoomed, a hover lights up what a face or a tile is tied
// to, a click opens the details at the side. Physics like a force layout:
// faces push each other away, links pull like springs.
//
// The function below runs in the browser: it is put into the page as its own
// text (Function.prototype.toString), so it must not reach for anything of
// Node's. The server's static drawing stays underneath until it starts, and is
// what is seen without JavaScript. Every text is put in with textContent, never
// as HTML: names come from Telegram.

function linkGraphClient(root, data) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stage = root.querySelector("[data-lg-stage]");
  var tip = root.querySelector("[data-lg-tip]");
  var side = root.querySelector("[data-lg-side]");
  var chips = root.querySelector("[data-lg-filters]");
  if (!stage) return;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var key in attrs) if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function html(tag, cls, text, parent) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  // ── model ──
  var nodes = data.nodes.map(function (n) {
    return Object.assign({}, n, { vx: 0, vy: 0, fixed: false, links: [] });
  });
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });
  var edges = data.edges
    .map(function (e) { return { source: byId[e.source], target: byId[e.target], kind: e.kind }; })
    .filter(function (e) { return e.source && e.target; });
  edges.forEach(function (e) { e.source.links.push(e); e.target.links.push(e); });
  var hiddenKinds = {};

  // ── drawing ──
  // The drawing takes the canvas's own size: a phone's tall canvas and a wide
  // desktop one both fill up, instead of a strip letterboxed in the middle.
  var W = Math.max(320, stage.clientWidth || data.width);
  var H = Math.max(320, stage.clientHeight || data.height);
  var scaleX = W / data.width;
  var scaleY = H / data.height;
  nodes.forEach(function (n) { n.x = n.x * scaleX; n.y = n.y * scaleY; });
  var svg = el("svg", { class: "lg lg-live", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Граф связей" });
  var defs = el("defs", {}, svg);
  var arrow = el("marker", { id: "lg-arrow-live", viewBox: "0 0 10 10", refX: "30", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0 0L10 5L0 10z", class: "lg-arrow" }, arrow);
  var view = el("g", { class: "lg-view" }, svg);
  var edgeLayer = el("g", {}, view);
  var nodeLayer = el("g", {}, view);

  edges.forEach(function (e) {
    e.line = el("line", { class: "lg-edge lg-" + e.kind + (e.kind === "referral" ? " lg-referral" : "") }, edgeLayer);
    if (e.kind === "referral") e.line.setAttribute("marker-end", "url(#lg-arrow-live)");
  });

  nodes.forEach(function (n) {
    var g = el("g", { class: n.type === "person" ? "lg-person" + (n.paid ? " is-paid" : "") : "lg-tile lg-" + n.kind, tabindex: "0" }, nodeLayer);
    n.g = g;
    if (n.type === "person") {
      var clipId = "lg-live-" + n.userId;
      var clip = el("clipPath", { id: clipId }, g);
      el("circle", { r: "22" }, clip);
      el("circle", { class: "lg-ring", r: "25" }, g);
      el("circle", { class: "lg-face", r: "22", style: "fill:" + n.color }, g);
      var initials = el("text", { class: "lg-initials", dy: "0.35em", "text-anchor": "middle" }, g);
      initials.textContent = n.initials || "?";
      if (n.avatarUrl) {
        var img = el("image", { x: "-22", y: "-22", width: "44", height: "44", "clip-path": "url(#" + clipId + ")", preserveAspectRatio: "xMidYMid slice" }, g);
        img.setAttribute("href", n.avatarUrl);
        img.addEventListener("error", function () { img.remove(); });
      }
      var name = el("text", { class: "lg-name", y: "40", "text-anchor": "middle" }, g);
      name.textContent = n.title.length > 16 ? n.title.slice(0, 15) + "…" : n.title;
      var sub = el("text", { class: "lg-sub", y: "54", "text-anchor": "middle" }, g);
      sub.textContent = n.wins ? n.wins + " поб." + (n.paid ? " · " + n.paid + " выпл." : "") : "без побед";
    } else {
      el("rect", { x: "-15", y: "-15", width: "30", height: "30", rx: "9", transform: "rotate(45)" }, g);
      var glyph = el("text", { class: "lg-tile-glyph", dy: "0.35em", "text-anchor": "middle" }, g);
      glyph.textContent = n.glyph || "•";
      var label = el("text", { class: "lg-tile-label", y: "31", "text-anchor": "middle" }, g);
      label.textContent = n.detail || n.title;
    }
  });

  stage.innerHTML = "";
  stage.appendChild(svg);

  // ── camera: pan and zoom ──
  var cam = { x: 0, y: 0, k: 1 };
  function applyCamera() {
    view.setAttribute("transform", "translate(" + cam.x + " " + cam.y + ") scale(" + cam.k + ")");
    svg.classList.toggle("is-far", cam.k < 0.65);
  }
  function toWorld(evt) {
    var rect = svg.getBoundingClientRect();
    var sx = ((evt.clientX - rect.left) / rect.width) * W;
    var sy = ((evt.clientY - rect.top) / rect.height) * H;
    return { x: (sx - cam.x) / cam.k, y: (sy - cam.y) / cam.k, sx: sx, sy: sy };
  }
  function zoomAt(sx, sy, factor) {
    var k = Math.min(3, Math.max(0.3, cam.k * factor));
    cam.x = sx - ((sx - cam.x) * k) / cam.k;
    cam.y = sy - ((sy - cam.y) * k) / cam.k;
    cam.k = k;
    applyCamera();
  }
  function fit() {
    var xs = nodes.map(function (n) { return n.x; });
    var ys = nodes.map(function (n) { return n.y; });
    var minX = Math.min.apply(null, xs) - 95, maxX = Math.max.apply(null, xs) + 95;
    var minY = Math.min.apply(null, ys) - 50, maxY = Math.max.apply(null, ys) + 80;
    var k = Math.min(2, W / (maxX - minX), H / (maxY - minY));
    cam.k = k;
    cam.x = (W - (maxX + minX) * k) / 2;
    cam.y = (H - (maxY + minY) * k) / 2;
    applyCamera();
  }
  // The wheel scrolls the page as everywhere else; Ctrl/⌘ + wheel - and a
  // trackpad pinch, which arrives as one - zooms the drawing.
  svg.addEventListener("wheel", function (evt) {
    if (!evt.ctrlKey && !evt.metaKey) return;
    evt.preventDefault();
    touched = true;
    var p = toWorld(evt);
    zoomAt(p.sx, p.sy, evt.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  // ── physics ──
  var alpha = reduceMotion ? 0 : 0.6;
  var running = false;
  function tick() {
    var i, j, a, b, dx, dy, d2, d, f;
    for (i = 0; i < nodes.length; i++) {
      a = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        b = nodes[j];
        dx = a.x - b.x;
        dy = a.y - b.y;
        d2 = dx * dx + dy * dy || 0.01;
        d = Math.sqrt(d2);
        f = (2600 / d2) * alpha;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    edges.forEach(function (e) {
      if (hiddenKinds[e.kind]) return;
      dx = e.target.x - e.source.x;
      dy = e.target.y - e.source.y;
      d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      var rest = e.kind === "referral" ? 150 : 105;
      f = (d - rest) * 0.04 * alpha;
      e.source.vx += (dx / d) * f; e.source.vy += (dy / d) * f;
      e.target.vx -= (dx / d) * f; e.target.vy -= (dy / d) * f;
    });
    nodes.forEach(function (n) {
      n.vx += (W / 2 - n.x) * 0.002 * alpha;
      n.vy += (H / 2 - n.y) * 0.002 * alpha;
      if (n.fixed) { n.vx = 0; n.vy = 0; return; }
      n.vx *= 0.6; n.vy *= 0.6;
      n.x += n.vx; n.y += n.vy;
    });
    alpha *= 0.985;
  }
  function draw() {
    edges.forEach(function (e) {
      e.line.setAttribute("x1", e.source.x.toFixed(1));
      e.line.setAttribute("y1", e.source.y.toFixed(1));
      e.line.setAttribute("x2", e.target.x.toFixed(1));
      e.line.setAttribute("y2", e.target.y.toFixed(1));
    });
    nodes.forEach(function (n) { n.g.setAttribute("transform", "translate(" + n.x.toFixed(1) + " " + n.y.toFixed(1) + ")"); });
  }
  // The forces spread the faces after the first fit: once they settle the
  // drawing is fitted again, unless the owner has moved or zoomed it already.
  var touched = false;
  function loop() {
    if (alpha < 0.005) {
      running = false;
      if (!touched) fit();
      return;
    }
    tick();
    draw();
    requestAnimationFrame(loop);
  }
  function heat(value) {
    if (reduceMotion) { draw(); return; }
    alpha = Math.max(alpha, value);
    if (!running) { running = true; requestAnimationFrame(loop); }
  }

  // ── hover: what this is tied to ──
  // What lights up: a face, its tiles, and the other faces on those tiles -
  // the people it shares them with, not only the evidence itself.
  function visible(e) { return !hiddenKinds[e.kind]; }
  function partnersVia(tile, n) {
    var out = [];
    tile.links.forEach(function (e) {
      if (!visible(e)) return;
      var other = e.source === tile ? e.target : e.source;
      if (other !== n && out.indexOf(other) === -1) out.push(other);
    });
    return out;
  }
  function litSets(n) {
    var nodesLit = {};
    var edgesLit = [];
    nodesLit[n.id] = true;
    n.links.forEach(function (e) {
      if (!visible(e)) return;
      var other = e.source === n ? e.target : e.source;
      nodesLit[other.id] = true;
      edgesLit.push(e);
      if (n.type === "person" && other.type === "evidence") {
        other.links.forEach(function (e2) {
          if (!visible(e2)) return;
          var far = e2.source === other ? e2.target : e2.source;
          nodesLit[far.id] = true;
          edgesLit.push(e2);
        });
      }
    });
    return { nodes: nodesLit, edges: edgesLit };
  }
  function focus(n) {
    if (!n) {
      svg.classList.remove("has-focus");
      nodes.forEach(function (m) { m.g.classList.remove("is-lit"); });
      edges.forEach(function (e) { e.line.classList.remove("is-lit"); });
      return;
    }
    var lit = litSets(n);
    svg.classList.add("has-focus");
    nodes.forEach(function (m) { m.g.classList.toggle("is-lit", !!lit.nodes[m.id]); });
    edges.forEach(function (e) { e.line.classList.toggle("is-lit", lit.edges.indexOf(e) !== -1); });
  }
  // "Общий кошелёк TWalle…1111 — с Ольга, Алексей"; for a tile, its people.
  function describeLinks(n) {
    var lines = [];
    n.links.forEach(function (e) {
      if (!visible(e)) return;
      var other = e.source === n ? e.target : e.source;
      if (other.type === "evidence") {
        var names = partnersVia(other, n).map(function (p) { return p.title; });
        lines.push(other.title + (other.detail ? " " + other.detail : "") + (names.length ? " — с " + names.join(", ") : ""));
      } else if (e.kind === "referral") {
        lines.push((e.source === n ? "Пригласил " : "Его пригласил ") + other.title);
      } else {
        lines.push(other.title);
      }
    });
    return lines;
  }
  function showTip(n, evt) {
    tip.innerHTML = "";
    html("div", "lg-tip-title", n.title, tip);
    if (n.type === "person") {
      html("div", "lg-tip-sub", [n.handle, "ID " + n.userId].filter(Boolean).join(" · "), tip);
      html("div", "lg-tip-sub", (n.wins || 0) + " побед · " + (n.paid || 0) + " выплат", tip);
    } else {
      html("div", "lg-tip-sub", n.full || n.detail || "", tip);
      html("div", "lg-tip-sub", "у " + n.people + " чел.", tip);
    }
    var list = describeLinks(n);
    if (list.length) {
      var ul = html("ul", "lg-tip-list", null, tip);
      list.slice(0, 8).forEach(function (line) { html("li", null, line, ul); });
      if (list.length > 8) html("li", "lg-tip-more", "и ещё " + (list.length - 8), ul);
    }
    tip.hidden = false;
    moveTip(evt);
  }
  function moveTip(evt) {
    var box = root.getBoundingClientRect();
    var x = evt.clientX - box.left + 14;
    var y = evt.clientY - box.top + 14;
    var maxX = box.width - tip.offsetWidth - 8;
    tip.style.transform = "translate(" + Math.max(8, Math.min(x, maxX)) + "px," + y + "px)";
  }

  // ── side panel: the details of what was clicked ──
  function openSide(n) {
    side.innerHTML = "";
    var head = html("div", "lg-side-head", null, side);
    html("div", "lg-side-kind", n.type === "person" ? "Человек" : n.kindTitle, head);
    html("div", "lg-side-title", n.title, head);
    var close = html("button", "lg-side-close", "×", head);
    close.type = "button";
    close.setAttribute("aria-label", "Закрыть");
    close.addEventListener("click", function () { side.hidden = true; select(null); });
    if (n.type === "person") {
      html("div", "lg-side-sub", [n.handle, "ID " + n.userId].filter(Boolean).join(" · "), side);
      var stats = html("div", "lg-side-stats", null, side);
      [["Побед", n.wins || 0], ["Выплат", n.paid || 0], ["Связей", describeLinks(n).length]].forEach(function (s) {
        var cell = html("div", "lg-side-stat", null, stats);
        html("b", null, String(s[1]), cell);
        html("span", null, s[0], cell);
      });
      var open = html("a", "lg-side-btn", "Открыть карточку", side);
      open.href = n.href;
    } else {
      if (n.full) {
        var full = html("code", "lg-side-code", n.full, side);
        var copy = html("button", "lg-side-btn lg-side-copy", "Копировать", side);
        copy.type = "button";
        copy.addEventListener("click", function () {
          if (navigator.clipboard) navigator.clipboard.writeText(n.copy || n.full).then(function () { copy.textContent = "Скопировано"; });
        });
        full.title = n.full;
      }
      html("div", "lg-side-sub", n.explain || "", side);
    }
    html("div", "lg-side-section", n.type === "person" ? "Чем связан" : "У кого", side);
    var ul = html("ul", "lg-side-list", null, side);
    n.links.forEach(function (e) {
      if (hiddenKinds[e.kind]) return;
      var other = e.source === n ? e.target : e.source;
      var li = html("li", "lg-k-" + (other.kind || e.kind), null, ul);
      var a = html("button", null, null, li);
      a.type = "button";
      html("span", "lg-dot", null, a);
      var partners = other.type === "evidence" ? partnersVia(other, n).map(function (p) { return p.title; }) : [];
      html("span", null, other.type === "evidence" ? other.title + (other.detail ? " · " + other.detail : "") + (partners.length ? " — с " + partners.join(", ") : "") : (e.kind === "referral" ? (e.source === n ? "Пригласил: " : "Его пригласил: ") : "") + other.title, a);
      a.addEventListener("click", function () { select(other); });
    });
    side.hidden = false;
  }
  var selected = null;
  function select(n) {
    if (selected) selected.g.classList.remove("is-selected");
    selected = n;
    if (n) {
      n.g.classList.add("is-selected");
      focus(n);
      openSide(n);
    } else {
      focus(null);
    }
  }

  // ── pointer: drag a face, pan the background ──
  var drag = null;
  svg.addEventListener("pointerdown", function (evt) {
    var target = evt.target.closest ? evt.target.closest(".lg-person, .lg-tile") : null;
    var p = toWorld(evt);
    if (target) {
      var n = nodes.find(function (m) { return m.g === target; });
      drag = { node: n, dx: n.x - p.x, dy: n.y - p.y, moved: false, startX: evt.clientX, startY: evt.clientY };
      n.fixed = true;
      tip.hidden = true;
    } else {
      drag = { pan: true, x: cam.x, y: cam.y, sx: p.sx, sy: p.sy };
    }
    touched = true;
    svg.setPointerCapture(evt.pointerId);
    svg.classList.add("is-dragging");
  });
  svg.addEventListener("pointermove", function (evt) {
    if (!drag) {
      var hit = evt.target.closest ? evt.target.closest(".lg-person, .lg-tile") : null;
      var n = hit ? nodes.find(function (m) { return m.g === hit; }) : null;
      if (n) { if (!selected) focus(n); showTip(n, evt); } else { if (!selected) focus(null); tip.hidden = true; }
      return;
    }
    var p = toWorld(evt);
    if (drag.pan) {
      cam.x = drag.x + (p.sx - drag.sx);
      cam.y = drag.y + (p.sy - drag.sy);
      applyCamera();
      return;
    }
    if (Math.abs(evt.clientX - drag.startX) + Math.abs(evt.clientY - drag.startY) > 3) drag.moved = true;
    drag.node.x = p.x + drag.dx;
    drag.node.y = p.y + drag.dy;
    heat(0.3);
    draw();
  });
  function endDrag(evt) {
    if (!drag) return;
    svg.classList.remove("is-dragging");
    if (drag.node) {
      // A face put somewhere stays there; a tap is a click.
      if (!drag.moved) {
        drag.node.fixed = drag.node.pinned || false;
        select(drag.node === selected ? null : drag.node);
        if (!selected) side.hidden = true;
      } else {
        drag.node.pinned = true;
        drag.node.g.classList.add("is-pinned");
      }
    }
    drag = null;
    if (evt && svg.hasPointerCapture && svg.hasPointerCapture(evt.pointerId)) svg.releasePointerCapture(evt.pointerId);
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", function () { if (!drag) { tip.hidden = true; if (!selected) focus(null); } });
  svg.addEventListener("dblclick", function (evt) {
    var hit = evt.target.closest ? evt.target.closest(".lg-person, .lg-tile") : null;
    var n = hit ? nodes.find(function (m) { return m.g === hit; }) : null;
    if (n) { n.fixed = false; n.pinned = false; n.g.classList.remove("is-pinned"); heat(0.4); }
    else { var p = toWorld(evt); zoomAt(p.sx, p.sy, 1.4); }
  });

  // ── toolbar and filters ──
  root.querySelectorAll("[data-lg-act]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var act = btn.getAttribute("data-lg-act");
      if (act === "in") zoomAt(W / 2, H / 2, 1.25);
      if (act === "out") zoomAt(W / 2, H / 2, 0.8);
      if (act === "fit") fit();
      if (act === "in" || act === "out") touched = true;
      if (act === "reset") {
        nodes.forEach(function (n) { n.fixed = false; n.pinned = false; n.x = n.x0; n.y = n.y0; n.g.classList.remove("is-pinned"); });
        draw();
        fit();
        heat(0.5);
      }
    });
  });
  if (chips) {
    chips.querySelectorAll("[data-lg-kind]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var kind = chip.getAttribute("data-lg-kind");
        hiddenKinds[kind] = !hiddenKinds[kind];
        chip.classList.toggle("is-off", hiddenKinds[kind]);
        chip.setAttribute("aria-pressed", String(!hiddenKinds[kind]));
        edges.forEach(function (e) { if (e.kind === kind) e.line.style.display = hiddenKinds[kind] ? "none" : ""; });
        nodes.forEach(function (n) { if (n.type === "evidence" && n.kind === kind) n.g.style.display = hiddenKinds[kind] ? "none" : ""; });
        heat(0.3);
      });
    });
  }

  nodes.forEach(function (n) { n.x0 = n.x; n.y0 = n.y; });
  draw();
  fit();
  heat(0.25);

  // A resized window keeps the drawing filling the canvas.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var w = Math.max(320, stage.clientWidth || W);
      var h = Math.max(320, stage.clientHeight || H);
      if (Math.abs(w - W) < 2 && Math.abs(h - H) < 2) return;
      W = w;
      H = h;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      fit();
    }, 150);
  });
}

module.exports = { linkGraphClient };
