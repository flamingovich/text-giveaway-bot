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
//
// Auto-entry also skips the channel step, so a returning participant used to be
// added without being subscribed to this draw's channel at all - the owner only
// found out when they won and the payout check refused them. channelSubscribed
// is the answer for this draw's channel; someone not subscribed goes through
// the ordinary steps, which end at the channel step. It defaults to true for a
// draw with no channel to subscribe to.

function decideJoinEntry({ alreadyParticipant, canSkipRegistration, canReachUser = true, channelSubscribed = true }) {
  if (alreadyParticipant) {
    return "already_joined";
  }
  if (canSkipRegistration && canReachUser && channelSubscribed) {
    return "auto_join";
  }
  return "flow";
}

module.exports = { decideJoinEntry };
