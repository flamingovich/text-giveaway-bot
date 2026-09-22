const test = require("node:test");
const assert = require("node:assert/strict");

const { createRichMessageApi, readCoverFileId, TelegramRichError, COVER_FIELD } = require("./telegram-rich");
const { getRetryAfterSeconds } = require("./telegram-flood-retry");

function fakeTelegram(answers) {
  const calls = [];
  const queue = [...answers];
  const fetchImpl = async (url, init) => {
    const method = String(url).split("/").pop();
    const entry = { method, url, init, body: null, form: null };
    if (init.body instanceof FormData) {
      entry.form = {};
      for (const [key, value] of init.body.entries()) {
        entry.form[key] = typeof value === "string" ? value : { isBlob: value instanceof Blob, size: value.size, name: value.name };
      }
    } else {
      entry.body = JSON.parse(init.body);
    }
    calls.push(entry);
    const answer = queue.shift() ?? { ok: true, result: { message_id: 1 } };
    if (answer instanceof Error) {
      throw answer;
    }
    return { json: async () => answer };
  };
  return { calls, fetchImpl };
}

function makeApi(answers, extra = {}) {
  const { calls, fetchImpl } = fakeTelegram(answers);
  const api = createRichMessageApi({
    token: "123:SECRET",
    fetchImpl,
    readFile: () => Buffer.from("picture-bytes"),
    ...extra,
  });
  return { api, calls };
}

test("a post without a cover goes as plain JSON", async () => {
  const { api, calls } = makeApi([{ ok: true, result: { message_id: 77 } }]);
  const message = await api.sendRichPost({ chatId: "@channel", html: "<p>Приз</p>" });
  assert.equal(message.message_id, 77);
  assert.equal(calls[0].method, "sendRichMessage");
  assert.equal(calls[0].url, "https://api.telegram.org/bot123:SECRET/sendRichMessage");
  assert.deepEqual(calls[0].body, { chat_id: "@channel", rich_message: { html: "<p>Приз</p>" } });
});

test("the first send uploads the cover and points the post at it", async () => {
  const { api, calls } = makeApi([{ ok: true, result: { message_id: 5 } }]);
  await api.sendRichPost({ chatId: -100123, html: '<img src="tg://photo?id=cover"/>', cover: { path: "/data/uploads/a.jpg" } });
  const form = calls[0].form;
  assert.ok(form, "a file needs multipart");
  assert.equal(form.chat_id, "-100123");
  assert.deepEqual(JSON.parse(form.rich_message), {
    html: '<img src="tg://photo?id=cover"/>',
    media: [{ id: "cover", media: { type: "photo", media: `attach://${COVER_FIELD}` } }],
  });
  assert.equal(form[COVER_FIELD].isBlob, true);
  assert.equal(form[COVER_FIELD].size, Buffer.from("picture-bytes").length);
});

test("later edits send the stored file_id, never the picture again", async () => {
  const { api, calls } = makeApi([{ ok: true, result: { message_id: 5 } }]);
  await api.editRichPost({ chatId: "@c", messageId: 5, html: "<p>x</p>", cover: { fileId: "AgACAgIAAx" } });
  assert.equal(calls[0].method, "editMessageText");
  assert.equal(calls[0].form, null, "no upload");
  assert.deepEqual(calls[0].body, {
    chat_id: "@c",
    message_id: 5,
    rich_message: { html: "<p>x</p>", media: [{ id: "cover", media: { type: "photo", media: "AgACAgIAAx" } }] },
  });
});

test("a file_id wins over a path, so an edit never re-uploads by accident", async () => {
  const { api, calls } = makeApi([{ ok: true, result: {} }]);
  await api.editRichPost({ chatId: "@c", messageId: 5, html: "<p>x</p>", cover: { fileId: "FILE", path: "/data/a.jpg" } });
  assert.equal(calls[0].form, null);
  assert.equal(calls[0].body.rich_message.media[0].media.media, "FILE");
});

test("a re-send of a post whose cover is already in Telegram uploads nothing", async () => {
  const { api, calls } = makeApi([{ ok: true, result: {} }]);
  await api.sendRichPost({ chatId: "@c", html: "<p>x</p>", cover: { fileId: "FILE", path: "/data/a.jpg" } });
  assert.equal(calls[0].form, null);
  assert.equal(calls[0].body.rich_message.media[0].media.media, "FILE");
});

test("an inline keyboard can still ride along", async () => {
  const { api, calls } = makeApi([{ ok: true, result: {} }]);
  const replyMarkup = { inline_keyboard: [[{ text: "Участвовать", url: "https://t.me/x" }]] };
  await api.sendRichPost({ chatId: "@c", html: "<p>x</p>", replyMarkup });
  assert.deepEqual(calls[0].body.reply_markup, replyMarkup);
});

test("nothing empty is sent along", async () => {
  const { api, calls } = makeApi([{ ok: true, result: {} }]);
  await api.sendRichPost({ chatId: "@c", html: "<p>x</p>", replyMarkup: undefined, disableNotification: undefined });
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["chat_id", "rich_message"]);
});

test("a refusal from Telegram is thrown the way Telegraf throws it", async () => {
  const { api } = makeApi([{ ok: false, error_code: 400, description: "Bad Request: message is not modified" }]);
  await assert.rejects(
    () => api.editRichPost({ chatId: "@c", messageId: 1, html: "<p>x</p>" }),
    (error) => {
      assert.ok(error instanceof TelegramRichError);
      assert.equal(error.code, 400);
      assert.equal(error.description, "Bad Request: message is not modified");
      assert.equal(error.message, "400: Bad Request: message is not modified");
      assert.equal(error.method, "editMessageText");
      return true;
    },
  );
});

test("a 429 carries the wait, so the flood retry reads it", async () => {
  const { api } = makeApi([
    { ok: false, error_code: 429, description: "Too Many Requests: retry after 6", parameters: { retry_after: 6 } },
  ]);
  const error = await api.sendRichPost({ chatId: "@c", html: "<p>x</p>" }).catch((e) => e);
  assert.equal(getRetryAfterSeconds(error), 6);
});

test("a network failure is not swallowed", async () => {
  const { api } = makeApi([Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })]);
  await assert.rejects(() => api.sendRichPost({ chatId: "@c", html: "<p>x</p>" }), /socket hang up/);
});

test("the cover's file_id is read back from the sent post", () => {
  const message = {
    rich_message: {
      blocks: [
        { type: "paragraph" },
        {
          type: "photo",
          photo: [
            { file_id: "small", file_size: 1000 },
            { file_id: "big", file_size: 90000 },
            { file_id: "medium", file_size: 20000 },
          ],
        },
      ],
    },
  };
  assert.equal(readCoverFileId(message), "big");
  assert.equal(readCoverFileId({ rich_message: { blocks: [{ type: "paragraph" }] } }), "");
  assert.equal(readCoverFileId({ rich_message: { blocks: [{ type: "photo", photo: [] }] } }), "");
  assert.equal(readCoverFileId(undefined), "");
  assert.equal(readCoverFileId({ rich_message: { blocks: [{ type: "photo", photo: [{ file_id: "only" }] }] } }), "only");
});

test("the api root can be pointed elsewhere", async () => {
  const { api, calls } = makeApi([{ ok: true, result: {} }], { apiRoot: "http://127.0.0.1:8081" });
  await api.sendRichPost({ chatId: "@c", html: "<p>x</p>" });
  assert.equal(calls[0].url, "http://127.0.0.1:8081/bot123:SECRET/sendRichMessage");
});
