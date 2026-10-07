// The reminder under a draw's post ("ИТОГИ ЧЕРЕЗ …") is edited by the
// countdown every tick. Once someone deletes it in the channel, Telegram
// answers "message to edit not found" for good - and with nothing to stop it
// the countdown asked again every 30 seconds: 122 times in an hour on prod.
// The draw's own post is marked uneditable for the same reason; a reminder is
// simply dropped from the list, which ends its countdown.

/**
 * Edits every reminder message; the ones that are gone for good are dropped.
 * → { kept, dropped, failure } - failure is the first error worth a retry.
 */
async function editEachReminder(messageIds, edit, isPermanent) {
  const kept = [];
  const dropped = [];
  let failure = null;
  for (const messageId of messageIds || []) {
    try {
      await edit(messageId);
      kept.push(messageId);
    } catch (error) {
      if (isPermanent(error)) {
        dropped.push(messageId);
      } else {
        kept.push(messageId);
        failure = failure || error;
      }
    }
  }
  return { kept, dropped, failure };
}

module.exports = { editEachReminder };
