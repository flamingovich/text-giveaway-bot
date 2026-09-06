const test = require("node:test");
const assert = require("node:assert");
const { BRAND_PROJECT_TEMPLATES, isPokerdomProject } = require("./deposit-guide");

test("every brand has a slug and a name", () => {
  for (const brand of BRAND_PROJECT_TEMPLATES) {
    assert.ok(brand.templateSlug, "нет слага");
    assert.ok(brand.name, `${brand.templateSlug} без названия`);
    assert.match(brand.templateSlug, /^[a-z0-9]+$/, `слаг «${brand.templateSlug}» попадёт в id проекта`);
  }
});

// The slug becomes part of brand_<slug>_<ownerId>, which is written into draws
// and profiles. Two brands sharing one would collide into a single project.
test("slugs and names are unique", () => {
  const slugs = BRAND_PROJECT_TEMPLATES.map((brand) => brand.templateSlug);
  const names = BRAND_PROJECT_TEMPLATES.map((brand) => brand.name.toLowerCase());
  assert.equal(new Set(slugs).size, slugs.length, "повторяющийся слаг");
  assert.equal(new Set(names).size, names.length, "повторяющееся название");
});

test("LuckyBear is on the list", () => {
  const brand = BRAND_PROJECT_TEMPLATES.find((item) => item.templateSlug === "luckybear");
  assert.ok(brand, "LuckyBear отсутствует");
  assert.equal(brand.name, "LuckyBear");
});

// Pokerdom is the one brand with special handling - TRC-20 only. A new brand
// must not accidentally inherit it.
test("only Pokerdom is treated as Pokerdom", () => {
  for (const brand of BRAND_PROJECT_TEMPLATES) {
    const isPokerdom = isPokerdomProject({ templateSlug: brand.templateSlug, name: brand.name });
    assert.equal(isPokerdom, brand.templateSlug === "pokerdom", `${brand.name} опознан неверно`);
  }
});

test("the earlier brands keep the slugs their existing ids were built from", () => {
  const slugs = BRAND_PROJECT_TEMPLATES.map((brand) => brand.templateSlug);
  for (const existing of ["pokerdom", "beef", "fugu", "iris"]) {
    assert.ok(slugs.includes(existing), `слаг ${existing} пропал — старые id перестанут находиться`);
  }
});
