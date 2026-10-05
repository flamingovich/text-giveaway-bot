// Reading a screenshot of a person's profile on a project: which brand it shows
// and the account ID on it. It replaces the typed ID on the join's registration
// step: a typed ID costs nothing to make up, a screenshot of a profile does.
//
// The model is gemini-2.5-flash. Put to the owner's own screenshots of all five
// brands it read every ID and named every brand; flash-lite read the IDs too but
// called BEEF "FUGU" with 0.9 confidence, so the brand is never taken from lite,
// and the confidence a model gives itself is not asked for at all. BEEF, FUGU
// and IRIS run on one engine and their phone versions carry no logo, so the
// prompt tells them apart by the look of the page - background, the avatar's
// placeholder, how the menu is drawn - and never by level names or the level
// badge, which differ from player to player.
//
// Whatever the model says, the ID must still pass the project's own check
// (project-account-id.js), and the brand must be the one the step is for.

const { openRouterFetch } = require("./openrouter-fetch");
const { validateProjectAccountIdFormat } = require("./project-account-id");

const SHOT_MODEL = process.env.PROFILE_SHOT_MODEL || "google/gemini-2.5-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const BRAND_NAMES = {
  pokerdom: "Pokerdom",
  beef: "BEEF",
  fugu: "FUGU",
  iris: "IRIS",
  luckybear: "LuckyBear",
};

const SHOT_PROMPT = `Это скриншот профиля игрока в онлайн-казино (мобильная или ПК-версия). Определи бренд и ID аккаунта.
НЕ используй названия уровней, проценты прогресса, VIP-уровень и иконку уровня — они у каждого игрока свои.
Бренды:
- Pokerdom: логотип с зелёной буквой P / слово «Покердом», светлая страница настроек, ID подписан «ID ПОЛЬЗОВАТЕЛЯ» — 24 символа 0-9a-f.
- LuckyBear: логотип с медведем «LUCKY BEAR», ID — число после «UID:». Не путай с длинным именем вида «165ba529-04f5-…» над ним и с суммами баланса.
- BEEF, FUGU, IRIS — один движок, на мобильной версии логотипа нет, ID вида #XXXXX под ником и в поле «ID аккаунта». Различай по оформлению:
  - BEEF: графитовый сине-серый фон, аватар — серый скруглённый квадрат с залитым серым силуэтом, обычный шрифт.
  - FUGU: насыщенный тёмно-синий фон, аватар — ярко-синий скруглённый квадрат с белым контурным человечком, выбранный пункт меню залит синим, жирный округлый шрифт.
  - IRIS: нейтральный почти чёрный серый фон без синевы, аватар — чёрный круг с белым контурным человечком, пункты меню разделены тонкими линиями.
  На ПК-версии у всех трёх виден логотип и адрес сайта.
- Иначе — "unknown".
Верни только JSON: {"brand": "Pokerdom|LuckyBear|BEEF|FUGU|IRIS|unknown", "accountId": "ID ровно как на экране, без слова UID; пустая строка, если ID не виден", "isProfileScreen": true/false}`;

// "Lucky Bear", "покердом", "Fugu" -> the project's templateSlug.
function normalizeShotBrand(name) {
  const flat = String(name || "")
    .toLowerCase()
    .replace(/[^a-zа-яё]/g, "");
  if (flat === "покердом") return "pokerdom";
  return BRAND_NAMES[flat] ? flat : "";
}

// The model's answer is asked for as JSON; it sometimes still comes in a code fence.
function parseShotAnswer(text) {
  const body = String(text || "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let data = null;
  try {
    data = JSON.parse(body);
  } catch (_error) {
    const match = body.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        data = JSON.parse(match[0]);
      } catch (_ignored) {
        data = null;
      }
    }
  }
  if (!data || typeof data !== "object") {
    return null;
  }
  return {
    brand: normalizeShotBrand(data.brand),
    accountId: String(data.accountId || "").trim(),
    isProfileScreen: data.isProfileScreen !== false,
  };
}

// "UID:1771050325", "uid 1771050325", "#w3n5e " -> what the project check expects.
function cleanShotAccountId(raw) {
  return String(raw || "")
    .replace(/^\s*uid\s*[:#]?\s*/i, "")
    .replace(/\s+/g, "");
}

// What the step does with an answer: the ID to confirm, or why the picture is
// turned down. Pure, so the rules can be tested without asking a model.
function judgeShotAnswer(answer, project) {
  const slug = String(project?.templateSlug || "").toLowerCase();
  if (!answer) {
    return { ok: false, reason: "unreadable" };
  }
  if (!answer.isProfileScreen || !answer.brand) {
    return { ok: false, reason: "not_profile" };
  }
  if (slug && answer.brand !== slug) {
    return { ok: false, reason: "wrong_brand", brandSeen: answer.brand };
  }
  const raw = cleanShotAccountId(answer.accountId);
  if (!raw) {
    return { ok: false, reason: "no_id" };
  }
  const validation = validateProjectAccountIdFormat(raw, project);
  if (!validation.ok) {
    return { ok: false, reason: "bad_id" };
  }
  return { ok: true, accountId: validation.normalized };
}

// What the person reads when the picture is turned down.
function describeShotRefusal(reason, project, brandSeen = "") {
  const name = project?.name || BRAND_NAMES[project?.templateSlug] || "проекта";
  switch (reason) {
    case "wrong_brand":
      return `Это скриншот ${BRAND_NAMES[brandSeen] || "другого проекта"}, а нужен ${name}. Пришлите скриншот вашего профиля ${name}.`;
    case "no_id":
      return `На скриншоте не видно ID. Сделайте скриншот профиля ${name}, где видны никнейм и ID.`;
    case "bad_id":
      return `Не получилось разобрать ID. Сделайте скриншот профиля ${name} почётче, где видны никнейм и ID.`;
    case "unavailable":
      return "Не получилось прочитать скриншот — попробуйте ещё раз через минуту.";
    case "not_profile":
    case "unreadable":
    default:
      return `Это не похоже на профиль ${name}. Откройте профиль на ${name} и сделайте скриншот, где видны никнейм и ID.`;
  }
}

// Asks the model. Returns the parsed answer, or throws when it could not be had
// at all (no key, the network, the provider) - that is "try again", not a refusal.
async function askShotModel({ apiKey, imageDataUrl, referer = "", fetchImpl = openRouterFetch, model = SHOT_MODEL }) {
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY не задан");
  }
  const response = await fetchImpl(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(referer ? { "HTTP-Referer": referer } : {}),
      "X-Title": "RollerBot",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SHOT_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${data?.error?.message || "ошибка"}`);
  }
  return parseShotAnswer(data?.choices?.[0]?.message?.content || "");
}

module.exports = {
  SHOT_MODEL,
  SHOT_PROMPT,
  BRAND_NAMES,
  normalizeShotBrand,
  parseShotAnswer,
  cleanShotAccountId,
  judgeShotAnswer,
  describeShotRefusal,
  askShotModel,
};
