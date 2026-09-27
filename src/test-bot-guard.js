// The test bot (npm run dev:test) runs this same code on a Mac with a token of
// its own. Started with the live bot's token by mistake, its polling would take
// the live bot down with a 409 - which has happened before. So in test mode the
// token is asked whose it is before anything else talks to Telegram, and a test
// run must keep its data apart from data/.

const LIVE_BOT_USERNAME = "roller_official_bot";

function isLiveBotUsername(username) {
  return String(username || "").replace(/^@/, "").trim().toLowerCase() === LIVE_BOT_USERNAME;
}

async function assertSafeTestBot({ getMe, configuredUsername = "", dataDir = "" }) {
  if (!String(dataDir || "").trim()) {
    throw new Error("GIVEAWAY_DATA_DIR не задан: у тестового бота должна быть своя папка данных.");
  }
  if (isLiveBotUsername(configuredUsername)) {
    throw new Error(`BOT_USERNAME = ${LIVE_BOT_USERNAME}: это боевой бот, тестовый запуск остановлен.`);
  }
  const me = await getMe();
  if (isLiveBotUsername(me?.username)) {
    throw new Error("Токен в .env.test — от боевого бота. Запуск остановлен, иначе живой бот упадёт с 409.");
  }
  return me;
}

module.exports = { LIVE_BOT_USERNAME, isLiveBotUsername, assertSafeTestBot };
