// The emoji picker for the post title.
//
// Typing emoji from a desktop keyboard is painful, and the title is the first
// line people read in the channel, so it is the one field where they earn their
// keep. Shaped after Telegram's own picker: recently used along the top,
// categories below, and a search that speaks Russian.

const { CATEGORIES } = require("./emoji-catalog");

// Only the emoji and the keywords travel to the browser; the labels ride along
// for the tab strip.
function pickerData() {
  return CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
    items: category.emojis.map(([emoji, keywords]) => [emoji, keywords]),
  }));
}

function getEmojiPickerStyles() {
  return `
    .emoji-field { position: relative; }
    .emoji-field .draw-input { padding-right: 40px; }
    .emoji-open {
      position: absolute; right: 6px; bottom: 5px;
      width: 30px; height: 30px; padding: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; line-height: 1; cursor: pointer;
      border: 0; border-radius: 8px; background: transparent;
      opacity: .65; transition: opacity .12s, background .12s;
    }
    .emoji-open:hover, .emoji-open.is-open { opacity: 1; background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 16%, transparent); }
    .emoji-pop {
      position: absolute; z-index: 60; left: 0; right: 0; top: calc(100% + 6px);
      display: none; flex-direction: column;
      max-height: 330px; overflow: hidden;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      background: var(--tg-theme-bg-color, #fff);
      box-shadow: 0 14px 40px rgba(0,0,0,.28);
    }
    .emoji-pop.is-open { display: flex; }
    .emoji-search-wrap { padding: 8px 8px 6px; }
    .emoji-search {
      width: 100%; box-sizing: border-box;
      font: inherit; font-size: 14px;
      padding: 7px 10px; border-radius: 9px;
      border: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 22%, transparent);
      background: var(--tg-theme-secondary-bg-color, #f4f4f5);
      color: var(--tg-theme-text-color, #111);
    }
    .emoji-search:focus { outline: none; border-color: var(--tg-theme-link-color, #3390ec); }
    .emoji-recent { padding: 0 8px 6px; }
    .emoji-recent[hidden] { display: none; }
    .emoji-recent-title, .emoji-group-title {
      font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
      color: var(--tg-theme-hint-color, #7a8296);
      padding: 4px 2px 5px;
    }
    .emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 1px; }
    .emoji-cell {
      border: 0; background: transparent; cursor: pointer;
      font-size: 21px; line-height: 1; padding: 5px 0; border-radius: 8px;
      font-family: "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
    }
    .emoji-cell:hover { background: color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 18%, transparent); }
    .emoji-scroll { overflow-y: auto; padding: 0 8px 8px; flex: 1; overscroll-behavior: contain; }
    .emoji-tabs {
      display: flex; gap: 2px; padding: 5px 6px;
      border-top: 1px solid color-mix(in srgb, var(--tg-theme-hint-color, #65708a) 16%, transparent);
      background: var(--tg-theme-secondary-bg-color, #f7f7f8);
      overflow-x: auto; scrollbar-width: none;
    }
    .emoji-tabs::-webkit-scrollbar { display: none; }
    .emoji-tab {
      flex: 0 0 auto; border: 0; background: transparent; cursor: pointer;
      font-size: 17px; line-height: 1; padding: 6px 8px; border-radius: 8px; opacity: .55;
    }
    .emoji-tab.is-active { opacity: 1; background: color-mix(in srgb, var(--tg-theme-link-color, #3390ec) 16%, transparent); }
    .emoji-empty { padding: 18px 6px; text-align: center; font-size: 13px; color: var(--tg-theme-hint-color, #7a8296); }
    @media (max-width: 480px) { .emoji-grid { grid-template-columns: repeat(7, 1fr); } }
  `;
}

function getEmojiPickerMarkup() {
  return `
    <button type="button" class="emoji-open" data-emoji-open aria-label="Выбрать эмодзи">😊</button>
    <div class="emoji-pop" data-emoji-pop>
      <div class="emoji-search-wrap">
        <input type="text" class="emoji-search" data-emoji-search placeholder="Поиск: подарок, огонь, деньги…" autocomplete="off" />
      </div>
      <div class="emoji-recent" data-emoji-recent hidden>
        <div class="emoji-recent-title">Недавние</div>
        <div class="emoji-grid" data-emoji-recent-grid></div>
      </div>
      <div class="emoji-scroll" data-emoji-scroll></div>
      <div class="emoji-tabs" data-emoji-tabs></div>
    </div>
  `;
}

function getEmojiPickerScript() {
  return `
  (function () {
    var GROUPS = ${JSON.stringify(pickerData())};
    var RECENT_KEY = "draw:emoji:recent";
    var RECENT_MAX = 10;

    function readRecent() {
      try {
        var raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        return Array.isArray(raw) ? raw.filter(function (x) { return typeof x === "string"; }).slice(0, RECENT_MAX) : [];
      } catch (_e) { return []; }
    }
    function pushRecent(emoji) {
      try {
        var list = readRecent().filter(function (x) { return x !== emoji; });
        list.unshift(emoji);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
      } catch (_e) { /* приватный режим — просто без истории */ }
    }

    function search(query) {
      var needle = String(query || "").trim().toLowerCase();
      if (!needle) return null;
      var out = [], seen = {};
      for (var g = 0; g < GROUPS.length; g++) {
        for (var i = 0; i < GROUPS[g].items.length; i++) {
          var emoji = GROUPS[g].items[i][0];
          var words = (GROUPS[g].items[i][1] + " " + GROUPS[g].label).toLowerCase();
          if (seen[emoji]) continue;
          var parts = words.split(/\\s+/);
          var hit = emoji === needle || words.indexOf(needle) !== -1;
          if (!hit) {
            for (var p = 0; p < parts.length; p++) {
              if (parts[p].indexOf(needle) === 0) { hit = true; break; }
            }
          }
          if (hit) { seen[emoji] = 1; out.push(emoji); }
        }
      }
      return out;
    }

    function cells(list) {
      var html = "";
      for (var i = 0; i < list.length; i++) {
        html += '<button type="button" class="emoji-cell" data-emoji="' + list[i] + '">' + list[i] + "</button>";
      }
      return html;
    }

    function setup(field) {
      var input = field.querySelector("input.draw-input");
      var openBtn = field.querySelector("[data-emoji-open]");
      var pop = field.querySelector("[data-emoji-pop]");
      if (!input || !openBtn || !pop) return;

      var searchInput = pop.querySelector("[data-emoji-search]");
      var scroll = pop.querySelector("[data-emoji-scroll]");
      var tabs = pop.querySelector("[data-emoji-tabs]");
      var recentBox = pop.querySelector("[data-emoji-recent]");
      var recentGrid = pop.querySelector("[data-emoji-recent-grid]");
      var activeGroup = 0;

      function renderTabs() {
        var html = "";
        for (var i = 0; i < GROUPS.length; i++) {
          html += '<button type="button" class="emoji-tab' + (i === activeGroup ? " is-active" : "") +
            '" data-tab="' + i + '" title="' + GROUPS[i].label + '">' + GROUPS[i].icon + "</button>";
        }
        tabs.innerHTML = html;
      }

      function renderRecent() {
        var list = readRecent();
        if (!list.length) { recentBox.hidden = true; return; }
        recentBox.hidden = false;
        recentGrid.innerHTML = cells(list);
      }

      function renderGroups() {
        var html = "";
        for (var i = 0; i < GROUPS.length; i++) {
          var items = [];
          for (var j = 0; j < GROUPS[i].items.length; j++) items.push(GROUPS[i].items[j][0]);
          html += '<div class="emoji-group" data-group="' + i + '"><div class="emoji-group-title">' +
            GROUPS[i].label + '</div><div class="emoji-grid">' + cells(items) + "</div></div>";
        }
        scroll.innerHTML = html;
      }

      function renderSearch(list) {
        scroll.innerHTML = list.length
          ? '<div class="emoji-grid">' + cells(list) + "</div>"
          : '<div class="emoji-empty">Ничего не нашлось</div>';
      }

      // Inserting at the caret rather than appending: the emoji usually belongs
      // in front of the words already typed, not after them.
      function insert(emoji) {
        var start = input.selectionStart;
        var end = input.selectionEnd;
        if (typeof start !== "number" || typeof end !== "number") {
          start = input.value.length;
          end = start;
        }
        var next = input.value.slice(0, start) + emoji + input.value.slice(end);
        if (next.length > (Number(input.getAttribute("maxlength")) || 120)) return;
        input.value = next;
        var caret = start + emoji.length;
        input.focus();
        try { input.setSelectionRange(caret, caret); } catch (_e) { /* ignore */ }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        pushRecent(emoji);
        renderRecent();
      }

      function open() {
        pop.classList.add("is-open");
        openBtn.classList.add("is-open");
        renderRecent();
        searchInput.value = "";
        renderGroups();
        // A picker that steals focus on a phone opens the keyboard over itself.
        if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) searchInput.focus();
      }
      function close() {
        pop.classList.remove("is-open");
        openBtn.classList.remove("is-open");
      }

      openBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (pop.classList.contains("is-open")) close(); else open();
      });

      searchInput.addEventListener("input", function () {
        var found = search(searchInput.value);
        if (found === null) {
          renderRecent();
          renderGroups();
          return;
        }
        // While searching, the recent row would sit between the query and its
        // results and read as part of them.
        recentBox.hidden = true;
        renderSearch(found);
      });

      searchInput.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { close(); input.focus(); }
      });

      tabs.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-tab]");
        if (!btn) return;
        activeGroup = Number(btn.getAttribute("data-tab")) || 0;
        renderTabs();
        if (searchInput.value) { searchInput.value = ""; renderGroups(); }
        var target = scroll.querySelector('[data-group="' + activeGroup + '"]');
        // offsetTop is measured from the nearest positioned ancestor, which is
        // not this container, so it lands on zero. Measuring both boxes and
        // moving by the difference works wherever the popover sits.
        if (target) {
          scroll.scrollTop += target.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
        }
      });

      pop.addEventListener("click", function (event) {
        var cell = event.target.closest("[data-emoji]");
        if (!cell) return;
        event.preventDefault();
        insert(cell.getAttribute("data-emoji"));
      });

      document.addEventListener("click", function (event) {
        if (!pop.classList.contains("is-open")) return;
        if (field.contains(event.target)) return;
        close();
      });

      renderTabs();
      renderGroups();
    }

    function init() {
      var fields = document.querySelectorAll("[data-emoji-field]");
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].dataset.emojiReady === "1") continue;
        fields[i].dataset.emojiReady = "1";
        setup(fields[i]);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    // The draw form is re-rendered as the panel navigates, so pick up new fields.
    document.addEventListener("panel:rendered", init);
    window.initEmojiPicker = init;
  })();
  `;
}

module.exports = { getEmojiPickerStyles, getEmojiPickerMarkup, getEmojiPickerScript };
