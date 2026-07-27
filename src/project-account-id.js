const PROJECT_ACCOUNT_ID_PATTERN = /^#[A-Z0-9]{5}$/;

const SEQUENCE_ALPHABETS = [
  "0123456789",
  "9876543210",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "ZYXWVUTSRQPONMLKJIHGFEDCBA",
];

const PROJECT_ID_GUIDE_STEPS = [
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

function drawAsksProjectIdOnJoin(draw) {
  return Boolean(draw?.projectId) && draw?.askProjectIdOnJoin === true;
}

function normalizeProjectAccountId(raw) {
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

function validateProjectAccountIdFormat(raw) {
  const normalized = normalizeProjectAccountId(raw);
  if (!normalized) {
    return { ok: false, error: "Введите ID с проекта." };
  }
  if (!PROJECT_ACCOUNT_ID_PATTERN.test(normalized)) {
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

function buildProjectIdGuideSteps() {
  return PROJECT_ID_GUIDE_STEPS.map((step) => ({ ...step }));
}

function buildGlobalProjectAccountIdOwners(userProfiles, projectId) {
  const map = new Map();
  if (!projectId) {
    return map;
  }
  for (const [userId, node] of Object.entries(userProfiles?.users || {})) {
    const accountId = normalizeProjectAccountId(node?.projects?.[projectId]?.projectAccountId);
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

function findProjectAccountIdOwner(userProfiles, projectId, accountId, excludeUserId = null) {
  const normalized = normalizeProjectAccountId(accountId);
  if (!normalized || !projectId) {
    return null;
  }
  for (const [userId, node] of Object.entries(userProfiles?.users || {})) {
    if (excludeUserId && String(userId) === String(excludeUserId)) {
      continue;
    }
    const otherId = normalizeProjectAccountId(node?.projects?.[projectId]?.projectAccountId);
    if (otherId === normalized) {
      return String(userId);
    }
  }
  return null;
}

function hasCompletedProjectIdStep(profile) {
  return Boolean(profile?.projectAccountId) || Boolean(profile?.selfReportedNonReferral);
}

function isProjectRegistrationComplete(profile, draw) {
  if (!profile) {
    return false;
  }
  const needsWallet = draw?.askWalletOnJoin !== false;
  if (drawAsksProjectIdOnJoin(draw)) {
    if (profile.selfReportedNonReferral) {
      return !needsWallet || Boolean(profile.trc20Address);
    }
    return Boolean(profile.projectAccountId) && (!needsWallet || profile.trc20Address);
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
  const accountId = normalizeProjectAccountId(projectData?.projectAccountId);
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
    const accountId = normalizeProjectAccountId(projectData?.projectAccountId);
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
  normalizeProjectAccountId,
  validateProjectAccountIdFormat,
  buildProjectIdGuideSteps,
  buildGlobalProjectAccountIdOwners,
  findProjectAccountIdOwner,
  hasCompletedProjectIdStep,
  isProjectRegistrationComplete,
  evaluateProjectAccountIdFraud,
  evaluateIpManyProjectIdsFraud,
  projectAccountIdVerifyDelayMs,
  sleep,
};
