const IP_FRAUD_MIN_CLUSTER_SIZE = 3;
const IP_FRAUD_SHARE_RATIO = 0.1;

function hasNormalParticipantProfile(projectData, draw) {
  if (!draw?.projectId) {
    return true;
  }
  const wallet = String(projectData?.trc20Address || "").trim();
  const completedRegistration = Boolean(
    projectData?.referralVerified || projectData?.selfReportedNonReferral,
  );
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
  const wallet = normalizeWalletAddress(projectData?.trc20Address);
  const totalParticipants = draw.participantIds?.length || 0;

  if (wallet) {
    const linkedByIpAndWallet = linkedByIp.filter((participantId) => {
      const { projectData: otherProjectData } = getUserProfileBundle(
        userProfiles,
        participantId,
        draw.projectId,
      );
      return normalizeWalletAddress(otherProjectData?.trc20Address) === wallet;
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
  hasNormalParticipantProfile,
  evaluateIpFraud,
};
