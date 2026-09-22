// Rich messages (Bot API 10.3) are how the "Участвую" button gets inside the
// post instead of under it. Telegraf 4.x predates them, so these two calls go
// to the HTTP API directly - and they throw errors shaped exactly like
// Telegraf's, so the flood retry and the "this edit will never work" rules
// (telegram-flood-retry.js, telegram-edit-errors.js) keep working on them.
//
// The cover is uploaded once, with the post. Every later edit - the participant
// counter ticks all through a draw - sends the file_id Telegram gave back, so
// the picture travels once, not once a minute.

const fs = require("fs");

const COVER_MEDIA_ID = "cover";
const COVER_FIELD = "cover_file";

class TelegramRichError extends Error {
  constructor(method, response) {
    super(`${response?.error_code ?? "?"}: ${response?.description ?? "unknown error"}`);
    this.name = "TelegramRichError";
    this.method = method;
    this.response = response || {};
  }
  get code() {
    return this.response.error_code;
  }
  get description() {
    return this.response.description;
  }
  get parameters() {
    return this.response.parameters;
  }
}

// A cover is either a file on disk (first send) or a file_id (every edit after).
function buildMedia(cover) {
  if (!cover) {
    return null;
  }
  if (cover.fileId) {
    return { id: COVER_MEDIA_ID, media: { type: "photo", media: String(cover.fileId) } };
  }
  if (cover.path) {
    return { id: COVER_MEDIA_ID, media: { type: "photo", media: `attach://${COVER_FIELD}` } };
  }
  return null;
}

function createRichMessageApi(options = {}) {
  const {
    token,
    fetchImpl = globalThis.fetch,
    apiRoot = "https://api.telegram.org",
    readFile = (filePath) => fs.readFileSync(filePath),
  } = options;

  async function call(method, params, upload) {
    const url = `${apiRoot}/bot${token}/${method}`;
    let response;
    if (upload) {
      const form = new FormData();
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
          continue;
        }
        form.append(key, typeof value === "string" ? value : JSON.stringify(value));
      }
      form.append(upload.field, new Blob([readFile(upload.path)]), upload.name || COVER_FIELD);
      response = await fetchImpl(url, { method: "POST", body: form });
    } else {
      const body = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          body[key] = value;
        }
      }
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    const payload = await response.json();
    if (!payload?.ok) {
      throw new TelegramRichError(method, payload);
    }
    return payload.result;
  }

  function richMessage(html, cover) {
    const media = buildMedia(cover);
    return media ? { html, media: [media] } : { html };
  }

  return {
    // Posts the draw. `cover` is { path } on the first send, { fileId } after.
    async sendRichPost({ chatId, html, cover, replyMarkup, disableNotification, messageThreadId }) {
      const params = {
        chat_id: chatId,
        rich_message: richMessage(html, cover),
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
        message_thread_id: messageThreadId,
      };
      const upload = cover?.path && !cover?.fileId ? { field: COVER_FIELD, path: cover.path } : null;
      return call("sendRichMessage", params, upload);
    },

    // Edits the post in place: the counter in the button, or the finished text.
    async editRichPost({ chatId, messageId, html, cover, replyMarkup }) {
      const params = {
        chat_id: chatId,
        message_id: messageId,
        rich_message: richMessage(html, cover),
        reply_markup: replyMarkup,
      };
      const upload = cover?.path && !cover?.fileId ? { field: COVER_FIELD, path: cover.path } : null;
      return call("editMessageText", params, upload);
    },
  };
}

// The file_id of the cover Telegram stored, so later edits send no picture.
function readCoverFileId(message) {
  const photoBlock = (message?.rich_message?.blocks || []).find((block) => block.type === "photo");
  const sizes = photoBlock?.photo || [];
  if (!sizes.length) {
    return "";
  }
  const biggest = sizes.reduce((best, size) =>
    (Number(size?.file_size) || 0) >= (Number(best?.file_size) || 0) ? size : best,
  );
  return biggest?.file_id || "";
}

module.exports = {
  COVER_MEDIA_ID,
  COVER_FIELD,
  TelegramRichError,
  createRichMessageApi,
  readCoverFileId,
};
