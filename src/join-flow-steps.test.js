const test = require("node:test");
const assert = require("node:assert/strict");

const { JOIN_FLOW_STEPS, JOIN_FLOW_STEP_LABELS, getJoinFlowSteps } = require("./join-flow-steps");

test("a draw with a project asks for registration and a wallet", () => {
  assert.deepEqual(getJoinFlowSteps({ projectId: "brand_fugu_1" }), ["captcha", "registration", "trc20", "done"]);
});

test("a draw that does not collect wallets stops after registration", () => {
  assert.deepEqual(
    getJoinFlowSteps({ projectId: "brand_fugu_1", askWalletOnJoin: false }),
    ["captcha", "registration", "done"],
  );
});

test("a draw without a project goes from the check straight to done", () => {
  assert.deepEqual(getJoinFlowSteps({ projectId: null }), ["captcha", "done"]);
  assert.deepEqual(getJoinFlowSteps({ projectId: "", askWalletOnJoin: true }), ["captcha", "done"]);
});

test("a mega draw has neither registration nor a wallet, project or not", () => {
  assert.deepEqual(getJoinFlowSteps({ projectId: "brand_fugu_1" }, { isMega: true }), ["captcha", "done"]);
});

test("a missing draw still gets a stepper that starts and ends", () => {
  assert.deepEqual(getJoinFlowSteps(null), ["captcha", "done"]);
  assert.deepEqual(getJoinFlowSteps(undefined), ["captcha", "done"]);
});

test("every stage has a label, listed in stepper order", () => {
  assert.deepEqual(Object.keys(JOIN_FLOW_STEP_LABELS), JOIN_FLOW_STEPS);
  for (const steps of [
    getJoinFlowSteps({ projectId: "p" }),
    getJoinFlowSteps({ projectId: "p", askWalletOnJoin: false }),
    getJoinFlowSteps(null),
  ]) {
    const order = steps.map((step) => JOIN_FLOW_STEPS.indexOf(step));
    assert.ok(order.every((index) => index >= 0), `неизвестный этап в ${steps}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `этапы не по порядку: ${steps}`);
  }
});
