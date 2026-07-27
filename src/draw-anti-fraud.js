const IP_FRAUD_MIN_CLUSTER_SIZE = 3;
const IP_FRAUD_SHARE_RATIO = 0.1;

function defaultNormalizeWalletAddress(value) {
  return String(value || "").trim().toUpperCase();
}

/** Профильный TRC20 + адрес только для антифрода (после победы без кошелька на join). */
function listProjectWalletAddresses(projectData, normalizeWalletAddress = defaultNormalizeWalletAddress) {
  const out = [];
  for (const raw of [projectData?.trc20Address, projectData?.antifraudTrc20Address]) {
    const wallet = normalizeWalletAddress(raw);
    if (wallet && !out.includes(wallet)) {
      out.push(wallet);
    }
  }
  return out;
}

function buildGlobalWalletOwners(userProfiles, normalizeWalletAddress = defaultNormalizeWalletAddress) {
  const map = new Map();
  for (const [userId, node] of Object.entries(userProfiles?.users || {})) {
    for (const projectData of Object.values(node?.projects || {})) {
      for (const wallet of listProjectWalletAddresses(projectData, normalizeWalletAddress)) {
        if (!map.has(wallet)) {
          map.set(wallet, new Set());
        }
        map.get(wallet).add(String(userId));
      }
    }
  }
  return map;
}

function hasNormalParticipantProfile(projectData, draw) {
  if (!draw?.projectId) {
    return true;
  }
  const wallet =
    String(projectData?.trc20Address || "").trim() ||
    String(projectData?.antifraudTrc20Address || "").trim();
  const needsProjectId = draw?.askProjectIdOnJoin === true;
  const completedRegistration = needsProjectId
    ? Boolean(projectData?.projectAccountId)
    : Boolean(projectData?.referralVerified || projectData?.selfReportedNonReferral);
  return Boolean(wallet && completedRegistration);
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

function evaluateIpFraud(draw, userId, userProfiles, signals, deps) {
  const { getDrawParticipantMeta, getUserProfileBundle, normalizeWalletAddress } = deps;
  const participantMeta = getDrawParticipantMeta(draw, userId);
  const ipHash = participantMeta?.ipHash;
  if (!ipHash) {
    return { shouldFlag: false };
  }

  const ipCount = signals.byIp.get(ipHash) || 0;
  if (ipCount <= 1) {
    return { shouldFlag: false };
  }

  const linkedByIp = listParticipantsOnIp(draw, userId, ipHash, getDrawParticipantMeta);
  const { projectData } = getUserProfileBundle(userProfiles, userId, draw.projectId);
  const wallets = listProjectWalletAddresses(projectData, normalizeWalletAddress);
  const totalParticipants = draw.participantIds?.length || 0;

  if (wallets.length > 0) {
    const walletSet = new Set(wallets);
    const linkedByIpAndWallet = linkedByIp.filter((participantId) => {
      const { projectData: otherProjectData } = getUserProfileBundle(
        userProfiles,
        participantId,
        draw.projectId,
      );
      return listProjectWalletAddresses(otherProjectData, normalizeWalletAddress).some((wallet) =>
        walletSet.has(wallet),
      );
    });
    if (linkedByIpAndWallet.length > 0) {
      return {
        shouldFlag: true,
        trigger: "ip_wallet",
        linkedUserIds: linkedByIpAndWallet,
        reason: "Один IP и общий TRC-20 с другими участниками",
      };
    }
  }

  if (
    draw.projectId &&
    ipCount >= IP_FRAUD_MIN_CLUSTER_SIZE &&
    !hasNormalParticipantProfile(projectData, draw)
  ) {
    return {
      shouldFlag: true,
      trigger: "ip_weak_profile",
      linkedUserIds: linkedByIp,
      reason: `Один IP у ${ipCount} участников, профиль не завершён`,
    };
  }

  if (totalParticipants > 0 && ipCount / totalParticipants > IP_FRAUD_SHARE_RATIO) {
    const sharePercent = ((ipCount / totalParticipants) * 100).toFixed(1).replace(".", ",");
    return {
      shouldFlag: true,
      trigger: "ip_share_ratio",
      linkedUserIds: linkedByIp,
      reason: `Один IP у ${ipCount} из ${totalParticipants} участников (${sharePercent}%)`,
    };
  }

  return { shouldFlag: false };
}

module.exports = {
  IP_FRAUD_MIN_CLUSTER_SIZE,
  IP_FRAUD_SHARE_RATIO,
  listProjectWalletAddresses,
  buildGlobalWalletOwners,
  hasNormalParticipantProfile,
  evaluateIpFraud,
};
