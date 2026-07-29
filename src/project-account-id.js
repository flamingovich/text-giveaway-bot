const { isPokerdomProject } = require("./deposit-guide");

const ROYAL_PROJECT_ACCOUNT_ID_PATTERN = /^#[A-Z0-9]{5}$/;
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
  if (kindOrProject === "pokerdom" || kindOrProject === "royal") {
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

function normalizeProjectAccountId(raw, kindOrProject = null) {
  const kind = resolveProjectAccountIdKind(kindOrProject, raw);
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

  return { ok: true, normalized };
}

function validatePokerdomProjectAccountIdFormat(raw) {
  const normalized = normalizePokerdomProjectAccountId(raw);
  if (!normalized) {
    return { ok: false, error: "Введите ID пользователя с Pokerdom." };
  }
  if (normalized.length < POKERDOM_PROJECT_ACCOUNT_ID_MIN_LENGTH) {
    return { ok: false, error: "Проверьте верность ID и попробуйте ещё раз." };
  }
  return { ok: true, normalized };
}

function validateProjectAccountIdFormat(raw, kindOrProject = null) {
  const kind = resolveProjectAccountIdKind(kindOrProject, raw);
  if (kind === "pokerdom") {
    return validatePokerdomProjectAccountIdFormat(raw);
  }
  return validateRoyalProjectAccountIdFormat(raw);
}

function buildProjectIdGuideSteps(project = null) {
  const steps =
    getProjectAccountIdKind(project) === "pokerdom"
      ? POKERDOM_PROJECT_ID_GUIDE_STEPS
      : ROYAL_PROJECT_ID_GUIDE_STEPS;
  return steps.map((step) => ({ ...step }));
}

function buildProjectIdInputConfig(project = null) {
  if (getProjectAccountIdKind(project) === "pokerdom") {
    return {
      kind: "pokerdom",
      showHashPrefix: false,
      placeholder: "Введите ID сюда",
      maxlength: POKERDOM_PROJECT_ACCOUNT_ID_MAX_LENGTH,
      label: "ID пользователя",
    };
  }
  return {
    kind: "royal",
    showHashPrefix: true,
    placeholder: "FJ0UW",
    maxlength: 5,
    label: "ID на проекте",
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

function hasCompletedProjectIdStep(profile) {
  return Boolean(profile?.projectAccountId) || Boolean(profile?.projectIdStepCompletedAt);
}

function joinCtxHasCompletedProjectIdStep(joinCtx) {
  if (!joinCtx) {
    return false;
  }
  if (hasCompletedProjectIdStep(joinCtx.directProfile)) {
    return true;
  }
  if (hasCompletedProjectIdStep(joinCtx.effectiveProfile)) {
    return true;
  }
  return hasCompletedProjectIdStep(joinCtx.siblingSource?.projectData);
}

function isProjectRegistrationComplete(profile, draw) {
  if (!profile) {
    return false;
  }
  const needsWallet = draw?.askWalletOnJoin !== false;
  if (drawAsksProjectIdOnJoin(draw)) {
    if (!hasCompletedProjectIdStep(profile)) {
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
  drawAsksProjectIdOnJoin,
  getProjectAccountIdKind,
  normalizeProjectAccountId,
  validateProjectAccountIdFormat,
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
