// Brand logos for the projects the bot actually runs draws for.
//
// The owner's logo folder holds every casino they have art for; only the brands
// in BRAND_PROJECT_TEMPLATES are shipped, so a project named after some other
// casino gets no logo rather than a guess. Each brand has a light and a dark
// variant - the dark one has white lettering that disappears on a light card -
// and the page shows whichever matches the theme.

const fs = require("fs");
const path = require("path");

const LOGO_DIR = path.join(__dirname, "..", "assets", "brand-logos");
const LOGO_URL_BASE = "/assets/brand-logos";
const BRAND_LOGO_SLUGS = ["pokerdom", "beef", "fugu", "iris", "luckybear"];

const filesPresent = new Map();

function hasLogoFiles(slug) {
  if (!filesPresent.has(slug)) {
    filesPresent.set(
      slug,
      fs.existsSync(path.join(LOGO_DIR, `${slug}_light.png`)) &&
        fs.existsSync(path.join(LOGO_DIR, `${slug}_dark.png`)),
    );
  }
  return filesPresent.get(slug);
}

// templateSlug is the reliable key for brand projects; the name is a fallback
// for older projects that were created by hand before brands were fixed.
function resolveBrandSlug(project) {
  const slug = String(project?.templateSlug || project?.brandSlug || "").trim().toLowerCase();
  if (BRAND_LOGO_SLUGS.includes(slug)) {
    return slug;
  }
  const name = String(project?.name || "").trim().toLowerCase().replace(/\s+/g, "");
  return BRAND_LOGO_SLUGS.includes(name) ? name : "";
}

function getBrandLogoUrls(project) {
  const slug = resolveBrandSlug(project);
  if (!slug || !hasLogoFiles(slug)) {
    return null;
  }
  return {
    slug,
    light: `${LOGO_URL_BASE}/${slug}_light.png`,
    dark: `${LOGO_URL_BASE}/${slug}_dark.png`,
  };
}

// Both images are always rendered, even without urls: the join mini app opened
// through /join/app learns its project only after the page loads, and fills
// these in rather than building markup of its own. The urls come from the slug
// whitelist above, so there is nothing user-supplied to escape.
function renderBrandLogoHtml(urls, className = "") {
  const cls = className ? `${className} ` : "";
  const src = (url) => (url ? ` src="${url}"` : "");
  return (
    `<img class="${cls}brand-logo-light" alt=""${src(urls?.light)} />` +
    `<img class="${cls}brand-logo-dark" alt=""${src(urls?.dark)} />`
  );
}

module.exports = {
  BRAND_LOGO_SLUGS,
  resolveBrandSlug,
  getBrandLogoUrls,
  renderBrandLogoHtml,
};
