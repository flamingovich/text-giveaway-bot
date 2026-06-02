const { DEPMAN_KNOWLEDGE } = require("./depman-knowledge");
const {
  SUPPORT_KNOWLEDGE,
  verifyOpenRouterKey,
  replyRequestsMedia,
  sanitizeSupportReply,
  normalizeMessengerPunctuation,
  stripUnicodeEmoji,
  isAggressiveUserMessage,
} = require("./support-ai");

const DEPMAN_AGENT_NAMES = ["duduev9", "KAPRIZ", "penis_pisos", "karapuzik", "maga1989", "RUSIK"];

const AGENT_TEMPERATURE = {
  duduev9: 0.68,
  KAPRIZ: 0.76,
  penis_pisos: 0.82,
  karapuzik: 0.74,
  maga1989: 0.8,
  RUSIK: 0.7,
};

const MONEY_REQUEST_PATTERN =
  /(?:займи|одолжи|дай\s+в\s+долг|дай\s+денег|скинь\s+денег|переведи\s+мне|кинь\s+на\s+карту|нужны\s+деньги|дай\s+на\s+деп|подкинь\s+денег)/i;

const SEVERE_AGGRESSION_PATTERN =
  /(?:убью|убить\s+тебя|сдохни|найду\s+тебя|зарежу|расстреляю|взорву|изнасил|вырежу|зарежу)/i;

const CASINO_LINK_PATTERN = /https?:\/\/[^\s]+/i;

function pickRandomAgentName() {
  return DEPMAN_AGENT_NAMES[Math.floor(Math.random() * DEPMAN_AGENT_NAMES.length)];
}

function getAgentPersonaBlock(agentName) {
  switch (agentName) {
    case "KAPRIZ":
      return `Ты модератор KAPRIZ в ВИП поддержке Тимура.
Стиль: грамотный, спокойный, чуть ироничный. 1–2 коротких предложения.
Без эмодзи. Не подписывайся «я KAPRIZ» в тексте.`;

    case "penis_pisos":
      return `Ты модератор penis_pisos.
Стиль: молодёжный сленг, рваные фразы, «ну», «типа», «ок». Коротко.
Без эмодзи.`;

    case "karapuzik":
      return `Ты модератор karapuzik.
Стиль: мягче, чуть длиннее, иногда «))» текстом — редко. Грамотно.
Без эмодзи.`;

    case "maga1989":
      return `Ты модератор Мага (maga1989).
Стиль: прямой, сухой, по делу. Часто одно-два слова. «ясно», «ок», «неа».
Без эмодзи.`;

    case "RUSIK":
      return `Ты модератор RUSIK.
Стиль: разговорный, «короче», «блин», чуть сбивчиво, как в голосовом чате, но текстом.
Без эмодзи.`;

    case "duduev9":
    default:
      return `Ты модератор duduev9.
Стиль: самый ровный и грамотный, нейтральный. Коротко, без канцелярита.
Без эмодзи.`;
  }
}

function buildSystemPrompt(agentName) {
  const name = DEPMAN_AGENT_NAMES.includes(agentName) ? agentName : "duduev9";

  return `Ты ${name}, модератор ВИП поддержки стримера Тимура в Telegram. Не сам Тимур. Не нейросеть.

${getAgentPersonaBlock(name)}

Не представляйся именем в каждом сообщении — ник только для внутренней маршрутизации.

КРИТИЧНО — МЕДИА:
- НЕ принимаешь и НИКОГДА не просишь: фото, видео, скрины, голос, файлы, стикеры.
- Проблему только ТЕКСТОМ: шаг, что на экране, текст ошибки.
- Ссылки от пользователя (особенно на казино) — запрети, не разбирай.

Стиль:
- На «ты», сленг, мат в ответ на хамство НЕ используй — сдержанно.
- Без markdown и списков.
- Без эмодзи (🙂🙄 и т.д.) — только буквы, у karapuzik редко «))».
- Подогревай к депозиту через бонусы, но не обещай выигрыш.
- Периодически: казино — зло, скорее проиграешь, 18+.
- На просьбу оператора — ты и есть линия, помоги сам.
- RollerBot не по силам → @rollerbot_support_bot

${DEPMAN_KNOWLEDGE}

=== ROLLERBOT (участие в розыгрышах) ===

${SUPPORT_KNOWLEDGE}`;
}

function buildAggressionAddon() {
  return `

Пользователь грубит. Не отвечай агрессией и без мата. Коротко обозначь границу: «общайся нормально», «без этого», «по делу напиши». Без эмодзи.`;
}

function isMoneyRequest(text) {
  return MONEY_REQUEST_PATTERN.test(String(text || ""));
}

function isSevereAggression(text) {
  const value = String(text || "");
  if (SEVERE_AGGRESSION_PATTERN.test(value)) {
    return true;
  }
  if (!isAggressiveUserMessage(value)) {
    return false;
  }
  const rough = value.match(/(?:^|\s)(?:бля|блядь|хуй|пизд|сука|ебан|нахуй|мразь|тварь|пидор|дебил|мудак)/gi);
  return Boolean(rough && rough.length >= 2);
}

function isCasinoLinkMessage(text) {
  const value = String(text || "");
  if (!CASINO_LINK_PATTERN.test(value)) {
    return false;
  }
  return !/t\.me\//i.test(value);
}

function applyAgentStyle(agentName, text) {
  let result = stripUnicodeEmoji(text);

  switch (agentName) {
    case "karapuzik":
      if (Math.random() < 0.1 && !/\)\)/.test(result)) {
        result = `${result} ))`;
      }
      break;
    case "penis_pisos":
      if (Math.random() < 0.3 && !/^(ну|ок)\b/i.test(result)) {
        result = `ну ${result}`;
      }
      break;
    case "RUSIK":
      if (Math.random() < 0.25 && !/^(короче|блин)\b/i.test(result)) {
        result = `короче ${result}`;
      }
      break;
    default:
      break;
  }

  return result;
}

function humanizeSupportReply(text, agentName = "", _options = {}) {
  const name = DEPMAN_AGENT_NAMES.includes(agentName) ? agentName : "duduev9";

  let result = sanitizeSupportReply(String(text || "").trim());
  result = result
    .replace(/[Оо]пиш(ите|и|ь)/g, "напиши")
    .replace(/[Нн]апишите/g, "напиши")
    .replace(/,?\s*пожалуйста/gi, "")
    .replace(/[Бб]лагодар(им|ю)[^.!]*[.!]?\s*/gi, "")
    .replace(/(?:я\s+)?(?:рад|рады)\s+помочь[.!]?\s*/gi, "")
    .replace(/вы\s+заработаете|вы\s+выиграете|гарантирован/gi, "")
    .trim();

  result = normalizeMessengerPunctuation(result);

  if (name !== "duduev9" && Math.random() < 0.4 && result.length > 1) {
    result = result.charAt(0).toLowerCase() + result.slice(1);
  }

  result = applyAgentStyle(name, result);

  return result || "напиши по делу что не так";
}

async function callOpenRouter({
  apiKey,
  model,
  referer,
  userId,
  agentName,
  history,
  userMessage,
  aggressiveUser = false,
}) {
  let systemPrompt = buildSystemPrompt(agentName);
  if (aggressiveUser || isAggressiveUserMessage(userMessage)) {
    systemPrompt += buildAggressionAddon();
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer || "https://rollerbot.pro",
      "X-Title": "Depman VIP Support",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 420,
      temperature: AGENT_TEMPERATURE[agentName] ?? 0.78,
      user: userId ? String(userId) : undefined,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) {
    throw new Error("Пустой ответ модели");
  }
  return text;
}

const { verifyOpenRouterModel } = require("./support-ai");

module.exports = {
  DEPMAN_AGENT_NAMES,
  pickRandomAgentName,
  buildSystemPrompt,
  callOpenRouter,
  verifyOpenRouterKey,
  verifyOpenRouterModel,
  humanizeSupportReply,
  replyRequestsMedia,
  isAggressiveUserMessage,
  isMoneyRequest,
  isSevereAggression,
  isCasinoLinkMessage,
};
