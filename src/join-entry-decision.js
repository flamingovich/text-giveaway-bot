// What opening the join mini app does for someone before any step is shown.
//
// Someone who already took part in this project's draws is normally added to a
// new one straight away, with no steps. /session checks whether the bot can
// message them, but that answer used to only tag the response for the client:
// the person was already added. So a person who had blocked the bot or deleted
// the chat still took part, could win, and could never be told - the very case
// the "no joining without DM access" rule exists for.
//
// Now that person goes through the ordinary flow instead. The client holds the
// first step behind "откройте бота и нажмите Старт", and once the bot can reach
// them the next step (captcha) adds them the same way auto-entry would have.
// Someone already in the draw just sees "Вы уже участвуете" as before.
//
// canReachUser is true when the check is unavailable or fails: turning away a
// real person over a network blip is worse than letting one unreachable through.

function decideJoinEntry({ alreadyParticipant, canSkipRegistration, canReachUser = true }) {
  if (alreadyParticipant) {
    return "already_joined";
  }
  if (canSkipRegistration && canReachUser) {
    return "auto_join";
  }
  return "flow";
}

module.exports = { decideJoinEntry };
