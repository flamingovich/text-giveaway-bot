// A draw on a brand sends every participant to the organiser's referral link:
// "Перейти на <бренд>" in the join app is that link, and the registration step
// waits for it to be opened. The brand projects reach each organiser empty, for
// them to fill in, so a draw could go out on one with no link at all - and then
// the button pointed at nothing, and Telegram offered to open the Mini App's own
// address instead. Such a draw is not created.

function describeMissingProjectLink(project) {
  if (!project) {
    // "Без проекта": there is nowhere to register, and nothing to link to.
    return null;
  }
  if (String(project.refLink || "").trim()) {
    return null;
  }
  const name = String(project.name || "").trim() || "проекта";
  return `Укажите реф-ссылку ${name} в Настройках → Заготовленные проекты. Без неё участникам некуда регистрироваться.`;
}

module.exports = { describeMissingProjectLink };
