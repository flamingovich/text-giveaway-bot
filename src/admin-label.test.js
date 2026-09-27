const test = require("node:test");
const assert = require("node:assert");
const { normalizeAdminLabel, formatReferralOwnerLabel, ADMIN_LABEL_MAX } = require("./admin-label");

test("a given name is tidied and kept short", () => {
  assert.equal(normalizeAdminLabel("  Депман   VIP "), "Депман VIP");
  assert.equal(normalizeAdminLabel(null), "");
  assert.equal(normalizeAdminLabel("я".repeat(100)).length, ADMIN_LABEL_MAX);
});

test("the badge names the admin as the owner calls them", () => {
  const meta = { first_name: "Dmitry", last_name: "P", username: "dpmn" };
  assert.equal(formatReferralOwnerLabel({ givenLabel: "Депман", meta }), "Реф Депман");
});

test("without a given name the badge falls back to Telegram's", () => {
  assert.equal(formatReferralOwnerLabel({ givenLabel: "  ", meta: { first_name: "Ника", last_name: "Орлова" } }), "Реф Ника Орлова");
  assert.equal(formatReferralOwnerLabel({ meta: { username: "@nika_draws" } }), "Реф @nika_draws");
  assert.equal(formatReferralOwnerLabel({}), "Реф другого организатора");
});
