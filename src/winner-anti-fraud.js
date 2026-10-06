// The anti-fraud verdict on a winner: the labels the panel shows, and whether
// the prize is zeroed. Taken out of index.js so it can be run on its own -
// by tests and by the owner's dry runs on the real base - the same code the
// bot runs, not a copy of it.
//
// The rules themselves live in draw-anti-fraud.js and project-account-id.js;
// here they are put together. What needs every draw or the wallet checks
// (devices, project IDs everywhere, the blockchain) comes in as functions,
// so the bot can keep them memoised and a dry run can hand in its own.
const {
  evaluateIpFraud,
  listProjectWalletAddresses,
  buildGlobalWalletOwners,
  buildGlobalShotOwners,
  sharesProfileShot,
  sharesDevice,
  sharesProjectAccountId,
  sharesWallet,
} = require("./draw-anti-fraud");
const {
  normalizeProjectAccountId,
  buildGlobalProjectAccountIdOwners,
  evaluateProjectAccountIdFraud,
  evaluateIpManyProjectIdsFraud,
} = require("./project-account-id");

function normalizeWalletAddress(value) {
  return String(value || "").trim().toUpperCase();
}

function getDrawParticipantMeta(draw, userId) {
  if (!draw?.participantMeta) {
    return null;
  }
  return draw.participantMeta[String(userId)] || null;
}

function getUserProfileBundle(userProfiles, userId, projectId) {
  const userNode = userProfiles.users?.[String(userId)] || {};
  const meta = userNode.meta || {};
  const projectData = userNode.projects?.[projectId] || {};
  return { meta, projectData };
}

function getWinnerEffectiveWallets(projectData, notifyInfo = null) {
  const wallets = listProjectWalletAddresses(projectData, normalizeWalletAddress);
  const notifyWallet = normalizeWalletAddress(notifyInfo?.trc20Address);
  if (notifyWallet && !wallets.includes(notifyWallet)) {
    wallets.push(notifyWallet);
  }
  return wallets;
}

function collectDrawParticipantSignals(draw, userProfiles, globalWalletOwners = null, globalShotOwners = null) {
  const byIp = new Map();
  const byWallet = new Map();
  const byProjectAccountId = new Map();

  for (const participantId of draw.participantIds || []) {
    const participantMeta = getDrawParticipantMeta(draw, participantId);
    if (participantMeta?.ipHash) {
      byIp.set(participantMeta.ipHash, (byIp.get(participantMeta.ipHash) || 0) + 1);
    }

    const { projectData } = getUserProfileBundle(userProfiles, participantId, draw.projectId);
    const wallets = listProjectWalletAddresses(projectData, normalizeWalletAddress);
    const notifyWallet = normalizeWalletAddress(draw.winnerNotifications?.[String(participantId)]?.trc20Address);
    if (notifyWallet && !wallets.includes(notifyWallet)) {
      wallets.push(notifyWallet);
    }
    for (const wallet of wallets) {
      byWallet.set(wallet, (byWallet.get(wallet) || 0) + 1);
    }

    const accountId = normalizeProjectAccountId(projectData?.projectAccountId);
    if (accountId) {
      byProjectAccountId.set(accountId, (byProjectAccountId.get(accountId) || 0) + 1);
    }
  }

  return {
    byIp,
    byWallet,
    byProjectAccountId,
    globalWalletOwners: globalWalletOwners || buildGlobalWalletOwners(userProfiles, normalizeWalletAddress),
    globalShotOwners: globalShotOwners || buildGlobalShotOwners(userProfiles),
    globalProjectAccountIdOwners: draw.projectId && buildGlobalProjectAccountIdOwners(userProfiles, draw.projectId),
  };
}

/**
 * getWalletIndex(profiles)     -> buildWalletIndex(profiles, every draw)
 * getDeviceOwners()             -> buildDeviceOwners(every draw)
 * getAccountIdIndex(profiles)   -> buildAccountIdIndex(profiles, ...)
 * getChainLinkedUsers()         -> Set of user ids tied by a small wallet
 * exemptUserIds                 -> the owner's own and test accounts
 */
function createWinnerAntiFraud({
  getWalletIndex = () => null,
  getDeviceOwners = () => null,
  getAccountIdIndex = () => null,
  getChainLinkedUsers = () => new Set(),
  exemptUserIds = new Set(),
} = {}) {
  // With reasons, for the dry runs: which rule said what.
  function explain(draw, winnerId, userProfiles, precomputedSignals = null, notifyInfo = null) {
    if (exemptUserIds.has(String(winnerId))) {
      return { labels: [], hasFraudFlag: false, reasons: ["исключение владельца"] };
    }
    const labels = [];
    const reasons = [];
    const flag = (label, reason) => {
      labels.push(label);
      reasons.push(reason);
    };
    const signals = precomputedSignals || collectDrawParticipantSignals(draw, userProfiles);
    const globalWalletOwners = signals.globalWalletOwners || buildGlobalWalletOwners(userProfiles, normalizeWalletAddress);

    const ipFraud = evaluateIpFraud(draw, winnerId, userProfiles, signals, {
      getDrawParticipantMeta,
      getUserProfileBundle,
      normalizeWalletAddress,
    });
    if (ipFraud.shouldFlag) {
      flag("Бот по IP", ipFraud.reason || "IP");
    }

    const { projectData } = getUserProfileBundle(userProfiles, winnerId, draw.projectId);
    const wallets = getWinnerEffectiveWallets(projectData, notifyInfo);
    const sharedWallet = wallets.find(
      (wallet) => (signals.byWallet.get(wallet) || 0) > 1 || (globalWalletOwners.get(wallet)?.size || 0) > 1,
    );
    // Any address this person ever gave, on any project, shared with someone.
    if (sharedWallet || sharesWallet(winnerId, getWalletIndex(userProfiles))) {
      flag("Мультиаккаунт", "общий кошелёк");
    }

    // The same profile screenshot as someone else's: the whole cluster.
    const globalShotOwners = signals.globalShotOwners || buildGlobalShotOwners(userProfiles);
    if (sharesProfileShot(userProfiles, winnerId, globalShotOwners)) {
      flag("Мультиаккаунт", "один скрин профиля");
    }

    // One phone behind several accounts: the same device, or the same
    // fingerprint from the same network (device-signals.js).
    if (sharesDevice(winnerId, getDeviceOwners())) {
      flag("Мультиаккаунт", "одно устройство");
    }

    // The same project ID as someone else, or on two brands: everywhere.
    if (sharesProjectAccountId(winnerId, getAccountIdIndex(userProfiles))) {
      flag("Мультиаккаунт", "общий ID проекта");
    }

    // A small wallet - a person's, not a cashier or an exchange - behind the
    // addresses of several of ours, or money between their addresses (link-graph.js).
    if (getChainLinkedUsers().has(String(winnerId))) {
      flag("Мультиаккаунт", "общий кошелёк в блокчейне");
    }

    const projectIdFraud = evaluateProjectAccountIdFraud(draw, winnerId, userProfiles, signals, { getUserProfileBundle });
    if (projectIdFraud.shouldFlag) {
      flag("Мультиаккаунт", projectIdFraud.reason || "ID проекта");
    }

    const ipProjectIdsFraud = evaluateIpManyProjectIdsFraud(draw, winnerId, userProfiles, signals, {
      getDrawParticipantMeta,
      getUserProfileBundle,
    });
    if (ipProjectIdsFraud.shouldFlag) {
      flag("Бот по IP", ipProjectIdsFraud.reason || "много ID с одного IP");
    }

    if (notifyInfo?.channelSubscribed === false) {
      flag("Не подписан", "не подписан на канал");
    }

    const uniqueLabels = [...new Set(labels)];
    return { labels: uniqueLabels, hasFraudFlag: uniqueLabels.length > 0, reasons };
  }

  function evaluate(draw, winnerId, userProfiles, precomputedSignals = null, notifyInfo = null) {
    const { labels, hasFraudFlag } = explain(draw, winnerId, userProfiles, precomputedSignals, notifyInfo);
    return { labels, hasFraudFlag };
  }

  return { evaluate, explain };
}

module.exports = {
  normalizeWalletAddress,
  getDrawParticipantMeta,
  getUserProfileBundle,
  getWinnerEffectiveWallets,
  collectDrawParticipantSignals,
  createWinnerAntiFraud,
};
