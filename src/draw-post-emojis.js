/**
 * Premium custom emoji для текста поста розыгрыша (Bot API: tg-emoji).
 * ID сняты с шаблона поста (пересыл в @RawDataBot / аналог).
 * В канале Telegram может показать fallback (🎁 и т.д.), если API не примет custom emoji.
 */

const DRAW_POST_EMOJI = {
  gift: { id: "5203996991054432397", alt: "🎁" },
  warn: { id: "5274099962655816924", alt: "‼️" },
  point: { id: "5465198403573012261", alt: "👉" },
  people: { id: "5372926953978341366", alt: "👥" },
  clock: { id: "5413704112220949842", alt: "⏰" },
};

function tgCustomEmojiHtml(emojiKey, usePremium) {
  const entry = DRAW_POST_EMOJI[emojiKey];
  if (!entry) {
    return "";
  }
  if (!usePremium) {
    return entry.alt;
  }
  return `<tg-emoji emoji-id="${entry.id}">${entry.alt}</tg-emoji>`;
}

function stylizeZeroAsCyrillicO(text) {
  return String(text).replace(/0/g, "О");
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

module.exports = {
  DRAW_POST_EMOJI,
  tgCustomEmojiHtml,
  formatRubPrizeForPost,
  formatUsdPrizeForPost,
  stylizeZeroAsCyrillicO,
};
