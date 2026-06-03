#!/usr/bin/env node
/**
 * Тест premium custom emoji через Bot API.
 *
 *   node scripts/test-premium-emoji.js send
 *   node scripts/test-premium-emoji.js listen
 *   node scripts/test-premium-emoji.js copy <message_id>
 *   node scripts/test-premium-emoji.js forward <message_id>
 *
 * CHAT_ID — кому слать (по умолчанию 675228116 / ppgchz).
 */
require("dotenv").config();

const TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = Number(process.env.TEST_CHAT_ID || 675228116);
const GIFT_EMOJI_ID = "5203996991054432397";

if (!TOKEN || TOKEN.includes("your_")) {
  console.error("Укажите BOT_TOKEN в .env");
  process.exit(1);
}

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

function logResult(label, json) {
  console.log(`\n=== ${label} ===`);
  if (!json.ok) {
    console.log("ERROR:", json.error_code, json.description);
    return null;
  }
  const m = json.result;
  if (m && typeof m === "object" && "message_id" in m) {
    console.log("message_id:", m.message_id);
    console.log("text:", JSON.stringify(m.text || m.caption || ""));
    console.log("entities:", JSON.stringify(m.entities || m.caption_entities || []));
    return m;
  }
  console.log(JSON.stringify(m, null, 2));
  return m;
}

async function cmdSend() {
  await logResult(
    "sendMessage (entities)",
    await api("sendMessage", {
      chat_id: CHAT_ID,
      text: "🎁 Тест send — если анимация, owner/Premium ок",
      entities: [{ type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: GIFT_EMOJI_ID }],
      reply_markup: {
        inline_keyboard: [[{ text: "Кнопка-тест", callback_data: "test:premium_send" }]],
      },
    }),
  );
}

async function cmdCopy(messageId) {
  await logResult(
    "copyMessage (без правок, + кнопка)",
    await api("copyMessage", {
      chat_id: CHAT_ID,
      from_chat_id: CHAT_ID,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: "Кнопка после copy", callback_data: "test:premium_copy" }]],
      },
    }),
  );
}

async function cmdForward(messageId) {
  await logResult(
    "forwardMessage",
    await api("forwardMessage", {
      chat_id: CHAT_ID,
      from_chat_id: CHAT_ID,
      message_id: messageId,
    }),
  );
}

async function cmdListen() {
  console.log(`Жду сообщение от chat ${CHAT_ID} с custom_emoji (120 сек)...`);
  console.log("Отправь @roller_official_bot одно premium 🎁 (не пересылку).\n");

  await api("sendMessage", {
    chat_id: CHAT_ID,
    text:
      "🧪 Тест premium emoji\n\n" +
      "Отправь сюда **одно** premium 🎁 (вставь из emoji-клавиатуры, не пересылку). " +
      "Скрипт поймает сообщение и попробует copy / echo / forward.",
    parse_mode: "Markdown",
  });

  let offset = 0;
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const updates = await api("getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message"],
    });
    if (!updates.ok) {
      console.error(updates.description);
      break;
    }
    for (const u of updates.result || []) {
      offset = u.update_id + 1;
      const m = u.message;
      if (!m || m.chat?.id !== CHAT_ID || m.from?.id !== CHAT_ID) {
        continue;
      }
      const custom = (m.entities || []).filter((e) => e.type === "custom_emoji");
      console.log("\nПоймано message_id:", m.message_id);
      console.log("text:", JSON.stringify(m.text || ""));
      console.log("custom_emoji entities:", JSON.stringify(custom));
      if (!custom.length) {
        console.log("(нет custom_emoji — пришли premium 🎁, не обычный символ)");
        continue;
      }

      await logResult(
        "echo sendMessage (те же entities)",
        await api("sendMessage", {
          chat_id: CHAT_ID,
          text: m.text,
          entities: m.entities,
        }),
      );
      await cmdCopy(m.message_id);
      await cmdForward(m.message_id);
      console.log("\nГотово. Проверь 3 новых сообщения в Telegram.");
      return;
    }
  }
  console.log("\nТаймаут. Запусти снова или: node scripts/test-premium-emoji.js copy <message_id>");
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "send") return cmdSend();
  if (cmd === "listen") return cmdListen();
  if (cmd === "copy") {
    const id = Number(arg);
    if (!id) throw new Error("usage: copy <message_id>");
    return cmdCopy(id);
  }
  if (cmd === "forward") {
    const id = Number(arg);
    if (!id) throw new Error("usage: forward <message_id>");
    return cmdForward(id);
  }
  console.log(`Usage:
  node scripts/test-premium-emoji.js send
  node scripts/test-premium-emoji.js listen
  node scripts/test-premium-emoji.js copy <message_id>
  node scripts/test-premium-emoji.js forward <message_id>`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
