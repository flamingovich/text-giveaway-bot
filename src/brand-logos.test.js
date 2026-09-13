const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const {
  BRAND_LOGO_SLUGS,
  resolveBrandSlug,
  getBrandLogoUrls,
  renderBrandLogoHtml,
} = require("./brand-logos");
const { BRAND_PROJECT_TEMPLATES } = require("./deposit-guide");

test("every brand the bot runs draws for has both logo files shipped", () => {
  // A missing file would not fail loudly anywhere else - the image would just
  // be broken on the registration step.
  for (const brand of BRAND_PROJECT_TEMPLATES) {
    const urls = getBrandLogoUrls(brand);
    assert.ok(urls, `нет логотипа для ${brand.name}`);
    for (const url of [urls.light, urls.dark]) {
      const file = path.join(__dirname, "..", url.replace(/^\//, ""));
      assert.ok(fs.existsSync(file), `нет файла ${url}`);
    }
  }
});

test("a brand project resolves by its template slug", () => {
  assert.deepStrictEqual(getBrandLogoUrls({ name: "Что угодно", templateSlug: "fugu" }), {
    slug: "fugu",
    light: "/assets/brand-logos/fugu_light.png",
    dark: "/assets/brand-logos/fugu_dark.png",
  });
});

test("an older project without a slug still resolves by name", () => {
  assert.strictEqual(resolveBrandSlug({ name: "LuckyBear" }), "luckybear");
  assert.strictEqual(resolveBrandSlug({ name: "Lucky Bear" }), "luckybear");
  assert.strictEqual(resolveBrandSlug({ name: "BEEF" }), "beef");
});

test("a casino we have art for but do not run draws for gets no logo", () => {
  assert.strictEqual(getBrandLogoUrls({ name: "Gizbo", templateSlug: "gizbo" }), null);
  assert.strictEqual(BRAND_LOGO_SLUGS.includes("gizbo"), false);
});

test("no project, no logo", () => {
  assert.strictEqual(getBrandLogoUrls(null), null);
  assert.strictEqual(getBrandLogoUrls({}), null);
});

test("the markup carries both theme variants", () => {
  const html = renderBrandLogoHtml(getBrandLogoUrls({ templateSlug: "iris" }), "join-brand-logo-img");
  assert.match(html, /class="join-brand-logo-img brand-logo-light" alt="" src="\/assets\/brand-logos\/iris_light\.png"/);
  assert.match(html, /class="join-brand-logo-img brand-logo-dark" alt="" src="\/assets\/brand-logos\/iris_dark\.png"/);
});

test("without urls the images are still there to be filled in, but request nothing", () => {
  const html = renderBrandLogoHtml(null);
  assert.strictEqual((html.match(/<img /g) || []).length, 2);
  assert.strictEqual(html.includes("src="), false);
});
