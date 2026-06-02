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
  duduev9: 0.82,
  KAPRIZ: 0.88,
  penis_pisos: 0.92,
  karapuzik: 0.86,
  maga1989: 0.9,
  RUSIK: 0.9,
};

const MONEY_REQUEST_PATTERN =
  /(?:займи|одолжи|дай\s+в\s+долг|дай\s+денег|скинь\s+денег|переведи\s+мне|кинь\s+на\s+карту|нужны\s+деньги|дай\s+на\s+деп|подкинь\s+денег|баблом|бабки)/i;

const SEVERE_AGGRESSION_PATTERN =
  /(?:убью|убить\s+тебя|сдохни|найду\s+тебя|зарежу|расстреляю|взорву|изнасил|вырежу|зарежу)/i;

const CASINO_LINK_PATTERN = /https?:\/\/[^\s]+/i;

const FORMAL_PHRASES =
  /(?:благодарим|рады помочь|обращайтесь|остались ли вопросы|я понимаю вашу|пожалуйста|не могли бы|уточните|опишите|рекомендую обратить)/gi;

function pickRandomAgentName() {
  return DEPMAN_AGENT_NAMES[Math.floor(Math.random() * DEPMAN_AGENT_NAMES.length)];
}

function getAgentPersonaBlock(agentName) {
  switch (agentName) {
    case "KAPRIZ":
      return `Ты KAPRIZ, модер в випке у Депмена. Пишешь как обычный парень в тг, не как саппорт.
коротко, можно сленг, иногда без запятых, одним куском текста без абзацев`;

    case "penis_pisos":
      return `Ты penis_pisos, модер. Стиль: «ну», «типа», «ок», «ща», рвано, по-братски.
можно криво сформулировать но смысл ясен`;

    case "karapuzik":
      return `Ты karapuzik, модер. Чуть мягче, но всё равно простой язык не официоз.
иногда «))» текстом — очень редко`;

    case "maga1989":
      return `Ты Мага (maga1989), модер. Сухо и коротко «ок», «неа», «так», без воды.
как в чате стрима отвечаешь`;

    case "RUSIK":
      return `Ты RUSIK, модер. «короче», «блин», «ну», разговорка, можно сбиваться.
не пиши как инструкцию`;

    case "duduev9":
    default:
      return `Ты duduev9, модер. Самый спокойный но всё равно свой в лагере, не душный саппорт.
простые слова, без канцелярита`;
  }
}

function buildSystemPrompt(agentName) {
  const name = DEPMAN_AGENT_NAMES.includes(agentName) ? agentName : "duduev9";

  return `Ты ${name}, модератор вип поддержки стримера Тимура (Депмен). Не Тимур. Не бот из колл-центра.

${getAgentPersonaBlock(name)}

КАК ПИСАТЬ (главное):
- Как кент/друг в личке тг, простой модератор команды Депмена
- НЕ как агент серьёзной поддержки, НЕ вежливый официоз, НЕ «рад помочь», НЕ списки и абзацы
- Одно-два коротких сообщения в одну строку (без переносов на новую строку)
- Можно без идеальной грамматики, можно «ща», «ну», «типа», «короче»
- На «ты», мат в ответ на хамство НЕ используй — спокойно обрежь
- Без эмодзи (🙂🙄) — максимум редко «))» у karapuzik
- Не подписывайся в каждом ответе «я ${name}» — ник уже видели при подключении
- Не говори «я могу помочь с вопросами о...» списком — отвечай по-человечески

КРИТИЧНО — МЕДИА:
- НЕ принимаешь и НЕ просишь фото/видео/скрины/голос/файлы
- Только текст: что на экране, шаг, ошибка
- Ссылки от юзера (казино и т.д.) — не принимай

Факты и правила — из базы ниже. Не выдумывай. Подогревай к депо через бонусы но не обещай выигрыш.
Иногда: казино зло, скорее сольёшь, 18+. RollerBot тяжёлый кейс → @rollerbot_support_bot

${DEPMAN_KNOWLEDGE}

=== ROLLERBOT (розыгрыши) ===

${SUPPORT_KNOWLEDGE}`;
}

function buildAggressionAddon() {
  return `

Юзер хамит. Без мата в ответ, коротко: «без этого», «нормально общайся», «по делу напиши». Одной строкой.`;
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

function casualizeDepmanReply(text) {
  return String(text || "")
    .replace(/\n+/g, " ")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(FORMAL_PHRASES, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applyAgentStyle(agentName, text) {
  let result = stripUnicodeEmoji(text);

  switch (agentName) {
    case "karapuzik":
      if (Math.random() < 0.12 && !/\)\)/.test(result)) {
        result = `${result} ))`;
      }
      break;
    case "penis_pisos":
      if (Math.random() < 0.35 && !/^(ну|ок|ща)\b/i.test(result)) {
        result = `ну ${result}`;
      }
      break;
    case "RUSIK":
      if (Math.random() < 0.3 && !/^(короче|блин|ну)\b/i.test(result)) {
        result = `короче ${result}`;
      }
      break;
    case "maga1989":
      if (Math.random() < 0.2 && !/^(ок|неа|так)\b/i.test(result)) {
        result = `ок ${result}`;
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
  result = casualizeDepmanReply(result);
  result = result
    .replace(/[Оо]пиш(ите|и|ь)/g, "напиши")
    .replace(/[Нн]апишите/g, "напиши")
    .replace(/вы\s+заработаете|вы\s+выиграете|гарантирован/gi, "")
    .trim();

  result = normalizeMessengerPunctuation(result);

  if (Math.random() < 0.55 && result.length > 1) {
    result = result.charAt(0).toLowerCase() + result.slice(1);
  }

  result = applyAgentStyle(name, result);

  return result || "напиши по делу че не так";
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
      max_tokens: 380,
      temperature: AGENT_TEMPERATURE[agentName] ?? 0.88,
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
