const DEFAULT_TELEGRAM_API_TIMEOUT_MS = Number(process.env.TELEGRAM_API_TIMEOUT_MS || 30000);

// Отправка файла упирается в скорость выгрузки, а не в скорость ответа API.
// На общем таймауте она рвётся уже после того, как пост появился в канале,
// и тогда бот теряет message_id собственного поста.
const DEFAULT_TELEGRAM_UPLOAD_TIMEOUT_MS = Number(
  process.env.TELEGRAM_UPLOAD_TIMEOUT_MS || 180000,
);

// Long polling holds getUpdates open on purpose; timing it out would kill the bot.
const UNBOUNDED_METHODS = new Set(["getUpdates"]);

const UPLOAD_METHODS = new Set([
  "sendPhoto",
  "sendVideo",
  "sendAnimation",
  "sendDocument",
  "sendAudio",
  "sendVoice",
  "sendVideoNote",
  "sendMediaGroup",
  "editMessageMedia",
  "setChatPhoto",
]);

function applyTelegramApiTimeout(
  telegram,
  timeoutMs = DEFAULT_TELEGRAM_API_TIMEOUT_MS,
  uploadTimeoutMs = DEFAULT_TELEGRAM_UPLOAD_TIMEOUT_MS,
) {
  if (!telegram || typeof telegram.callApi !== "function" || telegram.__apiTimeoutApplied) {
    return telegram;
  }

  const callApi = telegram.callApi.bind(telegram);

  telegram.callApi = (method, ...rest) => {
    if (UNBOUNDED_METHODS.has(method)) {
      return callApi(method, ...rest);
    }

    const limitMs = UPLOAD_METHODS.has(method) ? uploadTimeoutMs : timeoutMs;

    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`telegram_api_timeout: ${method}`);
        error.code = "telegram_api_timeout";
        error.method = method;
        reject(error);
      }, limitMs);
    });

    return Promise.race([callApi(method, ...rest), timeout]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  };

  telegram.__apiTimeoutApplied = true;
  return telegram;
}

module.exports = {
  applyTelegramApiTimeout,
  DEFAULT_TELEGRAM_API_TIMEOUT_MS,
  DEFAULT_TELEGRAM_UPLOAD_TIMEOUT_MS,
};
