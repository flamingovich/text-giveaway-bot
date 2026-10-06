const test = require("node:test");
const assert = require("node:assert/strict");
const { createWinnerAntiFraud } = require("./winner-anti-fraud");
const { buildAccountIdIndex } = require("./draw-anti-fraud");

const DRAW = { id: "d", projectId: "brand_pokerdom_1", participantIds: [1, 2, 3], participantMeta: {} };
const profiles = {
  users: {
    1: { projects: { brand_pokerdom_1: { trc20Address: "TSHARED" } } },
    2: { projects: { brand_pokerdom_1: { trc20Address: "TSHARED" } } },
    3: { projects: { brand_pokerdom_1: { trc20Address: "TOWN", projectAccountId: "6a8b7ac1e81e6a8743d0d7e2" } } },
    4: { projects: { brand_iris_1: { projectAccountId: "6a8b7ac1e81e6a8743d0d7e2" } } },
  },
};

test("each label comes with the rule that set it", () => {
  const af = createWinnerAntiFraud({
    getAccountIdIndex: (p) =>
      buildAccountIdIndex(p, { normalize: (v) => String(v || "").toUpperCase(), brandOf: (id) => (/^brand_([a-z]+)_/.exec(id) || [])[1] }),
    getChainLinkedUsers: () => new Set(["9"]),
  });
  assert.deepEqual(af.explain(DRAW, 1, profiles).reasons, ["общий кошелёк"]);
  assert.ok(af.explain(DRAW, 3, profiles).reasons.includes("общий ID проекта"));
  assert.equal(af.evaluate(DRAW, 9, profiles).hasFraudFlag, true);
});

test("the owner's accounts are left alone", () => {
  const af = createWinnerAntiFraud({ exemptUserIds: new Set(["1"]) });
  assert.equal(af.evaluate(DRAW, 1, profiles).hasFraudFlag, false);
  assert.equal(af.evaluate(DRAW, 2, profiles).hasFraudFlag, true);
});
