const test = require("node:test");
const assert = require("node:assert");
const { findWinnerAccountId, describeWinnerAccountId, shortenAccountId } = require("./winner-account-id");

const FUGU = { id: "brand_fugu_100", templateSlug: "fugu", name: "FUGU" };
const POKERDOM = { id: "brand_pokerdom_100", templateSlug: "pokerdom", name: "Pokerdom" };

test("the ID given for the draw's own project comes first", () => {
  const node = {
    projects: {
      brand_fugu_100: { projectAccountId: " #FJ0UW " },
      brand_fugu_200: { projectAccountId: "#ZZ9QK" },
    },
  };
  assert.equal(findWinnerAccountId(node, FUGU), "#FJ0UW");
});

// A draw without a wallet step does not copy the ID over from the organiser
// the person first joined the brand with.
test("without one, the ID given to another organiser of the brand is shown", () => {
  const node = {
    projects: {
      brand_fugu_100: { crossOrganizerNonReferral: true },
      brand_pokerdom_200: { projectAccountId: "65f1a2b3c4d5e6f7a8b9c0d1" },
      brand_fugu_200: { projectAccountId: "#ZZ9QK" },
    },
  };
  assert.equal(findWinnerAccountId(node, FUGU), "#ZZ9QK");
});

test("another brand's ID is never taken for this one", () => {
  const node = { projects: { brand_pokerdom_200: { projectAccountId: "65f1a2b3c4d5e6f7a8b9c0d1" } } };
  assert.equal(findWinnerAccountId(node, FUGU), "");
  assert.equal(describeWinnerAccountId(node, FUGU), null);
  assert.equal(describeWinnerAccountId({}, null), null);
});

test("an ID that looks real carries no warning", () => {
  assert.deepEqual(describeWinnerAccountId({ projects: { brand_fugu_100: { projectAccountId: "#FJ0UW" } } }, FUGU), {
    id: "#FJ0UW",
    warning: "",
  });
  const pokerdom = { projects: { brand_pokerdom_100: { projectAccountId: "65f1a2b3c4d5e6f7a8b9c0d1" } } };
  assert.equal(describeWinnerAccountId(pokerdom, POKERDOM).warning, "");
});

test("an ID the brand could not have issued is marked", () => {
  const node = { projects: { brand_fugu_100: { projectAccountId: "65f1a2b3c4d5e6f7a8b9c0d1" } } };
  assert.equal(describeWinnerAccountId(node, FUGU).warning, "FUGU таких ID не выдаёт");
});

test("a made-up ID is marked", () => {
  const node = { projects: { brand_fugu_100: { projectAccountId: "#AAAAA" } } };
  assert.equal(describeWinnerAccountId(node, FUGU).warning, "ID не проходит проверку");
});

test("a long ID is cut to its ends, a short one is left whole", () => {
  assert.equal(shortenAccountId("6a2ec8b83f72281c3bb2443d"), "6a2e…443d");
  assert.equal(shortenAccountId("#FJ0UW"), "");
  assert.equal(shortenAccountId("1771050325"), "");
  assert.equal(shortenAccountId(""), "");
});
