const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveProjectId,
  isLegacyProjectId,
  mergeProjectProfileEntries,
  resolveUserProjects,
} = require("./project-identity");

test("a legacy project resolves to the same organiser's Pokerdom", () => {
  assert.equal(resolveProjectId("project_1780118192579_6053"), "brand_pokerdom_7946967720");
  assert.equal(resolveProjectId("project_1780238688348_3660"), "brand_pokerdom_385791526");
  assert.equal(isLegacyProjectId("project_1780118192579_6053"), true);
});

test("a current project is left alone", () => {
  assert.equal(resolveProjectId("brand_beef_7946967720"), "brand_beef_7946967720");
  assert.equal(isLegacyProjectId("brand_beef_7946967720"), false);
  assert.equal(resolveProjectId(""), "");
});

test("an unknown project keeps its id rather than being guessed at", () => {
  assert.equal(resolveProjectId("project_1784960684304_7557"), "project_1784960684304_7557");
});

test("a confirmed referral survives a later, emptier entry", () => {
  const merged = mergeProjectProfileEntries([
    { referralVerified: true, referralNickname: "vasya", updatedAt: "2026-06-01" },
    { selfReportedNonReferral: true, updatedAt: "2026-08-01" },
  ]);

  assert.equal(merged.referralVerified, true);
  assert.equal(merged.selfReportedNonReferral, false, "cannot be a referral and not one at once");
  assert.equal(merged.referralNickname, "vasya");
});

test("a wallet recorded once is not lost to an entry without one", () => {
  const merged = mergeProjectProfileEntries([
    { trc20Address: "TWallet", updatedAt: "2026-06-01" },
    { referralVerified: true, updatedAt: "2026-08-01" },
  ]);

  assert.equal(merged.trc20Address, "TWallet");
  assert.equal(merged.updatedAt, "2026-08-01", "the later timestamp wins");
});

test("the two halves of one person's Pokerdom history become one", () => {
  const resolved = resolveUserProjects({
    project_1780118192579_6053: { trc20Address: "TOld", referralVerified: true, updatedAt: "2026-06-01" },
    brand_pokerdom_7946967720: { projectAccountId: "#42", updatedAt: "2026-08-01" },
    brand_beef_7946967720: { referralVerified: true, updatedAt: "2026-07-01" },
  });

  assert.deepEqual(
    Object.keys(resolved).sort(),
    ["brand_beef_7946967720", "brand_pokerdom_7946967720"],
  );
  assert.equal(resolved.brand_pokerdom_7946967720.trc20Address, "TOld");
  assert.equal(resolved.brand_pokerdom_7946967720.projectAccountId, "#42");
  assert.equal(resolved.brand_pokerdom_7946967720.referralVerified, true);
});

test("a single binding passes through untouched", () => {
  const resolved = resolveUserProjects({ brand_iris_385791526: { referralVerified: true } });
  assert.deepEqual(resolved, { brand_iris_385791526: { referralVerified: true } });
});

test("no bindings is not an error", () => {
  assert.deepEqual(resolveUserProjects({}), {});
  assert.deepEqual(resolveUserProjects(undefined), {});
  assert.deepEqual(mergeProjectProfileEntries([]), {});
});
