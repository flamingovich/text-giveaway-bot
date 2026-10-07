const test = require("node:test");
const assert = require("node:assert");
const { editEachReminder } = require("./reminder-edits");
const { isPermanentTelegramEditError } = require("./telegram-edit-errors");

const fail = (message) => {
  throw new Error(message);
};

// The prod incident: a reminder deleted in the channel was edited every tick.
test("a reminder deleted in the channel is dropped, the rest are edited", async () => {
  const edited = [];
  const result = await editEachReminder(
    [10, 11],
    async (id) => (id === 10 ? fail("400: Bad Request: message to edit not found") : edited.push(id)),
    isPermanentTelegramEditError,
  );
  assert.deepEqual(result.kept, [11]);
  assert.deepEqual(result.dropped, [10]);
  assert.equal(result.failure, null);
  assert.deepEqual(edited, [11]);
});

test("a network blink keeps the reminder and is reported for a retry", async () => {
  const result = await editEachReminder([10], async () => fail("ETIMEDOUT"), isPermanentTelegramEditError);
  assert.deepEqual(result.kept, [10]);
  assert.deepEqual(result.dropped, []);
  assert.match(result.failure.message, /ETIMEDOUT/);
});
