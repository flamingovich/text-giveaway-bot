const test = require("node:test");
const assert = require("node:assert");
const { assertSafeTestBot, isLiveBotUsername } = require("./test-bot-guard");

const getTestMe = async () => ({ username: "roller_test_bot" });
const getLiveMe = async () => ({ username: "roller_official_bot" });

test("the live bot's token stops a test run before it polls", async () => {
  await assert.rejects(assertSafeTestBot({ getMe: getLiveMe, dataDir: "data-test" }), /боевого бота/);
});

test("a test run naming the live bot is stopped without asking Telegram", async () => {
  let asked = false;
  await assert.rejects(
    assertSafeTestBot({
      getMe: async () => {
        asked = true;
        return { username: "roller_test_bot" };
      },
      configuredUsername: "@Roller_Official_Bot",
      dataDir: "data-test",
    }),
    /боевой бот/,
  );
  assert.equal(asked, false);
});

test("a test run keeps its data apart", async () => {
  await assert.rejects(assertSafeTestBot({ getMe: getTestMe, dataDir: "" }), /своя папка данных/);
});

test("a test bot with its own data goes ahead", async () => {
  const me = await assertSafeTestBot({ getMe: getTestMe, configuredUsername: "roller_test_bot", dataDir: "data-test" });
  assert.equal(me.username, "roller_test_bot");
  assert.equal(isLiveBotUsername("someone_else_bot"), false);
});
