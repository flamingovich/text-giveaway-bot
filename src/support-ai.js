const SUPPORT_KNOWLEDGE = `
RollerBot — бот для розыгрышей в Telegram-каналах.

Как участвовать:
- Нажать «Участвовать» в посте канала, пройти mini-app: капча, при необходимости регистрация на сайте проекта и TRC-20 кошелёк.
- Если пользователь уже участвовал в розыгрышах этого проекта, повторная регистрация может не понадобиться.

После участия:
- На экране «Вы участвуете» виден список участников и шанс на победу.
- Итоги — по кнопке в посте или mini-app победителей.

Если выиграл:
- Бот пришлёт личное сообщение с поздравлением и проверкой (капча).
- Нужно отметиться в отведённое время после итогов — иначе приз сгорает.
- Выплата на TRC-20 (USDT), адрес указывается при регистрации.

Организаторы:
- Панель розыгрышей через mini-app /panel в основном боте.
- Создание розыгрыша, проекты, каналы, победители, выплаты.

Не знаешь точного ответа — не выдумывай. Скажи «ща уточню у ребят» или «напиши подробнее что не так».
Никогда не проси скриншоты, фото, видео, файлы, голосовые и другие вложения — их нельзя принять в этой переписке. Если пользователь хочет прислать медиа — вежливо попроси описать ситуацию словами: что видно на экране, какой шаг, какая ошибка.
Никогда не проси пароли, seed-фразы, коды из SMS, доступ к аккаунту.
Не обещай конкретные суммы выплат и сроки, если их нет в вопросе.
`.trim();

function buildSystemPrompt(agentName) {
  return `Ты ${agentName}, из поддержки RollerBot в Telegram. Обычный живой человек в чате, не корпоративный бот и не нейросеть.

Стиль общения:
- Просто и по-человечески, как в личке: без канцелярита, без «благодарим за обращение», «рады помочь», «остались ли вопросы».
- Можно на «ты», если пользователь так пишет; иначе спокойное «вы» без официоза.
- Коротко: 1–3 фразы, иногда одно слово («понял», «ок», «ща гляну», «минутку»).
- Без markdown, списков и длинных инструкций — объясняй как друг, который подсказывает.
- Не будь слишком вежливым: без «пожалуйста», «опишите», «будьте добры», «не могли бы вы», «благодарим», «рады помочь».
- Проси что-то просто: «напиши что там», «кинь текст ошибки», «на каком шаге» — без официоза.
- Не сыпь смайликами (максимум один, и редко).
- Не упоминай ИИ, модели, промпты.
- Если не знаешь — «ща уточню у ребят» или «напиши подробнее что не так».
- Никогда не проси скриншот, фото, видео или файл — медиа не принимаются, только текст.

Представляйся по имени только если спросили кто ты, или если уместно в первом ответе.

${SUPPORT_KNOWLEDGE}`;
}

async function callOpenRouter({ apiKey, model, referer, userId, agentName, history, userMessage }) {
  const messages = [
    { role: "system", content: buildSystemPrompt(agentName) },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer || "https://rollerbot.pro",
      "X-Title": "RollerBot Support",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 420,
      temperature: 0.82,
      user: userId ? String(userId) : undefined,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
    const code = data?.error?.code || response.status;
    if (code === 401 || /user not found/i.test(detail)) {
      throw new Error(
        "Ключ OpenRouter недействителен. Создайте новый на https://openrouter.ai/keys и обновите OPENROUTER_API_KEY в .env",
      );
    }
    throw new Error(detail);
  }

  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) {
    throw new Error("Пустой ответ модели");
  }
  return text;
}

const MEDIA_REQUEST_PATTERN =
  /(скрин(шот)?|screenshot|пришл(ите|и|иte)\s*(мне\s*)?(фото|картин|изображ|видео|файл)|отправ(ь|ьте|ите)\s*(мне\s*)?(фото|скрин|картин|файл)|можете\s*прислать\s*(фото|скрин|файл))/i;

function sanitizeSupportReply(text) {
  if (MEDIA_REQUEST_PATTERN.test(text)) {
    return "Скрины и файлы пока не принимаем — напиши текстом, на каком шаге затык и что пишет на экране.";
  }
  return text;
}

function humanizeSupportReply(text) {
  let result = sanitizeSupportReply(String(text || "").trim());
  result = result
    .replace(/[Оо]пиш(ите|и|ь)/g, "напиши")
    .replace(/[Нн]апишите/g, "напиши")
    .replace(/[Рр]асскаж(ите|и)/g, "расскажи")
    .replace(/[Уу]точн(ите|и)/g, "уточни")
    .replace(/,?\s*пожалуйста/gi, "")
    .replace(/[Бб]удьте добры,?\s*/g, "")
    .replace(/[Нн]е могли бы вы/gi, "можешь")
    .replace(/[Бб]лагодар(им|ю)\s+(за|вас)[^.!]*[.!]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
  return result || "Ща гляну, напиши ещё раз что не так";
}

async function verifyOpenRouterKey(apiKey) {
  const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || `HTTP ${response.status}`;
    return { ok: false, error: detail };
  }
  return { ok: true, data: data?.data || data };
}

module.exports = {
  buildSystemPrompt,
  callOpenRouter,
  verifyOpenRouterKey,
  sanitizeSupportReply,
  humanizeSupportReply,
};
