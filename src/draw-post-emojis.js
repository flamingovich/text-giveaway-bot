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
    this._blockquoteStart = null;
  }

  append(raw) {
    const offset = this.text.length;
    this.text += raw;
    return { offset, length: raw.length };
  }

  pushEntity(entity) {
    this.entities.push(entity);
  }

  openBlockquote() {
    this._blockquoteStart = this.text.length;
  }

  closeBlockquote() {
    if (this._blockquoteStart == null) {
      return;
    }
    const length = this.text.length - this._blockquoteStart;
    if (length > 0) {
      this.pushEntity({
        type: "blockquote",
        offset: this._blockquoteStart,
        length,
      });
    }
    this._blockquoteStart = null;
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

  addBoldPrizeAmount(prizeLabel) {
    const { amount, currency } = splitPrizeLabel(prizeLabel);
    const dotIdx = amount.indexOf(".");
    const beforeDot = dotIdx >= 0 ? amount.slice(0, dotIdx) : amount;
    const afterDot = dotIdx >= 0 ? amount.slice(dotIdx + 1) : "";
    this.addBold(beforeDot);
    if (dotIdx >= 0) {
      this.append(".");
    }
    if (afterDot || currency) {
      this.addBold(`${afterDot}${currency}`);
    }
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

function appendOptionalPostTitle(builder, postTitle) {
  const title = String(postTitle || "").trim();
  if (!title) {
    return false;
  }
  builder.addBold(title);
  builder.append("\n\n");
  return true;
}

/**
 * @returns {{ mode: 'entities', caption: string, caption_entities: object[] } | { mode: 'html', caption: string }}
 */
function buildDrawPostCaptionPayload(data) {
  const {
    usePremiumEmoji = true,
    prizeLabel,
    winnersCount = 1,
    durationLabel = "",
    endManual = false,
    postTitle = "",
    includeWinners = false,
  } = data;

  if (includeWinners) {
    return { mode: "html", caption: null };
  }

  const b = new CaptionBuilder();
  const useCustom = Boolean(usePremiumEmoji);

  appendOptionalPostTitle(b, postTitle);

  // 🎁 РОЗЫГРЫШ НА 4О$
  b.addEmoji("gift", { custom: useCustom, bold: true });
  b.addBold(" РОЗЫГРЫШ НА ");
  b.addBoldPrizeAmount(prizeLabel);
  b.append("\n");

  b.openBlockquote();
  b.addEmoji("people", { custom: useCustom });
  b.append(" Призовых мест: ");
  b.addBold(String(winnersCount));
  b.append("\n");
  b.addEmoji("clock", { custom: useCustom });
  if (endManual) {
    b.append(" ");
    b.addBold("Итоги по команде создателя");
  } else {
    b.append(" Итоги через ");
    b.addBold(durationLabel || "—");
  }
  b.closeBlockquote();

  b.append("\n");
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
 * @param {{ prizeLabel: string, winners: { displayName: string, url: string }[], resultsUrl: string, postTitle?: string }} data
 */
function buildDrawPostFinishedPayload(data) {
  const {
    prizeLabel = "",
    winners = [],
    resultsUrl = "",
    postTitle = "",
  } = data;

  const b = new CaptionBuilder();

  appendOptionalPostTitle(b, postTitle);

  b.append("🎉");
  b.addBold(" ИТОГИ НА ");
  b.addBoldPrizeAmount(prizeLabel);
  b.append("\n");

  b.openBlockquote();
  b.append("🏆");
  b.addBold(" Победители:");
  if (winners.length > 0) {
    winners.forEach((winner) => {
      b.append("\n• ");
      if (winner.url) {
        b.addTextLink(winner.displayName, winner.url);
      } else {
        b.append(winner.displayName);
      }
    });
  } else {
    b.append("\nне определены");
  }
  b.closeBlockquote();

  if (resultsUrl) {
    b.append("\n🔎 ");
    b.addTextLink("Проверить Результаты", resultsUrl);
  }

  return {
    mode: "entities",
    caption: b.text,
    caption_entities: b.entities,
  };
}

/**
 * Дайджест активных розыгрышей для напоминания в канал.
 * @param {{
 *   headerPrizeLabel: string,
 *   usePremiumEmoji?: boolean,
 *   items: Array<{
 *     prizeLabel: string,
 *     winnersCount: number,
 *     timeLeftLabel: string,
 *     postUrl: string,
 *     endManual?: boolean,
 *   }>
 * }} data
 */
function buildActiveDrawsDigestPayload(data) {
  const {
    headerPrizeLabel = "0$",
    usePremiumEmoji = true,
    items = [],
  } = data;

  const b = new CaptionBuilder();
  const useCustom = Boolean(usePremiumEmoji);
  const headerNoun = items.length === 1 ? "АКТИВНЫЙ РОЗЫГРЫШ" : "АКТИВНЫЕ РОЗЫГРЫШИ";

  b.addBold(`🏆 ${headerNoun} НА ${headerPrizeLabel}`);
  b.append("\n\n");

  items.forEach((item, index) => {
    if (index > 0) {
      b.append("\n\n");
    }

    b.addEmoji("gift", { custom: useCustom });
    b.append(" РОЗЫГРЫШ НА ");
    b.addBoldPrizeAmount(item.prizeLabel);
    b.append(" ");
    b.addEmoji("point", { custom: useCustom });
    b.append(" ");
    if (item.postUrl) {
      b.addTextLink("КЛИК", item.postUrl, { bold: true });
    } else {
      b.addBold("КЛИК");
    }
    b.append("\n");

    b.openBlockquote();
    b.addEmoji("people", { custom: useCustom });
    b.append(" Призовых мест: ");
    b.addBold(String(item.winnersCount));
    b.append("\n");
    b.addEmoji("clock", { custom: useCustom });
    if (item.endManual || !item.timeLeftLabel) {
      b.append(" Итоги по команде создателя");
    } else {
      b.append(` Итоги через ${item.timeLeftLabel}`);
    }
    b.closeBlockquote();
  });

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
  buildActiveDrawsDigestPayload,
  formatRubPrizeForPost,
  formatUsdPrizeForPost,
  stylizeZeroAsCyrillicO,
  splitPrizeLabel,
};
