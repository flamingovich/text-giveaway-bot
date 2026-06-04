/**
 * Premium custom emoji и разметка поста розыгрыша (caption + caption_entities).
 */

const DRAW_POST_EMOJI = {
  gift: { id: "5203996991054432397", alt: "🎁" },
  diamond: { id: "5471952986970267163", alt: "💎" },
  point: { id: "5465198403573012261", alt: "👉" },
  people: { id: "5372926953978341366", alt: "👥" },
  clock: { id: "5413704112220949842", alt: "⏰" },
  down: { id: "", alt: "👇" },
};

class CaptionBuilder {
  constructor() {
    this.text = "";
    this.entities = [];
  }

  append(raw) {
    const offset = this.text.length;
    this.text += raw;
    return { offset, length: raw.length };
  }

  pushEntity(entity) {
    this.entities.push(entity);
  }

  addEmoji(key, options = {}) {
    const entry = DRAW_POST_EMOJI[key];
    if (!entry) {
      return { offset: this.text.length, length: 0 };
    }
    const span = this.append(entry.alt);
    if (options.custom && entry.id) {
      this.pushEntity({
        type: "custom_emoji",
        offset: span.offset,
        length: span.length,
        custom_emoji_id: entry.id,
      });
    }
    if (options.bold) {
      this.pushEntity({ type: "bold", offset: span.offset, length: span.length });
    }
    return span;
  }

  addBold(raw) {
    const span = this.append(raw);
    this.pushEntity({ type: "bold", offset: span.offset, length: span.length });
    return span;
  }

  addTextLink(label, url, options = {}) {
    const span = this.append(label);
    this.pushEntity({ type: "text_link", offset: span.offset, length: span.length, url });
    if (options.bold) {
      this.pushEntity({ type: "bold", offset: span.offset, length: span.length });
    }
    return span;
  }
}

function tgCustomEmojiHtml(emojiKey, usePremium) {
  const entry = DRAW_POST_EMOJI[emojiKey];
  if (!entry) {
    return "";
  }
  if (!usePremium || !entry.id) {
    return entry.alt;
  }
  return `<tg-emoji emoji-id="${entry.id}">${entry.alt}</tg-emoji>`;
}

function stylizeZeroAsCyrillicO(text) {
  return String(text).replace(/0/g, "О");
}

function splitPrizeLabel(prizeLabel) {
  const label = String(prizeLabel || "");
  if (label.endsWith("₽")) {
    return { amount: label.slice(0, -1), currency: "₽" };
  }
  if (label.endsWith("$")) {
    return { amount: label.slice(0, -1), currency: "$" };
  }
  return { amount: label, currency: "" };
}

/** Сумма для заголовка поста: 1000 → 1.ООО₽ */
function formatRubPrizeForPost(amount) {
  const value = Math.floor(Number(amount) || 0);
  const withDots = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${stylizeZeroAsCyrillicO(withDots)}₽`;
}

function formatUsdPrizeForPost(amount) {
  const value = Math.floor(Number(amount) || 0);
  const withDots = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${stylizeZeroAsCyrillicO(withDots)}$`;
}

/**
 * @returns {{ mode: 'entities', caption: string, caption_entities: object[] } | { mode: 'html', caption: string }}
 */
function buildDrawPostCaptionPayload(data) {
  const {
    usePremiumEmoji = true,
    prizeLabel,
    projectName = "",
    projectRefLink = "",
    winnersCount = 1,
    durationLabel = "",
    includeWinners = false,
  } = data;

  if (includeWinners) {
    return { mode: "html", caption: null };
  }

  const b = new CaptionBuilder();
  const { amount, currency } = splitPrizeLabel(prizeLabel);
  const useCustom = Boolean(usePremiumEmoji);

  // 🎁 РОЗЫГРЫШ НА 1.ООО₽ 🎁
  b.addEmoji("gift", { custom: useCustom, bold: true });
  const dotIdx = amount.indexOf(".");
  const beforeDot = dotIdx >= 0 ? amount.slice(0, dotIdx) : amount;
  const afterDot = dotIdx >= 0 ? amount.slice(dotIdx + 1) : "";
  b.addBold(` РОЗЫГРЫШ НА ${beforeDot}`);
  if (dotIdx >= 0) {
    b.append(".");
  }
  if (afterDot || currency) {
    b.addBold(`${afterDot}${currency}`);
  }
  b.append(" ");
  b.addEmoji("gift", { custom: useCustom, bold: true });

  // 💎 НУЖНО 👉 Быть рефом на Покердом
  b.append("\n\n");
  b.addEmoji("diamond", { custom: useCustom });
  b.append(" ");
  b.addBold("НУЖНО");
  b.append(" ");
  b.addEmoji("point", { custom: useCustom });
  b.append(" Быть рефом на ");
  if (projectName) {
    if (projectRefLink) {
      b.addTextLink(projectName, projectRefLink, { bold: true });
    } else {
      b.addBold(projectName);
    }
  }

  b.append("\n\n");
  b.addEmoji("people", { custom: useCustom });
  b.append(` Призовых мест: ${winnersCount}\n`);
  b.addEmoji("clock", { custom: useCustom });
  b.append(" Итоги через ");
  b.addBold(durationLabel);

  b.append("\n\n");
  const downAlt = DRAW_POST_EMOJI.down.alt;
  b.addBold(`${downAlt} Жми кнопку, для участия ${downAlt}`);

  return {
    mode: "entities",
    caption: b.text,
    caption_entities: b.entities,
  };
}

/**
 * Пост с итогами розыгрыша (caption + caption_entities).
 * @param {{ prizeLabel: string, winners: { displayName: string, url: string }[], botUrl: string, resultsUrl: string }} data
 */
function buildDrawPostFinishedPayload(data) {
  const {
    prizeLabel = "",
    winners = [],
    botUrl = "https://t.me/roller_official_bot",
    resultsUrl = "",
  } = data;

  const b = new CaptionBuilder();

  b.append("🎊 ");
  b.addBold(`ИТОГИ КОНКУРСА НА ${prizeLabel}`);

  b.append("\n\n🏆");
  b.addBold(" Победители: ");
  if (winners.length > 0) {
    winners.forEach((winner, index) => {
      if (index > 0) {
        b.append(", ");
      }
      if (winner.url) {
        b.addTextLink(winner.displayName, winner.url);
      } else {
        b.append(winner.displayName);
      }
    });
  } else {
    b.append("не определены");
  }

  b.append("\n❗️ Отметьтесь ");
  b.addTextLink("в боте", botUrl, { bold: true });
  b.append("!");

  if (resultsUrl) {
    b.append("\n\n🔎 ");
    b.addTextLink("Проверить Результаты", resultsUrl, { bold: true });
  }

  return {
    mode: "entities",
    caption: b.text,
    caption_entities: b.entities,
  };
}

module.exports = {
  DRAW_POST_EMOJI,
  CaptionBuilder,
  tgCustomEmojiHtml,
  buildDrawPostCaptionPayload,
  buildDrawPostFinishedPayload,
  formatRubPrizeForPost,
  formatUsdPrizeForPost,
  stylizeZeroAsCyrillicO,
  splitPrizeLabel,
};
