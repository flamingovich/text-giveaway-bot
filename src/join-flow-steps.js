// The stages a draw's join flow actually goes through, for the stepper at the
// top of the mini app.
//
// Mirrors the branches in proceedAfterChannelVerified and
// finishRegistrationJoin (join-miniapp.js): a draw without a project, or a mega
// draw, goes from the check straight to done, and a draw that does not collect
// wallets stops after registration. The channel and the notify prompt are part
// of "Проверка" and never get a stage of their own.
//
// A person can still skip a stage the draw has - someone who already
// registered on the project goes past registration. That stage stays on the
// stepper and is simply ticked as passed, which is what it is.

const JOIN_FLOW_STEPS = ["captcha", "registration", "trc20", "done"];

const JOIN_FLOW_STEP_LABELS = {
  captcha: "Проверка",
  registration: "Регистрация",
  trc20: "Кошелёк",
  done: "Готово",
};

function getJoinFlowSteps(draw, { isMega = false } = {}) {
  const steps = ["captcha"];
  if (draw?.projectId && !isMega) {
    steps.push("registration");
    if (draw.askWalletOnJoin !== false) {
      steps.push("trc20");
    }
  }
  steps.push("done");
  return steps;
}

module.exports = {
  JOIN_FLOW_STEPS,
  JOIN_FLOW_STEP_LABELS,
  getJoinFlowSteps,
};
