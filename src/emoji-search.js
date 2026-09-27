// Emoji search for the post-title picker.
//
// Russian first and English as well, and forgiving the way a person types:
//   - endings: "ракеты" finds "ракета", "подарки" finds "подарок";
//   - the wrong keyboard layout: "gjlfhjr" is "подарок" typed on the English
//     one, "ашку" is "fire" typed on the Russian one;
//   - one typo: "подорок", "сердцэ".
// Morphology beyond that is only covered by the words each emoji carries (see
// scripts/build-emoji-data.js and src/emoji-catalog.js).
//
// The forgiving kinds are fallbacks, tried in turn only while nothing has been
// found: a short root or a typo match on every query is noise ("огонь" would
// bring "огорчение", "бабки" the grandmother and the butterfly).
//
// Everything sits inside one function whose source goes to the browser as it
// is (emoji-picker.js), so the page and the tests run the same code. It must
// not reach for anything outside itself.

function createEmojiSearch() {
  var VARIATION_SELECTOR = String.fromCharCode(0xfe0f);
  // The same keys on the two layouts, in the same order.
  var LATIN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
  var CYRILLIC_KEYS = "ёйцукенгшщзхъфывапролджэячсмитьбю";

  function bare(emoji) {
    return String(emoji).split(VARIATION_SELECTOR).join("");
  }

  function normalize(text) {
    return String(text == null ? "" : text)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^0-9a-zа-я#*]+/g, " ")
      .trim();
  }

  function words(text) {
    return normalize(text).split(" ").filter(Boolean);
  }

  // What the same keys spell on the other layout.
  function swapLayout(text) {
    var out = "";
    var lower = String(text).toLowerCase();
    for (var i = 0; i < lower.length; i++) {
      var ch = lower.charAt(i);
      var latin = LATIN_KEYS.indexOf(ch);
      var cyrillic = CYRILLIC_KEYS.indexOf(ch);
      out += latin !== -1 ? CYRILLIC_KEYS.charAt(latin) : cyrillic !== -1 ? LATIN_KEYS.charAt(cyrillic) : ch;
    }
    return out;
  }

  // The part of a word its other forms share. Close: a longer word loses a
  // letter or three ("огонь" -> "огон", "деньгами" -> "деньг"), a short one
  // keeps all of them. Loose: down to three letters.
  function rootOf(term, loose) {
    var n = term.length;
    if (loose) return n >= 4 ? term.slice(0, Math.max(3, n - 2)) : "";
    if (n <= 4) return "";
    return term.slice(0, n - (n === 5 ? 1 : n <= 7 ? 2 : 3));
  }

  // One letter off: swapped, missing, extra or mistyped.
  function nearly(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0;
    var j = 0;
    var edits = 0;
    while (i < a.length && j < b.length) {
      if (a.charAt(i) === b.charAt(j)) {
        i++;
        j++;
        continue;
      }
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else if (a.charAt(i) === b.charAt(j + 1) && a.charAt(i + 1) === b.charAt(j)) {
        i += 2;
        j += 2;
      } else {
        i++;
        j++;
      }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  // How well one query word fits a list of words: 3 the same word, 2 the start
  // of one, 1 the same root with another ending (or, loose, a typo). 0 is no fit.
  function fit(term, list, loose) {
    var best = 0;
    var root = rootOf(term, loose);
    var typos = loose && term.length >= 4;
    for (var i = 0; i < list.length; i++) {
      var word = list[i];
      if (word === term) return 3;
      if (word.indexOf(term) === 0) best = 2;
      else if (best < 1 && root && word.indexOf(root) === 0) best = 1;
      else if (best < 1 && typos && (nearly(term, word) || (word.length > term.length && nearly(term, word.slice(0, term.length))))) best = 1;
    }
    return best;
  }

  // items: [emoji, group, label, other words] as emoji-data.json holds them.
  function prepare(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var label = words(items[i][2]);
      out.push({
        emoji: items[i][0],
        group: items[i][1],
        label: label,
        words: label.concat(words(items[i][3])),
        order: i,
      });
    }
    return out;
  }

  // Every word of the query has to fit somewhere; the name counts more than a
  // tag, and the giveaway set (favored) wins a tie.
  function rank(index, terms, favored, loose) {
    var found = [];
    for (var i = 0; i < index.length; i++) {
      var item = index[i];
      var score = 0;
      for (var t = 0; t < terms.length; t++) {
        var got = fit(terms[t], item.words, loose);
        if (!got) {
          score = 0;
          break;
        }
        score += got + (fit(terms[t], item.label, false) >= 2 ? 2 : 0);
      }
      if (!score) continue;
      if (favored[bare(item.emoji)]) score += 1;
      found.push({ emoji: item.emoji, score: score, order: item.order });
    }
    found.sort(function (a, b) {
      return b.score - a.score || a.order - b.order;
    });
    return found;
  }

  function search(index, query, options) {
    var limit = (options && options.limit) || 240;
    var favored = (options && options.favored) || {};
    var raw = String(query == null ? "" : query).trim();
    var terms = words(raw);
    var out = [];
    if (!terms.length) {
      // No letters: perhaps an emoji pasted in, which finds itself.
      for (var e = 0; raw && e < index.length; e++) {
        if (bare(index[e].emoji) === bare(raw)) out.push(index[e].emoji);
      }
      return out;
    }
    var swapped = words(swapLayout(raw));
    var tries = [[terms, false], [swapped, false], [terms, true], [swapped, true]];
    var found = [];
    for (var t = 0; t < tries.length && !found.length; t++) {
      if (t % 2 === 1 && tries[t][0].join(" ") === terms.join(" ")) continue;
      found = rank(index, tries[t][0], favored, tries[t][1]);
    }
    for (var f = 0; f < found.length && out.length < limit; f++) out.push(found[f].emoji);
    return out;
  }

  return { normalize: normalize, prepare: prepare, search: search, bare: bare, swapLayout: swapLayout };
}

const emojiSearch = createEmojiSearch();

module.exports = {
  createEmojiSearch,
  normalizeEmojiText: emojiSearch.normalize,
  prepareEmojiIndex: emojiSearch.prepare,
  searchEmoji: emojiSearch.search,
  bareEmoji: emojiSearch.bare,
  swapKeyboardLayout: emojiSearch.swapLayout,
};
