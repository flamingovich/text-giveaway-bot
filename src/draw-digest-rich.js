// The reminder post lists every live draw of a channel. Each draw used to be a
// line ending in the word "КЛИК"; now each is a button of its own, which is what
// the rich message format is for (see rich-post.js). The projects block under
// them keeps the shape it has always had.

const { escapeHtml, buttonRowHtml, padButtonLabel } = require("./rich-post");
const { formatRefLinkDisplay } = require("./draw-post-emojis");

function buildProjectsBlock(projects) {
  const rows = (projects || [])
    .map((project) => {
      const name = String(project?.name || "Проект");
      const emoji = String(project?.emoji || "•").trim() || "•";
      const refLink = String(project?.refLink || "").trim();
      if (!refLink) {
        return `${escapeHtml(emoji)} <b>${escapeHtml(name)}</b>`;
      }
      const link = escapeHtml(refLink);
      return `${escapeHtml(emoji)} <a href="${link}"><b>${escapeHtml(name)}</b></a> » <a href="${link}"><b>${escapeHtml(
        formatRefLinkDisplay(refLink),
      )}</b></a>`;
    })
    .filter(Boolean);
  if (!rows.length) {
    return "";
  }
  return `<p><b>🎰 ТОП ПРОЕКТЫ 👇</b></p>\n<blockquote>${rows.join("<br>")}</blockquote>`;
}

function buildActiveDrawsDigestRichHtml({ headerPrizeLabel = "0$", items = [], projects = [] } = {}) {
  const noun = items.length === 1 ? "РОЗЫГРЫШ" : "РОЗЫГРЫШИ";
  const parts = [`<p><b>🎁 ${noun} НА ${escapeHtml(headerPrizeLabel)} 🎁</b></p>`];
  for (const item of items) {
    const label = `РОЗЫГРЫШ НА ${String(item?.prizeLabel || "")}`.trim();
    // A draw whose post cannot be linked to still belongs in the list; without
    // a link there is nothing for a button to do, so it stays a line of text.
    parts.push(
      item?.url
        ? buttonRowHtml([{ text: padButtonLabel(label), url: item.url, style: "success" }])
        : `<p><b>${escapeHtml(label)}</b></p>`,
    );
  }
  const projectsBlock = buildProjectsBlock(projects);
  if (projectsBlock) {
    parts.push(projectsBlock);
  }
  return parts.join("\n");
}

module.exports = { buildActiveDrawsDigestRichHtml, buildProjectsBlock };
