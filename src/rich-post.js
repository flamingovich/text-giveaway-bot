// Draw posts move into Telegram's rich message format so the "Участвую" button
// sits inside the post instead of under it (Bot API 10.3). The words of the post
// must not change, so nothing here writes a second version of them: the caption
// builders stay the only source of the text, and this turns their text and
// entities into the rich HTML the new format wants.
//
// Entity offsets are UTF-16 code units, which is what JavaScript strings are
// indexed by, so the text is sliced by them directly.

const PAD_SPACE = "　";

const INLINE_TAGS = {
  bold: ["<b>", "</b>"],
  italic: ["<i>", "</i>"],
  underline: ["<u>", "</u>"],
  strikethrough: ["<s>", "</s>"],
  code: ["<code>", "</code>"],
  spoiler: ["<tg-spoiler>", "</tg-spoiler>"],
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// An entity that only partly covers the piece being rendered is cut to it: a
// line of a paragraph is rendered on its own, and a style may span several.
function clipEntities(entities, start, end) {
  const clipped = [];
  for (const entity of entities || []) {
    const from = Math.max(Number(entity.offset) || 0, start);
    const to = Math.min((Number(entity.offset) || 0) + (Number(entity.length) || 0), end);
    if (to > from) {
      clipped.push({ ...entity, offset: from, length: to - from });
    }
  }
  // Longer first at the same start, so the wider style becomes the parent.
  clipped.sort((a, b) => a.offset - b.offset || b.length - a.length);
  return mergeTouching(clipped);
}

// The caption builders add a style per piece they write, so one bold line
// arrives as four bold entities in a row. Joined here, they become one tag.
function canMerge(left, right) {
  if (left.type !== right.type || left.type === "custom_emoji") {
    return false;
  }
  return left.url === right.url;
}

function mergeTouching(entities) {
  const merged = [];
  for (const entity of entities) {
    const last = merged[merged.length - 1];
    if (last && canMerge(last, entity) && entity.offset <= last.offset + last.length) {
      const end = Math.max(last.offset + last.length, entity.offset + entity.length);
      last.length = end - last.offset;
      continue;
    }
    merged.push({ ...entity });
  }
  return merged;
}

function buildEntityTree(entities) {
  const roots = [];
  const stack = [];
  for (const entity of entities) {
    const node = { entity, start: entity.offset, end: entity.offset + entity.length, children: [] };
    while (stack.length && node.start >= stack[stack.length - 1].end) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (!parent) {
      roots.push(node);
    } else if (node.end <= parent.end) {
      parent.children.push(node);
    } else {
      // Crosses out of its parent: Telegram never sends this, and guessing what
      // it should look like is worse than dropping the style.
      continue;
    }
    stack.push(node);
  }
  return roots;
}

function wrapEntity(entity, inner, options) {
  const tags = INLINE_TAGS[entity.type];
  if (tags) {
    return `${tags[0]}${inner}${tags[1]}`;
  }
  if (entity.type === "text_link" && entity.url) {
    return `<a href="${escapeHtml(entity.url)}">${inner}</a>`;
  }
  if (entity.type === "custom_emoji") {
    // Channel posts carry no premium emoji, so only the plain one is left.
    return options.keepCustomEmoji && entity.custom_emoji_id
      ? `<tg-emoji emoji-id="${escapeHtml(entity.custom_emoji_id)}">${inner}</tg-emoji>`
      : inner;
  }
  return inner;
}

function renderRange(text, entities, start, end, options) {
  const nodes = buildEntityTree(clipEntities(entities, start, end));
  let out = "";
  let pos = start;
  for (const node of nodes) {
    out += escapeHtml(text.slice(pos, node.start));
    const inner = renderRange(text, node.children.map((child) => child.entity), node.start, node.end, options);
    out += wrapEntity(node.entity, inner, options);
    pos = node.end;
  }
  return out + escapeHtml(text.slice(pos, end));
}

function findBlockquotes(entities) {
  return (entities || [])
    .filter((entity) => entity.type === "blockquote" || entity.type === "expandable_blockquote")
    .map((entity) => ({
      start: Number(entity.offset) || 0,
      end: (Number(entity.offset) || 0) + (Number(entity.length) || 0),
      expandable: entity.type === "expandable_blockquote",
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
}

// A run of plain text becomes one paragraph whose lines are separated by <br>.
// Line by line paragraphs looked wrong: Telegram draws them tight against each
// other, so the empty line the post has between the project and the prize was
// lost and the post read as one lump. Newlines that only stand between this run
// and a quotation block are dropped - the block is a break of its own.
function renderParagraph(text, entities, start, end, options) {
  let from = start;
  let to = end;
  while (from < to && text[from] === "\n") {
    from += 1;
  }
  while (to > from && text[to - 1] === "\n") {
    to -= 1;
  }
  if (to <= from) {
    return "";
  }
  const lines = [];
  let lineStart = from;
  for (let i = from; i <= to; i += 1) {
    if (i === to || text[i] === "\n") {
      lines.push(i > lineStart ? renderRange(text, entities, lineStart, i, options) : "");
      lineStart = i + 1;
    }
  }
  return `<p>${lines.join("<br>")}</p>\n`;
}

function renderBlockquote(text, entities, range, options) {
  const inner = renderRange(text, entities, range.start, range.end, options)
    .split("\n")
    .join("<br>");
  return `<blockquote${range.expandable ? " expandable" : ""}>${inner}</blockquote>\n`;
}

// The post as rich HTML: the same words, the same styling, laid out as blocks.
function richHtmlFromEntities(text, entities, options = {}) {
  const source = String(text ?? "");
  const inline = (entities || []).filter(
    (entity) => entity.type !== "blockquote" && entity.type !== "expandable_blockquote",
  );
  let out = "";
  let pos = 0;
  for (const range of findBlockquotes(entities)) {
    if (range.start > pos) {
      out += renderParagraph(source, inline, pos, range.start, options);
    }
    out += renderBlockquote(source, inline, range, options);
    pos = Math.max(pos, range.end);
  }
  out += renderParagraph(source, inline, pos, source.length, options);
  return out.trimEnd();
}

// Buttons inside a post are as wide as their label - the API has no width of its
// own - so the label is padded to fill the post. Measured on a phone, which is
// where nearly everyone reads: wider padding than this gets cut off with "…".
function padButtonLabel(label, pad = 2) {
  return `${PAD_SPACE.repeat(pad)}${String(label ?? "")}${PAD_SPACE.repeat(pad)}`;
}

function buttonRowHtml(buttons, options = {}) {
  const cells = (buttons || [])
    .filter((button) => button && button.url && button.text)
    .map(
      (button) =>
        `<tg-button type="url"${button.style ? ` style="${escapeHtml(button.style)}"` : ""} url="${escapeHtml(
          button.url,
        )}">${escapeHtml(button.text)}</tg-button>`,
    )
    .join("");
  if (!cells) {
    return "";
  }
  return `<tg-button-row${options.align ? ` align="${escapeHtml(options.align)}"` : ""}>${cells}</tg-button-row>`;
}

// The whole post: the cover, the text as it is written today, then the button.
function buildRichPostHtml({ text, entities, coverMediaId = "", buttons = [], keepCustomEmoji = false }) {
  const parts = [];
  if (coverMediaId) {
    parts.push(`<img src="tg://photo?id=${escapeHtml(coverMediaId)}"/>`);
  }
  const body = richHtmlFromEntities(text, entities, { keepCustomEmoji });
  if (body) {
    parts.push(body);
  }
  const row = buttonRowHtml(buttons);
  if (row) {
    parts.push(row);
  }
  return parts.join("\n");
}

// Reading a post back. A rich text is a string, a list of them, or a styled
// piece holding more of the same (RichText in the API), so it is flattened.
function richTextToPlain(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(richTextToPlain).join("");
  }
  return richTextToPlain(value.text);
}

// Every button of a post, whether it sits under it (the old posts, still live
// in channels) or inside it. The startup sync and the post-to-draw matching
// read both kinds the same way.
function readMessageButtons(message) {
  const buttons = [];
  for (const row of message?.reply_markup?.inline_keyboard || []) {
    for (const button of row || []) {
      buttons.push({ text: String(button?.text ?? ""), url: String(button?.url ?? "") });
    }
  }
  for (const block of message?.rich_message?.blocks || []) {
    if (block?.type !== "buttons") {
      continue;
    }
    for (const button of block.buttons || []) {
      buttons.push({ text: richTextToPlain(button?.text), url: String(button?.url ?? "") });
    }
  }
  return buttons;
}

module.exports = {
  PAD_SPACE,
  escapeHtml,
  richTextToPlain,
  readMessageButtons,
  richHtmlFromEntities,
  padButtonLabel,
  buttonRowHtml,
  buildRichPostHtml,
};
