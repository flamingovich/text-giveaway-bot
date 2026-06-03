const { readData, readUserProjectProfiles, readProjects } = require("./storage");
const { buildUserAntiFraudSupportContext } = require("./admin-user-stats");

function getUserProfileBundle(userProfiles, userId, projectId) {
  const userNode = userProfiles.users?.[String(userId)] || {};
  return {
    meta: userNode.meta || {},
    projectData: userNode.projects?.[projectId] || {},
  };
}

function normalizeWalletAddress(value) {
  return String(value || "").trim().toUpperCase();
}

function getDrawParticipantMeta(draw, userId) {
  if (!draw?.participantMeta) {
    return null;
  }
  return draw.participantMeta[String(userId)] || null;
}

function collectDrawParticipantSignals(draw, userProfiles) {
  const byIp = new Map();
  const byDevice = new Map();
  const byWallet = new Map();

  for (const participantId of draw.participantIds || []) {
    const participantMeta = getDrawParticipantMeta(draw, participantId);
    if (participantMeta?.ipHash) {
      byIp.set(participantMeta.ipHash, (byIp.get(participantMeta.ipHash) || 0) + 1);
    }
    if (participantMeta?.deviceHash) {
      byDevice.set(participantMeta.deviceHash, (byDevice.get(participantMeta.deviceHash) || 0) + 1);
    }

    const { projectData } = getUserProfileBundle(userProfiles, participantId, draw.projectId);
    const wallet = normalizeWalletAddress(projectData?.trc20Address);
    if (wallet) {
      byWallet.set(wallet, (byWallet.get(wallet) || 0) + 1);
    }
  }

  return { byIp, byDevice, byWallet };
}

function getWinnerAntiFraud(draw, winnerId, userProfiles, signals, notifyInfo) {
  const labels = [];
  const participantMeta = getDrawParticipantMeta(draw, winnerId);

  if (participantMeta?.ipHash && (signals.byIp.get(participantMeta.ipHash) || 0) > 1) {
    labels.push("Бот по IP");
  }
  if (participantMeta?.deviceHash && (signals.byDevice.get(participantMeta.deviceHash) || 0) > 1) {
    labels.push("Бот по девайсу");
  }

  const { projectData } = getUserProfileBundle(userProfiles, winnerId, draw.projectId);
  const wallet = normalizeWalletAddress(projectData?.trc20Address);
  if (wallet && (signals.byWallet.get(wallet) || 0) > 1) {
    labels.push("Мультиаккаунт");
  }
  if (notifyInfo?.channelSubscribed === false) {
    labels.push("Не подписан");
  }

  return {
    labels,
    hasFraudFlag: labels.length > 0,
  };
}

function labelForUser(userId, userProfiles) {
  const meta = userProfiles.users?.[String(userId)]?.meta || {};
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  if (meta.username) {
    return `@${meta.username}`;
  }
  return `ID ${userId}`;
}

const antifraudDeps = {
  readData,
  readProjects,
  getUserProfileBundle,
  getDrawParticipantMeta,
  collectDrawParticipantSignals,
  getWinnerAntiFraud,
  normalizeWalletAddress,
};

function buildSupportAntiFraudContextBlock(userId) {
  const userKey = String(userId || "").trim();
  if (!userKey) {
    return "";
  }

  try {
    const profiles = readUserProjectProfiles();
    return buildUserAntiFraudSupportContext(antifraudDeps, userKey, profiles, (id) =>
      labelForUser(id, profiles),
    );
  } catch (error) {
    console.warn("[support-antifraud] context build failed:", error.message);
    return "";
  }
}

module.exports = {
  buildSupportAntiFraudContextBlock,
};
