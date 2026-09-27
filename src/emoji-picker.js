// The emoji picker for the post title.
//
// Typing emoji from a desktop keyboard is painful, and the title is the first
// line people read in the channel, so it is the one field where they earn their
// keep. Shaped after the iOS and Telegram pickers: the giveaway set and the
// recently used first, then every emoji there is by section, the sections'
// tabs along the bottom, and a search that speaks Russian (emoji-search.js).
//
// It opens in place under the field and pushes the form down. It used to float
// over the form, and a popover has to fit into whatever room is left under the
// field: it showed two rows.
//
// The full set (assets/emoji/emoji-data.json, ~1900 emoji with their Russian
// and English words) is too big to ride along in every panel page. It is
// fetched once the title field comes into view, and only once per device: its
// address carries a hash of the file.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { CATEGORIES } = require("./emoji-catalog");
const { createEmojiSearch } = require("./emoji-search");
const { scriptJson } = require("./script-json");

const EMOJI_DATA_FILE = path.join(__dirname, "..", "assets", "emoji", "emoji-data.json");
const EMOJI_DATA_PATH = "/emoji/data.json";

const FAVORED = (CATEGORIES.find((category) => category.id === "giveaway") || { emojis: [] }).emojis.map(([emoji]) => emoji);

let emojiData = null;
function readEmojiData() {
  if (!emojiData) {
    const raw = fs.readFileSync(EMOJI_DATA_FILE);
    emojiData = {
      raw,
      gzip: zlib.gzipSync(raw, { level: 9 }),
      version: crypto.createHash("sha1").update(raw).digest("hex").slice(0, 12),
      groups: JSON.parse(raw.toString("utf8")).groups,
    };
  }
  return emojiData;
}

function getEmojiDataUrl() {
  return `${EMOJI_DATA_PATH}?v=${readEmojiData().version}`;
}

// Sent packed by the app itself: nothing in front of it is sure to compress
// JSON, and the file is 260 KB as it is against 75 KB packed. The address
// changes whenever the file does, so a browser may keep it for a year.
function sendEmojiData(req, res) {
  const data = readEmojiData();
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Vary", "Accept-Encoding");
  res.set("Cache-Control", req.query && req.query.v === data.version ? "public, max-age=31536000, immutable" : "no-cache");
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
    res.set("Content-Encoding", "gzip");
    res.send(data.gzip);
    return;
  }
  res.send(data.raw);
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const lineIcon = (body, width = 1.8) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const SMILE = '<circle cx="12" cy="12" r="8.25"/><path d="M8.6 14.2c.8 1.35 2 2.05 3.4 2.05s2.6-.7 3.4-2.05"/><path d="M9.25 9.6v.6M14.75 9.6v.6"/>';

// Line icons for the section tabs, as the iOS keyboard draws them: a row of
// colour emoji along the bottom reads as more emoji to pick.
const TAB_ICONS = {
  recent: lineIcon('<circle cx="12" cy="12" r="8.25"/><path d="M12 7.75V12l2.75 1.75"/>'),
  giveaway: lineIcon(
    '<rect x="3.75" y="8.25" width="16.5" height="4" rx="1.1"/><path d="M5.25 12.25v6.5c0 .83.67 1.5 1.5 1.5h10.5c.83 0 1.5-.67 1.5-1.5v-6.5M12 8.25v12"/><path d="M12 8.25c-.9-2.6-4.6-3.7-4.6-1.5 0 1.2 1.6 1.5 4.6 1.5zm0 0c.9-2.6 4.6-3.7 4.6-1.5 0 1.2-1.6 1.5-4.6 1.5z"/>',
  ),
  smileys: lineIcon(SMILE),
  people: lineIcon('<circle cx="12" cy="8" r="3.5"/><path d="M5.25 19.5c.7-3.3 3.3-5.25 6.75-5.25s6.05 1.95 6.75 5.25"/>'),
  nature: lineIcon('<path d="M5.5 18.5C5.5 10 10.5 5.5 19 5c-.4 8.6-5 13.5-13.5 13.5z"/><path d="M5.5 18.5l7-7"/>'),
  food: lineIcon(
    '<path d="M5.5 9.25h10.25v4.5a5 5 0 0 1-5 5h-.25a5 5 0 0 1-5-5v-4.5z"/><path d="M15.75 10.75h1.4a2.35 2.35 0 0 1 0 4.7h-1.65"/><path d="M8.75 3.75c-.5.75-.5 1.5 0 2.25M12.25 3.75c-.5.75-.5 1.5 0 2.25"/>',
  ),
  activity: lineIcon(
    '<circle cx="12" cy="12" r="8.25"/><path d="M3.75 12h16.5M12 3.75v16.5M6.2 6.1c2.4 3.2 2.4 8.6 0 11.8M17.8 6.1c-2.4 3.2-2.4 8.6 0 11.8"/>',
  ),
  travel: lineIcon(
    '<path d="M4.75 16.75v-4.2l1.8-4.4a2 2 0 0 1 1.85-1.25h7.2a2 2 0 0 1 1.85 1.25l1.8 4.4v4.2a1 1 0 0 1-1 1H5.75a1 1 0 0 1-1-1z"/><path d="M4.75 12.55h14.5M7.75 15.1h.01M16.25 15.1h.01M6.75 17.75v1.5M17.25 17.75v1.5"/>',
  ),
  objects: lineIcon(
    '<path d="M9.25 17.25h5.5M10.25 20.25h3.5"/><path d="M12 3.75a5.5 5.5 0 0 0-3.2 9.97c.6.44.95 1.12.95 1.86v.17h4.5v-.17c0-.74.35-1.42.95-1.86A5.5 5.5 0 0 0 12 3.75z"/>',
  ),
  symbols: lineIcon('<path d="M12 19.5s-7-4.3-7-9.75a4 4 0 0 1 7-2.6 4 4 0 0 1 7 2.6c0 5.45-7 9.75-7 9.75z"/>'),
  flags: lineIcon('<path d="M5.75 20.25V4.25"/><path d="M5.75 4.75h11.5l-2.25 4 2.25 4H5.75"/>'),
};

const LABELS = { recent: "Недавние", giveaway: "Для розыгрышей" };

// Sits inside the title field's own box, on the right.
function getEmojiOpenButtonMarkup() {
  return `<button type="button" class="emoji-open" data-emoji-open aria-label="Эмодзи" aria-expanded="false">${lineIcon(SMILE)}</button>`;
}

// Goes right under the field, inside the same [data-emoji-field].
function getEmojiPanelMarkup() {
  const tabs = [{ id: "recent", label: LABELS.recent }, { id: "giveaway", label: LABELS.giveaway }, ...readEmojiData().groups]
    .map(
      (tab) =>
        `<button type="button" class="emoji-tab" data-tab="${escapeAttr(tab.id)}" title="${escapeAttr(tab.label)}" aria-label="${escapeAttr(tab.label)}" aria-pressed="false"${tab.id === "recent" ? " hidden" : ""}>${TAB_ICONS[tab.id] || escapeAttr(tab.icon)}</button>`,
    )
    .join("");
  return `
    <div class="emoji-panel" data-emoji-panel inert aria-hidden="true">
      <div class="emoji-panel-clip">
        <div class="emoji-box">
          <label class="emoji-search">
            ${lineIcon('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 2.2)}
            <input type="search" data-emoji-search placeholder="Поиск эмодзи" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Поиск эмодзи" />
          </label>
          <div class="emoji-scroll" data-emoji-scroll></div>
          <div class="emoji-tabs" data-emoji-tabs>${tabs}</div>
        </div>
      </div>
    </div>`;
}

// Goes after the planner styles and outside the layout filter: it is the
// picker's whole look, drawn with the planner's tokens. The long selectors
// outrank the planner's field rule (body input:not()x5, 0-5-2 and 0-6-2 when
// focused), which would otherwise paint the search like the form's fields.
function getEmojiPickerStyles() {
  return `
  body .emoji-input { position: relative; }
  :root body .emoji-input .draw-input { padding-right: 2.75rem; }
  :root body .emoji-input button.emoji-open {
    position: absolute;
    top: 50%;
    right: .3125rem;
    width: 2.25rem;
    height: 2.25rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateY(-50%);
    color: var(--label-2);
    background: none;
    border: 0;
    border-radius: 50%;
    box-shadow: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color .2s var(--ease), background-color .2s var(--ease);
  }
  :root body .emoji-input button.emoji-open svg { width: 1.375rem; height: 1.375rem; }
  :root body .emoji-input button.emoji-open[aria-expanded="true"] { color: var(--tint-ink); background: var(--fill); }
  @media (hover: hover) {
    :root body .emoji-input button.emoji-open:hover { color: var(--label); }
    :root body .emoji-input button.emoji-open[aria-expanded="true"]:hover { color: var(--tint-ink); }
  }

  /* 0fr to 1fr animates the height without knowing it. visibility waits for
     the closing animation to end, then takes the closed panel out of the tab
     order on the browsers that do not know inert. */
  body .emoji-panel {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
    transition: grid-template-rows .34s var(--ease), opacity .2s var(--ease), visibility 0s linear .34s;
  }
  body .emoji-panel.is-open {
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
    transition: grid-template-rows .34s var(--ease), opacity .24s var(--ease), visibility 0s;
  }
  body .emoji-panel-clip { min-height: 0; overflow: hidden; }
  /* Scrolled to on a phone when the search takes the keyboard; the margin
     keeps it clear of the sheet's grabber and close button. */
  body .emoji-box {
    display: flex;
    flex-direction: column;
    height: clamp(17rem, 52vh, 23.5rem);
    margin-top: .5rem;
    background: var(--fill);
    border-radius: var(--r-row);
    overflow: hidden;
    scroll-margin-top: 3.25rem;
  }
  body .emoji-panel { scroll-margin-bottom: .75rem; }

  :root body .emoji-panel label.emoji-search {
    position: relative;
    display: block;
    flex: 0 0 auto;
    margin: 0;
    padding: .5rem .5rem .25rem;
  }
  :root body .emoji-panel label.emoji-search svg {
    position: absolute;
    left: 1.25rem;
    top: calc(50% + .125rem);
    width: 1rem;
    height: 1rem;
    transform: translateY(-50%);
    color: var(--label-2);
    pointer-events: none;
  }
  :root body .emoji-panel .emoji-search input[data-emoji-search][type="search"][placeholder] {
    display: block;
    width: 100%;
    height: 2.25rem;
    min-height: 0;
    margin: 0;
    padding: 0 .875rem 0 2.25rem;
    -webkit-appearance: none;
    appearance: none;
    color: var(--label);
    background: var(--bg-elevated);
    border: 0;
    border-radius: 999px;
    box-shadow: none;
    font-size: 1rem;
    font-weight: 400;
    letter-spacing: -.01em;
  }
  :root body .emoji-panel .emoji-search input[data-emoji-search][type="search"][placeholder]:focus {
    outline: none;
    background: var(--bg-elevated);
    box-shadow: inset 0 0 0 1.5px var(--tint);
  }
  body .emoji-search input::placeholder { color: var(--label-3); }
  body .emoji-search input::-webkit-search-decoration { -webkit-appearance: none; }

  body .emoji-scroll {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0 .375rem .375rem;
  }
  body .emoji-sec-title {
    padding: .625rem .5rem .25rem;
    color: var(--label-2);
    font-size: .6875rem;
    font-weight: 600;
    letter-spacing: .03em;
    text-transform: uppercase;
  }
  body .emoji-sec[data-sec="search"] { padding-top: .25rem; }
  body .emoji-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(2.5rem, 1fr)); }
  :root body .emoji-grid button.emoji-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: auto;
    height: 2.75rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    color: inherit;
    background: none;
    border: 0;
    border-radius: .625rem;
    box-shadow: none;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
    font-size: 1.75rem;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform .2s var(--spring), background-color .15s var(--ease);
  }
  @media (hover: hover) {
    :root body .emoji-grid button.emoji-cell:hover { background: var(--fill-strong); }
  }
  :root body .emoji-grid button.emoji-cell:active { transform: scale(1.2); }
  body .emoji-note {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--label-2);
    font-size: .875rem;
  }

  body .emoji-tabs {
    flex: 0 0 auto;
    display: flex;
    justify-content: space-between;
    gap: .125rem;
    padding: .3125rem .375rem;
    border-top: .5px solid var(--separator);
  }
  :root body .emoji-tabs button.emoji-tab {
    flex: 1 1 0;
    min-width: 0;
    max-width: 2.5rem;
    height: 2.125rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--label-2);
    background: none;
    border: 0;
    border-radius: .5625rem;
    box-shadow: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color .2s var(--ease), background-color .2s var(--ease);
  }
  :root body .emoji-tabs button.emoji-tab[hidden] { display: none; }
  :root body .emoji-tabs button.emoji-tab svg { width: 1.25rem; height: 1.25rem; }
  :root body .emoji-tabs button.emoji-tab.is-on { color: var(--tint-ink); background: color-mix(in srgb, var(--tint) 14%, transparent); }

  /* The title is full: a shake, as a text field says no on iOS. */
  @keyframes emoji-field-full {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-.3rem); }
    40%, 80% { transform: translateX(.3rem); }
  }
  :root body .emoji-input .draw-input.emoji-full { animation: emoji-field-full .36s var(--ease); }

  @media (prefers-reduced-motion: reduce) {
    body .emoji-panel, body .emoji-panel.is-open { transition: none; }
    :root body .emoji-grid button.emoji-cell { transition: none; }
  }
  `;
}

function getEmojiPickerScript() {
  return `
  (function () {
    var DATA_URL = ${scriptJson(getEmojiDataUrl())};
    var FAVORED = ${scriptJson(FAVORED)};
    var LABELS = ${scriptJson(LABELS)};
    var RECENT_KEY = "draw:emoji:recent";
    var RECENT_MAX = 16;
    var engine = (${createEmojiSearch.toString()})();
    var favored = {};
    for (var f = 0; f < FAVORED.length; f++) favored[engine.bare(FAVORED[f])] = 1;
    var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

    // The full set, fetched once per page for every picker on it.
    var data = null;
    var index = null;
    var groupLists = null;
    var loading = null;
    function load() {
      if (data) return Promise.resolve(data);
      if (!loading) {
        loading = fetch(DATA_URL, { credentials: "same-origin" })
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          })
          .then(function (json) {
            index = engine.prepare(json.items);
            groupLists = json.groups.map(function () { return []; });
            for (var i = 0; i < json.items.length; i++) {
              var list = groupLists[json.items[i][1]];
              if (list) list.push(json.items[i][0]);
            }
            data = json;
            return data;
          })
          .catch(function (error) {
            loading = null;
            throw error;
          });
      }
      return loading;
    }

    function readRecent() {
      try {
        var raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        return Array.isArray(raw)
          ? raw.filter(function (x) { return typeof x === "string" && x.length > 0 && x.length <= 16; }).slice(0, RECENT_MAX)
          : [];
      } catch (_e) { return []; }
    }
    function pushRecent(emoji) {
      try {
        var list = readRecent().filter(function (x) { return engine.bare(x) !== engine.bare(emoji); });
        list.unshift(emoji);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
      } catch (_e) { /* private mode: no history then */ }
    }

    function escapeText(text) {
      return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function cells(list) {
      var html = "";
      for (var i = 0; i < list.length; i++) html += '<button type="button" class="emoji-cell">' + escapeText(list[i]) + "</button>";
      return html;
    }
    function section(id, title, list) {
      return '<div class="emoji-sec" data-sec="' + id + '">' +
        (title ? '<div class="emoji-sec-title">' + escapeText(title) + "</div>" : "") +
        '<div class="emoji-grid">' + cells(list) + "</div></div>";
    }
    function note(text) {
      return '<div class="emoji-note">' + escapeText(text) + "</div>";
    }

    function setup(field) {
      var input = field.querySelector("input.draw-input");
      var toggle = field.querySelector("[data-emoji-open]");
      var panel = field.querySelector("[data-emoji-panel]");
      if (!input || !toggle || !panel) return;
      var search = panel.querySelector("[data-emoji-search]");
      var scroll = panel.querySelector("[data-emoji-scroll]");
      var tabs = panel.querySelector("[data-emoji-tabs]");
      var mode = "";
      var failed = false;
      var pendingTab = "";
      var spyPausedUntil = 0;
      var spyQueued = false;
      // Where the caret was when the title lost focus. Tapping an emoji must
      // not bring a phone's keyboard back up over the picker, so the title is
      // not refocused there - and setting its value moves its own caret to the
      // end, so the next emoji would land there instead of after this one.
      var caret = null;

      function isOpen() { return panel.classList.contains("is-open"); }

      function setActive(id) {
        var buttons = tabs.querySelectorAll("[data-tab]");
        for (var i = 0; i < buttons.length; i++) {
          var on = buttons[i].getAttribute("data-tab") === id;
          buttons[i].classList.toggle("is-on", on);
          buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
        }
      }

      function renderBrowse() {
        var recent = readRecent();
        var html = recent.length ? section("recent", LABELS.recent, recent) : "";
        html += section("giveaway", LABELS.giveaway, FAVORED);
        if (data) {
          for (var g = 0; g < data.groups.length; g++) html += section(data.groups[g].id, data.groups[g].label, groupLists[g]);
        } else {
          html += note(failed ? "Остальные эмодзи не загрузились. Закройте и откройте ещё раз" : "Загружаю все эмодзи…");
        }
        scroll.innerHTML = html;
        var recentTab = tabs.querySelector('[data-tab="recent"]');
        if (recentTab) recentTab.hidden = !recent.length;
        mode = "browse";
      }

      // Lights the tab of the section at the top of the view.
      function spy() {
        spyQueued = false;
        if (mode !== "browse" || Date.now() < spyPausedUntil) return;
        var secs = scroll.querySelectorAll("[data-sec]");
        if (!secs.length) return;
        var current = secs[0].getAttribute("data-sec");
        if (scroll.scrollTop > 0 && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4) {
          // Scrolled to the end: the last section is too short to reach the top.
          current = secs[secs.length - 1].getAttribute("data-sec");
        } else {
          var line = scroll.scrollTop + 12;
          for (var i = 0; i < secs.length && secs[i].offsetTop <= line; i++) current = secs[i].getAttribute("data-sec");
        }
        setActive(current);
      }

      // A near section glides into view; a far one is jumped to, as in
      // Telegram - a glide across a thousand emoji is a blur.
      function jump(id) {
        var sec = scroll.querySelector('[data-sec="' + id + '"]');
        if (!sec) return false;
        setActive(id);
        spyPausedUntil = Date.now() + 700;
        var near = Math.abs(sec.offsetTop - scroll.scrollTop) < scroll.clientHeight * 2.5;
        if (near && typeof scroll.scrollTo === "function") scroll.scrollTo({ top: sec.offsetTop, behavior: "smooth" });
        else scroll.scrollTop = sec.offsetTop;
        return true;
      }

      function runSearch() {
        if (!search.value.trim()) {
          renderBrowse();
          scroll.scrollTop = 0;
          spy();
          return;
        }
        mode = "search";
        setActive("");
        scroll.scrollTop = 0;
        if (!index) {
          scroll.innerHTML = note(failed ? "Эмодзи не загрузились. Закройте и откройте ещё раз" : "Загружаю эмодзи…");
          return;
        }
        var found = engine.search(index, search.value, { favored: favored, limit: 400 });
        scroll.innerHTML = found.length ? section("search", "", found) : note("Ничего не нашлось");
      }

      function whenLoaded() {
        if (!isOpen()) return;
        if (search.value.trim()) {
          runSearch();
          return;
        }
        var top = scroll.scrollTop;
        renderBrowse();
        scroll.scrollTop = top;
        var id = pendingTab;
        pendingTab = "";
        if (!id || !jump(id)) spy();
      }

      function open() {
        if (isOpen()) return;
        panel.classList.add("is-open");
        panel.removeAttribute("inert");
        panel.setAttribute("aria-hidden", "false");
        toggle.setAttribute("aria-expanded", "true");
        search.value = "";
        renderBrowse();
        scroll.scrollTop = 0;
        spy();
        if (!data) {
          failed = false;
          load().then(whenLoaded, function () {
            failed = true;
            whenLoaded();
          });
        }
        // On a phone the emoji button means "instead of the keyboard".
        if (coarse && document.activeElement === input) input.blur();
        if (!coarse) {
          try { search.focus({ preventScroll: true }); } catch (_e) { search.focus(); }
        }
        // Once it has grown, make sure all of it is on screen.
        setTimeout(function () {
          if (isOpen() && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 360);
      }

      function close() {
        if (!isOpen()) return;
        panel.classList.remove("is-open");
        panel.setAttribute("inert", "");
        panel.setAttribute("aria-hidden", "true");
        toggle.setAttribute("aria-expanded", "false");
        pendingTab = "";
        if (panel.contains(document.activeElement)) document.activeElement.blur();
      }
      field.emojiClose = close;

      function refuse() {
        input.classList.remove("emoji-full");
        void input.offsetWidth;
        input.classList.add("emoji-full");
        try { window.Telegram.WebApp.HapticFeedback.notificationOccurred("error"); } catch (_e) { /* not in Telegram */ }
      }

      // At the caret rather than at the end: the emoji usually belongs in
      // front of the words already typed.
      function insert(emoji) {
        var value = input.value;
        var focused = document.activeElement === input;
        var start = focused ? input.selectionStart : caret ? caret[0] : value.length;
        var end = focused ? input.selectionEnd : caret ? caret[1] : value.length;
        if (typeof start !== "number" || start > value.length) start = value.length;
        if (typeof end !== "number" || end > value.length || end < start) end = start;
        var next = value.slice(0, start) + emoji + value.slice(end);
        if (next.length > (Number(input.getAttribute("maxlength")) || 120)) {
          refuse();
          return;
        }
        input.value = next;
        var at = start + emoji.length;
        caret = [at, at];
        if (focused) {
          try { input.setSelectionRange(at, at); } catch (_e) { /* not a text field */ }
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        // Shown from the next opening on: moving the grid now would pull the
        // next emoji out from under the finger.
        pushRecent(emoji);
      }

      input.addEventListener("blur", function () {
        caret = [input.selectionStart, input.selectionEnd];
      });
      input.addEventListener("focus", function () {
        caret = null;
        // The keyboard comes up over the picker anyway.
        if (coarse) close();
      });
      // Escape closes one thing at a time: the picker here, and only the
      // next one reaches the sheet's own handler on the document.
      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      });
      input.addEventListener("animationend", function () {
        input.classList.remove("emoji-full");
      });

      // Clicking the picker leaves the focus where it was: in the title while
      // typing on a computer, in the search while searching on a phone.
      toggle.addEventListener("mousedown", function (event) { event.preventDefault(); });
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        if (isOpen()) close();
        else open();
      });
      panel.addEventListener("mousedown", function (event) {
        if (event.target.closest(".emoji-cell, .emoji-tab")) event.preventDefault();
      });
      panel.addEventListener("click", function (event) {
        var cell = event.target.closest(".emoji-cell");
        if (cell) {
          event.preventDefault();
          insert(cell.textContent);
          return;
        }
        var tab = event.target.closest("[data-tab]");
        if (!tab) return;
        event.preventDefault();
        var id = tab.getAttribute("data-tab");
        if (search.value) {
          search.value = "";
          renderBrowse();
        }
        if (!jump(id)) {
          // Its section is still on the way.
          pendingTab = id;
          setActive(id);
        }
      });

      search.addEventListener("input", runSearch);
      search.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          // Enter in a field submits the form around it - the whole draw.
          event.preventDefault();
          if (coarse) {
            search.blur();
            return;
          }
          var first = scroll.querySelector(".emoji-cell");
          if (mode === "search" && first) insert(first.textContent);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (search.value) {
            search.value = "";
            runSearch();
            return;
          }
          close();
          input.focus();
        }
      });
      search.addEventListener("focus", function () {
        // A phone's keyboard covers the lower half of the screen: keep the
        // search and the first rows of what it finds above it.
        if (!coarse) return;
        setTimeout(function () {
          var box = panel.querySelector(".emoji-box");
          if (box && box.scrollIntoView && isOpen()) box.scrollIntoView({ block: "start", behavior: "smooth" });
        }, 320);
      });

      scroll.addEventListener("scroll", function () {
        if (spyQueued) return;
        spyQueued = true;
        (window.requestAnimationFrame || setTimeout)(spy);
      }, { passive: true });

      // The set starts loading as soon as the title field is on screen, so
      // it is there by the time the picker opens.
      if (window.IntersectionObserver) {
        var watcher = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (!entries[i].isIntersecting) continue;
            watcher.disconnect();
            load().catch(function () { /* the opening retries */ });
            return;
          }
        });
        watcher.observe(field);
      }
    }

    document.addEventListener("click", function (event) {
      // A click on something the click itself removed is not a click outside.
      if (!document.documentElement.contains(event.target)) return;
      var open = document.querySelectorAll("[data-emoji-panel].is-open");
      for (var i = 0; i < open.length; i++) {
        var field = open[i].closest("[data-emoji-field]");
        if (field && !field.contains(event.target) && field.emojiClose) field.emojiClose();
      }
    });

    function init() {
      var fields = document.querySelectorAll("[data-emoji-field]");
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].getAttribute("data-emoji-ready") === "1") continue;
        fields[i].setAttribute("data-emoji-ready", "1");
        setup(fields[i]);
      }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  })();
  `;
}

module.exports = {
  EMOJI_DATA_PATH,
  getEmojiDataUrl,
  sendEmojiData,
  getEmojiOpenButtonMarkup,
  getEmojiPanelMarkup,
  getEmojiPickerStyles,
  getEmojiPickerScript,
};
