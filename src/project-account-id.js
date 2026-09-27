const { isPokerdomProject, isLuckyBearProject } = require("./deposit-guide");

const ROYAL_PROJECT_ACCOUNT_ID_PATTERN = /^#[A-Z0-9]{5}$/;
// LuckyBear: the id is the numeric UID shown in the profile, e.g. 1771050325.
// The first version asked for the hex code printed above it (165ba529-04f5);
// people entered the UID anyway - 166 of the LuckyBear ids in the base are UIDs
// and not one is the hex code - and the owner confirmed the UID is the id.
// Digits only. The base has 9 to 11 of them and nobody knows whether the length
// varies, so the bounds are loose; what is refused is anything with a letter in
// it (a name, a word, the hex code), which a UID never has.
const LUCKYBEAR_PROJECT_ACCOUNT_ID_PATTERN = /^\d{6,12}$/;
const LUCKYBEAR_PROJECT_ACCOUNT_ID_MIN_LENGTH = 6;
const LUCKYBEAR_PROJECT_ACCOUNT_ID_MAX_LENGTH = 12;
// Ids saved before the UID rule: hex with a dash. Still recognised as LuckyBear's.
const LUCKYBEAR_LEGACY_ID_PATTERN = /^[a-z0-9]{3,}(-[a-z0-9]{1,})*$/;

// Pokerdom's user ids are MongoDB ObjectIds: 24 hex characters whose first
// eight are the second the account was created. 465 of the 467 Pokerdom ids in
// the base have exactly that shape (the other two are a character short and
// eight too long), and every date in them is a real one, 2015 onwards - so an
// id that is not 24 hex characters with a believable date was not copied from
// the profile.
const POKERDOM_OBJECT_ID_LENGTH = 24;
const POKERDOM_EARLIEST_ACCOUNT_MS = Date.parse("2010-01-01T00:00:00Z");
// The owner started taking Pokerdom referrals on 1 June 2026 (Moscow). An
// account created before that cannot be one of his referrals, whatever the
// person says.
const POKERDOM_REFERRALS_START_MS = Date.parse("2026-06-01T00:00:00+03:00");

const POKERDOM_PROJECT_ACCOUNT_ID_MIN_LENGTH = 15;
const POKERDOM_PROJECT_ACCOUNT_ID_MAX_LENGTH = 64;

const SEQUENCE_ALPHABETS = [
  "0123456789",
  "9876543210",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "ZYXWVUTSRQPONMLKJIHGFEDCBA",
];

const ROYAL_PROJECT_ID_GUIDE_STEPS = [
  {
    num: 1,
    text: "Откройте профиль на проекте",
    imageUrl: "/assets/id_rp_guide/id_1.png",
  },
  {
    num: 2,
    text: "Скопируйте ID под ником (формат #XXXXX)",
    imageUrl: "/assets/id_rp_guide/id_2.png",
  },
];

const LUCKYBEAR_PROJECT_ID_GUIDE_STEPS = [
  {
    num: 1,
    text: "Нажмите на значок профиля в правом верхнем углу",
    imageUrl: "/assets/lb_id_guide/lb_id_1.jpg",
  },
  {
    num: 2,
    text: "Скопируйте UID под уровнем — только цифры, например 1771050325",
    imageUrl: "/assets/lb_id_guide/lb_id_2.jpg",
  },
];

const POKERDOM_PROJECT_ID_GUIDE_STEPS = [
  {
    num: 1,
    text: "Нажмите «Профиль» в нижнем меню",
    imageUrl: "/assets/pd_id_guide/pd_id_1.png",
  },
  {
    num: 2,
    text: "Откройте настройки профиля",
    imageUrl: "/assets/pd_id_guide/pd_id_2.png",
  },
  {
    num: 3,
    text: "Перейдите в «Личная информация»",
    imageUrl: "/assets/pd_id_guide/pd_id_3.png",
  },
  {
    num: 4,
    text: "Скопируйте ID пользователя",
    imageUrl: "/assets/pd_id_guide/pd_id_4.png",
  },
];

function drawAsksProjectIdOnJoin(draw) {
  return Boolean(draw?.projectId) && draw?.askProjectIdOnJoin === true;
}

function getProjectAccountIdKind(project) {
  if (isLuckyBearProject(project)) {
    return "luckybear";
  }
  return isPokerdomProject(project) ? "pokerdom" : "royal";
}

function detectStoredProjectAccountIdKind(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "royal";
  }
  if (ROYAL_PROJECT_ACCOUNT_ID_PATTERN.test(raw.toUpperCase())) {
    return "royal";
  }
  const hexBody = raw.replace(/^#/, "").toLowerCase();
  if (LUCKYBEAR_PROJECT_ACCOUNT_ID_PATTERN.test(hexBody)) {
    return "luckybear";
  }
  // Ids saved before the UID rule: the dash is what tells a LuckyBear id from a
  // Pokerdom one; without a project to ask, it is the only signal there is.
  if (hexBody.includes("-") && LUCKYBEAR_LEGACY_ID_PATTERN.test(hexBody)) {
    return "luckybear";
  }
  if (/^[a-f0-9]+$/.test(hexBody) && hexBody.length >= POKERDOM_PROJECT_ACCOUNT_ID_MIN_LENGTH) {
    return "pokerdom";
  }
  if (raw.startsWith("#")) {
    return "royal";
  }
  return "royal";
}

function resolveProjectAccountIdKind(kindOrProject, rawValue = "") {
  if (kindOrProject && typeof kindOrProject === "object") {
    return getProjectAccountIdKind(kindOrProject);
  }
  if (kindOrProject === "pokerdom" || kindOrProject === "royal" || kindOrProject === "luckybear") {
    return kindOrProject;
  }
  return detectStoredProjectAccountIdKind(rawValue);
}

function normalizeRoyalProjectAccountId(raw) {
  let value = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!value) {
    return "";
  }
  if (!value.startsWith("#")) {
    value = `#${value}`;
  }
  return value;
}

function normalizePokerdomProjectAccountId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "")
    .slice(0, POKERDOM_PROJECT_ACCOUNT_ID_MAX_LENGTH);
}

// People paste the UID with its "UID:" label, spaces or a stray #; those go.
// Letters are kept on purpose: stripping them would turn a pasted hex code or a
// name into some string of digits and let it through as if it were a UID - kept,
// they fail the check and the person is asked again.
function normalizeLuckyBearProjectAccountId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^uid\s*:?\s*/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 32);
}

function normalizeProjectAccountId(raw, kindOrProject = null) {
  const kind = resolveProjectAccountIdKind(kindOrProject, raw);
  if (kind === "luckybear") {
    return normalizeLuckyBearProjectAccountId(raw);
  }
  if (kind === "pokerdom") {
    return normalizePokerdomProjectAccountId(raw);
  }
  return normalizeRoyalProjectAccountId(raw);
}

function isSequentialBody(body) {
  if (!body || body.length !== 5) {
    return false;
  }
  for (const alphabet of SEQUENCE_ALPHABETS) {
    for (let index = 0; index <= alphabet.length - body.length; index += 1) {
      if (alphabet.slice(index, index + body.length) === body) {
        return true;
      }
    }
  }
  return false;
}

// Filler someone types instead of their real id: one character over and over,
// or a straight run like 12345678 or abcd. Digits wrap past 9 because the long
// Pokerdom ids make "123456789012345" the obvious thing to type. Nothing
// stricter on purpose - refusing a real id keeps a person out of a draw (the
// LuckyBear note in CLAUDE.md), so only shapes no project would ever issue.
function isFillerProjectAccountId(value) {
  const body = String(value || "").replace(/-/g, "").toLowerCase();
  if (body.length < 4) {
    return false;
  }
  if (/^(.)\1+$/.test(body)) {
    return true;
  }
  const isDigits = /^[0-9]+$/.test(body);
  const isLetters = /^[a-z]+$/.test(body);
  if (!isDigits && !isLetters) {
    return false;
  }
  for (const step of [1, -1]) {
    let run = true;
    for (let i = 1; i < body.length; i += 1) {
      const previous = body.charCodeAt(i - 1);
      const expected = isDigits ? 48 + ((previous - 48 + step + 10) % 10) : previous + step;
      if (body.charCodeAt(i) !== expected) {
        run = false;
        break;
      }
    }
    if (run) {
      return true;
    }
  }
  return false;
}

// What a hand types when there is no id to copy: a row of the keyboard, left to
// right or back.
const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

function isKeyboardRun(body) {
  return KEYBOARD_ROWS.some((row) => row.includes(body) || [...row].reverse().join("").includes(body));
}

// First names and words as five letters, which is how #SLAVA got in. Letters-only
// ids are common among the real ones (44% of #XXXXX ids in the base), so letters
// alone prove nothing; a real id that happens to spell a name is one chance in
// hundreds of thousands per name.
const NAME_AND_WORD_IDS = new Set([
  // Names, whole or cut to five letters.
  "ALEKS", "ALEXA", "ALEXE", "SASHA", "SANYA", "SANEK", "ANDRE", "ANDRY", "ANTON", "ARTEM", "ARTUR",
  "ARSEN", "BOGDA", "BORIS", "VADIM", "VALER", "VANYA", "VASYA", "VIKTO", "VITAL", "VITYA", "VLADA",
  "VLADI", "VOVAN", "VOVKA", "GENNA", "GOSHA", "GRISH", "DANIL", "DANYA", "DENIS", "DIMAS", "DIMON",
  "DMITR", "EVGEN", "ZHENY", "ZHEKA", "IVANN", "IGORR", "ILDAR", "ILYAS", "KIRIL", "KOLYA", "KOSTY",
  "KONST", "LESHA", "LEONI", "MAKSI", "MAXIM", "MISHA", "MIKHA", "NIKIT", "NIKOL", "OLEGG", "PASHA",
  "PAVEL", "PETYA", "ROMAN", "ROMKA", "RUSLA", "SEMEN", "SERGE", "SEREG", "SERYO", "SLAVA", "STEPA",
  "TIMUR", "TIMOF", "TOLYA", "FEDOR", "FEDYA", "YURIY", "YAROS", "ALMIR", "AZAMA", "DAMIR", "RAMIL",
  "RAMIS", "RINAT", "MARAT", "RUSTA", "ELDAR", "ISLAM", "ILNUR", "AIDAR", "ALBER", "EDUAR", "GARIK",
  "ARMAN", "ALIBE", "ASLAN", "MURAT", "TAGIR", "SHAMI", "MAGOM", "EGORR", "ALINA", "ALISA", "ALENA",
  "ALYON", "ANAST", "NASTY", "ARINA", "VALYA", "VARYA", "VERON", "GALYA", "DARYA", "DASHA", "DIANA",
  "EKATE", "KATYA", "KATER", "ELENA", "ELIZA", "ZARIN", "ZLATA", "IRINA", "KARIN", "KRIST", "KSENI",
  "KSUSH", "LARIS", "LILYA", "LIANA", "LYUBA", "LYUDA", "MARIN", "MARIA", "MARIY", "MASHA", "MILAN",
  "NADYA", "NADEZ", "NATAS", "NATAL", "OKSAN", "OLESY", "POLIN", "POLYA", "RAISA", "REGIN", "SVETA",
  "SVETL", "SOFIA", "SOFYA", "SONYA", "TAMAR", "TANYA", "TATYA", "ULYAN", "YULIA", "YULYA", "ANNAA",
  "ALICE", "DAVID", "KEVIN", "JASON", "SARAH", "JAMES", "ANGEL",
  // Words.
  "HELLO", "ADMIN", "TESTS", "MONEY", "POKER", "LUCKY", "SUPER", "BONUS", "PROMO", "CASIN", "LOGIN",
  "ROBOT", "TELEG", "PRIVE", "PRIVT", "GAMER", "PLAYE", "WINNE", "ROYAL", "BEEFF", "FUGUU", "IRISS",
]);

function validateRoyalProjectAccountIdFormat(raw) {
  const normalized = normalizeRoyalProjectAccountId(raw);
  if (!normalized) {
    return { ok: false, error: "Введите ID с проекта." };
  }
  if (!ROYAL_PROJECT_ACCOUNT_ID_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "ID должен быть в формате # и 5 символов (буквы и цифры). Пример: #FJ0UW",
    };
  }

  const body = normalized.slice(1);
  if (/^[0-9]{5}$/.test(body)) {
    return { ok: false, error: "Такой ID не похож на настоящий. Откройте профиль на проекте." };
  }
  if (/^(.)\1{4}$/.test(body)) {
    return { ok: false, error: "Такой ID не похож на настоящий. Откройте профиль на проекте." };
  }
  if (isSequentialBody(body)) {
    return { ok: false, error: "Такой ID не похож на настоящий. Откройте профиль на проекте." };
  }
  // One or two distinct characters (AAAAB, ABABA): a real five-character id is
  // like that about three times in ten thousand.
  if (new Set(body).size <= 2 || isKeyboardRun(body) || NAME_AND_WORD_IDS.has(body)) {
    return { ok: false, error: "Такой ID не похож на настоящий. Откройте профиль на проекте." };
  }

  return { ok: true, normalized };
}

// When a Pokerdom account was created, read from the first eight characters of
// its id (see POKERDOM_OBJECT_ID_LENGTH); null when the id is not that shape.
function getPokerdomAccountCreatedAt(value, now = Date.now()) {
  const id = String(value || "").trim().toLowerCase();
  if (!new RegExp(`^[a-f0-9]{${POKERDOM_OBJECT_ID_LENGTH}}$`).test(id)) {
    return null;
  }
  const createdAt = parseInt(id.slice(0, 8), 16) * 1000;
  if (!Number.isFinite(createdAt) || createdAt < POKERDOM_EARLIEST_ACCOUNT_MS || createdAt > now + 24 * 60 * 60 * 1000) {
    return null;
  }
  return new Date(createdAt);
}

function isPokerdomAccountBeforeReferrals(value) {
  const createdAt = getPokerdomAccountCreatedAt(value);
  return Boolean(createdAt) && createdAt.getTime() < POKERDOM_REFERRALS_START_MS;
}

// A profile whose Pokerdom account predates the referrals: not a referral,
// nobody's referral, prizes halved. The same marks at the id step and in the
// backfill of ids saved before the rule (pokerdom-referral-backfill.js).
function buildPredatesReferralsPatch(at = new Date()) {
  return {
    referralVerified: false,
    selfReportedNonReferral: true,
    nonReferralMarkedAt: new Date(at).toISOString(),
    referralOwnerId: null,
    projectAccountPredatesReferrals: true,
  };
}

function validatePokerdomProjectAccountIdFormat(raw, now = Date.now()) {
  const normalized = normalizePokerdomProjectAccountId(raw);
  if (!normalized) {
    return { ok: false, error: "Введите ID пользователя с Pokerdom." };
  }
  if (normalized.length !== POKERDOM_OBJECT_ID_LENGTH) {
    return { ok: false, error: "Проверьте верность ID и попробуйте ещё раз." };
  }
  if (isFillerProjectAccountId(normalized) || !getPokerdomAccountCreatedAt(normalized, now)) {
    return { ok: false, error: "Такой ID не похож на настоящий. Откройте профиль на проекте." };
  }
  return { ok: true, normalized };
}

function validateLuckyBearProjectAccountIdFormat(raw) {
  const normalized = normalizeLuckyBearProjectAccountId(raw);
  if (!normalized) {
    return { ok: false, error: "Введите ID с LuckyBear." };
  }
  if (normalized.length < LUCKYBEAR_PROJECT_ACCOUNT_ID_MIN_LENGTH) {
    return { ok: false, error: "ID слишком короткий. Скопируйте его целиком из профиля." };
  }
  if (!LUCKYBEAR_PROJECT_ACCOUNT_ID_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "ID состоит только из цифр. Скопируйте UID в профиле на проекте.",
    };
  }
  if (isFillerProjectAccountId(normalized)) {
    return { ok: false, error: "Такой ID не похож на настоящий. Откройте профиль на проекте." };
  }
  return { ok: true, normalized };
}

function validateProjectAccountIdFormat(raw, kindOrProject = null) {
  const kind = resolveProjectAccountIdKind(kindOrProject, raw);
  if (kind === "luckybear") {
    return validateLuckyBearProjectAccountIdFormat(raw);
  }
  if (kind === "pokerdom") {
    return validatePokerdomProjectAccountIdFormat(raw);
  }
  return validateRoyalProjectAccountIdFormat(raw);
}

const CYRILLIC_TO_LATIN = {
  а: "A", б: "B", в: "V", г: "G", д: "D", е: "E", ё: "E", ж: "ZH", з: "Z", и: "I", й: "Y", к: "K",
  л: "L", м: "M", н: "N", о: "O", п: "P", р: "R", с: "S", т: "T", у: "U", ф: "F", х: "H", ц: "C",
  ч: "CH", ш: "SH", щ: "SCH", ъ: "", ы: "Y", ь: "", э: "E", ю: "YU", я: "YA", і: "I", ї: "YI", є: "E", ґ: "G",
};

function toLatinUpper(value) {
  return [...String(value || "").toLowerCase()]
    .map((ch) => (CYRILLIC_TO_LATIN[ch] !== undefined ? CYRILLIC_TO_LATIN[ch] : ch.toUpperCase()))
    .join("")
    .replace(/[^A-Z0-9]/g, "");
}

// The id someone types when they have not found theirs is often their own name:
// #SLAVA came from a Слава, #ALMIR from an Almir. Their Telegram name and
// username are compared with the id in Latin letters; a part shorter than four
// letters is too common to say anything.
function isProjectAccountIdOwnName(value, user) {
  const body = toLatinUpper(String(value || "").replace(/^#/, ""));
  if (body.length < 4) {
    return false;
  }
  const parts = [user?.first_name, user?.last_name, user?.username, user?.firstName, user?.lastName]
    .flatMap((part) => String(part || "").split(/[\s_.\-]+/))
    .map(toLatinUpper)
    .filter((part) => part.length >= 4);
  return parts.some((part) => part === body || part.startsWith(body) || body.startsWith(part) || part.includes(body));
}

// An id whose shape belongs to a different brand was typed to get past the
// step, not copied from the project: LuckyBear never issues #SLAVA, and no
// #XXXXX brand issues a hex string. Within the right shape a made-up id is
// indistinguishable from a real one - only the project itself can settle that -
// so this is the strongest signal available without asking the project.
function isProjectAccountIdShapeMismatched(project, value) {
  const raw = String(value || "").trim();
  if (!raw || !project) {
    return false;
  }
  return getProjectAccountIdKind(project) !== detectStoredProjectAccountIdKind(raw);
}

function buildProjectIdGuideSteps(project = null) {
  if (getProjectAccountIdKind(project) === "luckybear") {
    return LUCKYBEAR_PROJECT_ID_GUIDE_STEPS;
  }
  const steps =
    getProjectAccountIdKind(project) === "pokerdom"
      ? POKERDOM_PROJECT_ID_GUIDE_STEPS
      : ROYAL_PROJECT_ID_GUIDE_STEPS;
  return steps.map((step) => ({ ...step }));
}

// The field has no caption beside it any more ("Мой ID" was dropped so the field
// could take the whole width), so its placeholder says whose id goes in it.
// The label stays in the config: it is what a screen reader announces.
function buildProjectIdPlaceholder(project) {
  const name = String(project?.name || "").trim();
  return name ? `Введите свой ID с ${name} сюда` : "Введите свой ID сюда";
}

function buildProjectIdInputConfig(project = null) {
  const placeholder = buildProjectIdPlaceholder(project);
  if (getProjectAccountIdKind(project) === "luckybear") {
    return {
      kind: "luckybear",
      showHashPrefix: false,
      placeholder,
      // Room for "UID:" pasted along with the digits - a field capped at twelve
      // would cut the paste short instead of letting the label be stripped.
      maxlength: 24,
      inputMode: "numeric",
      label: "Мой ID",
    };
  }
  if (getProjectAccountIdKind(project) === "pokerdom") {
    return {
      kind: "pokerdom",
      showHashPrefix: false,
      placeholder,
      maxlength: POKERDOM_PROJECT_ACCOUNT_ID_MAX_LENGTH,
      label: "Мой ID",
    };
  }
  return {
    kind: "royal",
    showHashPrefix: true,
    placeholder,
    maxlength: 5,
    label: "Мой ID",
  };
}

function buildGlobalProjectAccountIdOwners(userProfiles, projectId) {
  const map = new Map();
  if (!projectId) {
    return map;
  }
  for (const [userId, node] of Object.entries(userProfiles?.users || {})) {
    const stored = node?.projects?.[projectId]?.projectAccountId;
    const accountId = normalizeProjectAccountId(stored, detectStoredProjectAccountIdKind(stored));
    if (!accountId) {
      continue;
    }
    if (!map.has(accountId)) {
      map.set(accountId, new Set());
    }
    map.get(accountId).add(String(userId));
  }
  return map;
}

function findProjectAccountIdOwner(
  userProfiles,
  projectId,
  accountId,
  excludeUserId = null,
  kindOrProject = null,
) {
  const kind = resolveProjectAccountIdKind(kindOrProject, accountId);
  const normalized = normalizeProjectAccountId(accountId, kind);
  if (!normalized || !projectId) {
    return null;
  }
  for (const [userId, node] of Object.entries(userProfiles?.users || {})) {
    if (excludeUserId && String(userId) === String(excludeUserId)) {
      continue;
    }
    const stored = node?.projects?.[projectId]?.projectAccountId;
    const otherId = normalizeProjectAccountId(stored, kind);
    if (otherId === normalized) {
      return String(userId);
    }
  }
  return null;
}

// With the project given, an id saved before today's checks that they would now
// refuse - #SLAVA, an e-mail, a link, another brand's id - does not count, and
// the step is asked again on the next join; nothing in the base is rewritten.
// "Я не реферал" on the id step leaves no id, only the completion time, and
// still counts. Without a project the answer is what it always was.
function hasCompletedProjectIdStep(profile, project = null) {
  const accountId = profile?.projectAccountId;
  if (accountId && project && !validateProjectAccountIdFormat(accountId, project).ok) {
    return false;
  }
  return Boolean(accountId) || Boolean(profile?.projectIdStepCompletedAt);
}

function joinCtxHasCompletedProjectIdStep(joinCtx, project = null) {
  if (!joinCtx) {
    return false;
  }
  if (hasCompletedProjectIdStep(joinCtx.directProfile, project)) {
    return true;
  }
  if (hasCompletedProjectIdStep(joinCtx.effectiveProfile, project)) {
    return true;
  }
  return hasCompletedProjectIdStep(joinCtx.siblingSource?.projectData, project);
}

function isProjectRegistrationComplete(profile, draw, project = null) {
  if (!profile) {
    return false;
  }
  const needsWallet = draw?.askWalletOnJoin !== false;
  if (drawAsksProjectIdOnJoin(draw)) {
    if (!hasCompletedProjectIdStep(profile, project)) {
      return false;
    }
    return !needsWallet || Boolean(profile.trc20Address);
  }
  const hasRefStatus = Boolean(profile.referralVerified || profile.selfReportedNonReferral);
  return hasRefStatus && (!needsWallet || profile.trc20Address);
}

function listParticipantsOnIp(draw, userId, ipHash, getDrawParticipantMeta) {
  return (draw.participantIds || []).filter((participantId) => {
    if (String(participantId) === String(userId)) {
      return false;
    }
    const meta = getDrawParticipantMeta(draw, participantId);
    return meta?.ipHash === ipHash;
  });
}

function evaluateProjectAccountIdFraud(draw, winnerId, userProfiles, signals, deps) {
  if (!draw?.projectId) {
    return { shouldFlag: false };
  }

  const { getUserProfileBundle } = deps;
  const { projectData } = getUserProfileBundle(userProfiles, winnerId, draw.projectId);
  const stored = projectData?.projectAccountId;
  const accountId = normalizeProjectAccountId(stored, detectStoredProjectAccountIdKind(stored));
  if (!accountId) {
    return { shouldFlag: false };
  }

  const globalOwners =
    signals.globalProjectAccountIdOwners ||
    buildGlobalProjectAccountIdOwners(userProfiles, draw.projectId);
  const owners = globalOwners.get(accountId);
  if (owners && owners.size > 1) {
    return {
      shouldFlag: true,
      reason: "Один ID проекта у нескольких аккаунтов",
      linkedUserIds: [...owners].filter((id) => String(id) !== String(winnerId)),
    };
  }

  if (projectData?.projectAccountIdDuplicate) {
    return {
      shouldFlag: true,
      reason: "ID проекта уже использовался другим участником",
    };
  }

  return { shouldFlag: false };
}

function evaluateIpManyProjectIdsFraud(draw, winnerId, userProfiles, signals, deps) {
  const { getDrawParticipantMeta, getUserProfileBundle } = deps;
  const participantMeta = getDrawParticipantMeta(draw, winnerId);
  const ipHash = participantMeta?.ipHash;
  if (!ipHash || !draw?.projectId) {
    return { shouldFlag: false };
  }

  const linkedByIp = listParticipantsOnIp(draw, winnerId, ipHash, getDrawParticipantMeta);
  const accountIds = new Set();
  for (const participantId of [winnerId, ...linkedByIp]) {
    const { projectData } = getUserProfileBundle(userProfiles, participantId, draw.projectId);
    const stored = projectData?.projectAccountId;
    const accountId = normalizeProjectAccountId(stored, detectStoredProjectAccountIdKind(stored));
    if (accountId) {
      accountIds.add(accountId);
    }
  }

  if (accountIds.size >= 2 && linkedByIp.length > 0) {
    return {
      shouldFlag: true,
      reason: `С одного IP разные ID проекта (${accountIds.size})`,
      linkedUserIds: linkedByIp,
    };
  }

  const ipCount = signals.byIp.get(ipHash) || 0;
  if (ipCount >= 3 && accountIds.size >= 2) {
    return {
      shouldFlag: true,
      reason: `С одного IP несколько ID проекта (${accountIds.size})`,
      linkedUserIds: linkedByIp,
    };
  }

  return { shouldFlag: false };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function projectAccountIdVerifyDelayMs() {
  return 2000 + Math.floor(Math.random() * 2000);
}

module.exports = {
  isFillerProjectAccountId,
  isProjectAccountIdOwnName,
  getPokerdomAccountCreatedAt,
  isPokerdomAccountBeforeReferrals,
  buildPredatesReferralsPatch,
  POKERDOM_REFERRALS_START_MS,
  drawAsksProjectIdOnJoin,
  getProjectAccountIdKind,
  normalizeProjectAccountId,
  validateProjectAccountIdFormat,
  detectStoredProjectAccountIdKind,
  isProjectAccountIdShapeMismatched,
  buildProjectIdGuideSteps,
  buildProjectIdInputConfig,
  buildGlobalProjectAccountIdOwners,
  findProjectAccountIdOwner,
  hasCompletedProjectIdStep,
  joinCtxHasCompletedProjectIdStep,
  isProjectRegistrationComplete,
  evaluateProjectAccountIdFraud,
  evaluateIpManyProjectIdsFraud,
  projectAccountIdVerifyDelayMs,
  sleep,
};
