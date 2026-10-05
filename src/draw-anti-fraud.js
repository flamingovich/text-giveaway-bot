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

// One picture sent by several people: the same file down to the byte, so one
// person behind several accounts, or a screenshot passed around. The owner's
// rule: everyone sharing it is one cluster of multi-accounts - they still take
// part, their prize is zero (October 2026).
function listProfileShotHashes(userNode) {
  const out = [];
  for (const projectData of Object.values(userNode?.projects || {})) {
    const sha = projectData?.profileShot?.sha256;
    if (sha && !out.includes(sha)) {
      out.push(sha);
    }
  }
  return out;
}

function buildGlobalShotOwners(userProfiles) {
  const map = new Map();
  for (const [userId, node] of Object.entries(userProfiles?.users || {})) {
    for (const sha of listProfileShotHashes(node)) {
      if (!map.has(sha)) {
        map.set(sha, new Set());
      }
      map.get(sha).add(String(userId));
    }
  }
  return map;
}

function sharesProfileShot(userProfiles, userId, globalShotOwners) {
  return listProfileShotHashes(userProfiles?.users?.[String(userId)]).some(
    (sha) => (globalShotOwners.get(sha)?.size || 0) > 1,
  );
}

// One phone behind several accounts (device-signals.js): the same device id,
// or the same fingerprint from the same network. The owner's rule: zeroed
// automatically, like a shared wallet (October 2026). A fingerprint shared by
// more than five people on one network is a run of identical phones on a
// public Wi-Fi, not one person.
const MAX_FPNET_PEOPLE = 5;

function buildDeviceOwners(draws) {
  const byDevice = new Map();
  const byFpNet = new Map();
  const add = (map, key, userId) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(userId));
  };
  const devicesOf = new Map();
  const fpNetsOf = new Map();
  for (const draw of draws || []) {
    for (const [userId, meta] of Object.entries(draw?.participantMeta || {})) {
      if (meta?.deviceHash) {
        add(byDevice, meta.deviceHash, userId);
        add(devicesOf, String(userId), meta.deviceHash);
      }
      if (meta?.fpHash && meta?.ipHash) {
        const key = `${meta.fpHash}|${meta.ipHash}`;
        add(byFpNet, key, userId);
        add(fpNetsOf, String(userId), key);
      }
    }
  }
  return { byDevice, byFpNet, devicesOf, fpNetsOf };
}

function sharesDevice(userId, owners) {
  const key = String(userId);
  for (const device of owners?.devicesOf?.get(key) || []) {
    if ((owners.byDevice.get(device)?.size || 0) > 1) return true;
  }
  for (const fpNet of owners?.fpNetsOf?.get(key) || []) {
    const size = owners.byFpNet.get(fpNet)?.size || 0;
    if (size > 1 && size <= MAX_FPNET_PEOPLE) return true;
  }
  return false;
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

  // The share rule needs a real cluster too. On its own, two people behind one
  // home Wi-Fi in a draw of fifteen were over 10% - and whichever of them won
  // lost the prize as a "bot".
  if (
    totalParticipants > 0 &&
    ipCount >= IP_FRAUD_MIN_CLUSTER_SIZE &&
    ipCount / totalParticipants > IP_FRAUD_SHARE_RATIO
  ) {
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
  listProfileShotHashes,
  buildGlobalShotOwners,
  sharesProfileShot,
  buildDeviceOwners,
  sharesDevice,
  hasNormalParticipantProfile,
  evaluateIpFraud,
};
