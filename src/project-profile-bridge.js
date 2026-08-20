const {
  isProjectRegistrationComplete,
  drawAsksProjectIdOnJoin,
  hasCompletedProjectIdStep,
} = require("./project-account-id");
const { buildBrandProjectId, isPokerdomProject } = require("./deposit-guide");

/** Старые projectId Pokerdom до brand_* (prod, май–июнь 2026). */
const LEGACY_POKERDOM_PROJECT_OWNERS = {
  project_1780118192579_6053: 7946967720,
  project_1780125871033_6180: 8233307353,
  project_1780166696557_9812: 8808012300,
  project_1780238688348_3660: 385791526,
  project_1780314690278_1544: 1109454069,
};

const POKERDOM_PROFILE_COPY_FIELDS = [
  "trc20Address",
  "depositNetwork",
  "referralVerified",
  "selfReportedNonReferral",
  "referralOwnerId",
  "projectAccountId",
  "projectIdStepCompletedAt",
  "antifraudTrc20Address",
  "verifiedBy",
  "walletTxCheckedAt",
  "walletTxCount",
  "walletHasTransactions",
  "nonReferralReason",
  "crossOrganizerNonReferral",
];

function normalizeProjectBrandName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getDrawOwnerId(draw) {
  if (draw?.ownerId != null) {
    return Number(draw.ownerId);
  }
  if (draw?.createdBy != null) {
    return Number(draw.createdBy);
  }
  return null;
}

function listUserBrandProjectEntries(userId, brandName, readUserProjectProfiles, readProjects) {
  const normalized = normalizeProjectBrandName(brandName);
  if (!normalized) {
    return [];
  }

  const profiles = readUserProjectProfiles();
  const userNode = profiles.users?.[String(userId)];
  if (!userNode?.projects) {
    return [];
  }

  const recordById = new Map((readProjects().projects || []).map((project) => [project.id, project]));

  return Object.entries(userNode.projects)
    .map(([projectId, projectData]) => ({
      projectId,
      projectData,
      project: recordById.get(projectId) || null,
    }))
    .filter(
      (entry) => entry.project && normalizeProjectBrandName(entry.project.name) === normalized,
    );
}

function pickPrimaryBrandEntry(entries, excludeProjectId = null) {
  const filtered = excludeProjectId
    ? entries.filter((entry) => entry.projectId !== excludeProjectId)
    : entries;

  return (
    filtered.find((entry) => entry.projectData?.trc20Address) ||
    filtered.find(
      (entry) => entry.projectData?.referralVerified || entry.projectData?.selfReportedNonReferral,
    ) ||
    filtered[0] ||
    null
  );
}

function inferReferralOwnerId(userId, projectId, projectData, readData) {
  if (projectData?.referralOwnerId != null) {
    return Number(projectData.referralOwnerId);
  }
  if (!projectData?.referralVerified) {
    return null;
  }

  const draws = (readData().draws || [])
    .filter(
      (draw) =>
        draw.projectId === projectId &&
        (draw.participantIds || []).some((id) => String(id) === String(userId)),
    )
    .sort(
      (left, right) =>
        new Date(left.createdAt || left.publishAt || 0) -
        new Date(right.createdAt || right.publishAt || 0),
    );

  for (const draw of draws) {
    const ownerId = getDrawOwnerId(draw);
    if (ownerId) {
      return ownerId;
    }
  }

  return null;
}

function resolveReferralOwnerForBrand(userId, brandEntries, readData) {
  for (const entry of brandEntries) {
    if (!entry.projectData?.referralVerified) {
      continue;
    }
    const ownerId = inferReferralOwnerId(userId, entry.projectId, entry.projectData, readData);
    if (ownerId) {
      return ownerId;
    }
  }

  for (const entry of brandEntries) {
    const ownerId = inferReferralOwnerId(userId, entry.projectId, entry.projectData, readData);
    if (ownerId) {
      return ownerId;
    }
  }

  return null;
}

function resolveJoinProjectContext(userId, draw, deps) {
  const {
    getUserProjectProfile,
    readUserProjectProfiles,
    readProjects,
    readData,
    getProjectById,
  } = deps;

  const projectId = draw?.projectId || null;
  const project = projectId ? getProjectById(projectId) : null;
  const brandName = project?.name || "";
  const directProfile = projectId ? getUserProjectProfile(userId, projectId) : null;
  const drawOwnerId = getDrawOwnerId(draw);

  if (!projectId || !brandName) {
    const canSkipRegistration = isProjectRegistrationComplete(directProfile, draw);

    return {
      directProfile,
      effectiveProfile: directProfile,
      canSkipRegistration,
      referralOwnerId:
        directProfile?.referralOwnerId != null ? Number(directProfile.referralOwnerId) : null,
      drawOwnerId,
      isCrossOrganizerNonReferral: false,
      siblingSource: null,
      brandName,
    };
  }

  const brandEntries = listUserBrandProjectEntries(
    userId,
    brandName,
    readUserProjectProfiles,
    readProjects,
  );
  const sibling = pickPrimaryBrandEntry(brandEntries, projectId);
  const referralOwnerId = resolveReferralOwnerForBrand(userId, brandEntries, readData);
  const isCrossOrganizerNonReferral = Boolean(
    referralOwnerId && drawOwnerId && referralOwnerId !== drawOwnerId,
  );

  const needsWallet = draw?.askWalletOnJoin !== false;
  const needsProjectId = drawAsksProjectIdOnJoin(draw);
  const hasDirectComplete = isProjectRegistrationComplete(directProfile, draw);
  const hasSiblingTrc20 = Boolean(sibling?.projectData?.trc20Address);
  const hasSiblingProjectId = Boolean(sibling?.projectData?.projectAccountId);
  const hasSiblingReferralStatus = Boolean(
    sibling?.projectData?.referralVerified ||
      sibling?.projectData?.selfReportedNonReferral ||
      isCrossOrganizerNonReferral,
  );

  const hasSiblingIdStepDone = hasCompletedProjectIdStep(sibling?.projectData);

  let effectiveProfile = directProfile;
  if (!hasDirectComplete && needsWallet && hasSiblingTrc20) {
    effectiveProfile = {
      ...(directProfile || {}),
      trc20Address: sibling.projectData.trc20Address,
      projectAccountId: directProfile?.projectAccountId || sibling.projectData.projectAccountId || undefined,
      referralVerified: isCrossOrganizerNonReferral ? false : Boolean(sibling.projectData.referralVerified),
      selfReportedNonReferral: isCrossOrganizerNonReferral
        ? true
        : Boolean(sibling.projectData.selfReportedNonReferral),
      referralOwnerId: referralOwnerId || sibling.projectData.referralOwnerId || null,
    };
  } else if (!hasDirectComplete && !needsWallet && (needsProjectId ? hasSiblingIdStepDone : hasSiblingReferralStatus)) {
    effectiveProfile = {
      ...(directProfile || {}),
      projectAccountId: directProfile?.projectAccountId || sibling.projectData.projectAccountId || undefined,
      referralVerified: isCrossOrganizerNonReferral ? false : Boolean(sibling.projectData.referralVerified),
      selfReportedNonReferral: isCrossOrganizerNonReferral
        ? true
        : Boolean(sibling.projectData.selfReportedNonReferral),
      referralOwnerId: referralOwnerId || sibling.projectData.referralOwnerId || null,
    };
  } else if (directProfile && isCrossOrganizerNonReferral && directProfile.referralVerified) {
    effectiveProfile = {
      ...directProfile,
      referralVerified: false,
      selfReportedNonReferral: true,
    };
  }

  const canSkipRegistration = needsProjectId
    ? hasDirectComplete ||
      (needsWallet ? hasSiblingTrc20 && hasSiblingIdStepDone : hasSiblingIdStepDone)
    : needsWallet
      ? hasDirectComplete ||
        (hasSiblingTrc20 &&
          (Boolean(sibling?.projectData?.referralVerified) ||
            Boolean(sibling?.projectData?.selfReportedNonReferral) ||
            isCrossOrganizerNonReferral))
      : hasDirectComplete || hasSiblingReferralStatus;

  return {
    directProfile,
    effectiveProfile,
    canSkipRegistration,
    referralOwnerId,
    drawOwnerId,
    isCrossOrganizerNonReferral,
    siblingSource: sibling,
    brandName,
  };
}

function ensureCrossOrganizerProjectProfile(userId, draw, ctx, setUserProjectProfile) {
  if (!draw?.projectId || !ctx?.canSkipRegistration) {
    return;
  }

  const sibling = ctx.siblingSource;
  const trc20Address = ctx.directProfile?.trc20Address || sibling?.projectData?.trc20Address;
  if (!trc20Address) {
    return;
  }

  const nextReferralOwnerId =
    ctx.referralOwnerId ||
    ctx.directProfile?.referralOwnerId ||
    sibling?.projectData?.referralOwnerId ||
    null;

  const payload = {
    trc20Address,
    referralOwnerId: nextReferralOwnerId,
  };

  const projectAccountId = ctx.directProfile?.projectAccountId || sibling?.projectData?.projectAccountId;
  if (projectAccountId) {
    payload.projectAccountId = projectAccountId;
  }
  const projectIdStepCompletedAt =
    ctx.directProfile?.projectIdStepCompletedAt || sibling?.projectData?.projectIdStepCompletedAt;
  if (projectIdStepCompletedAt) {
    payload.projectIdStepCompletedAt = projectIdStepCompletedAt;
  }

  if (sibling?.projectId && sibling.projectId !== draw.projectId) {
    payload.inheritedFromProjectId = sibling.projectId;
  }

  if (ctx.isCrossOrganizerNonReferral) {
    payload.referralVerified = false;
    payload.selfReportedNonReferral = true;
    payload.crossOrganizerNonReferral = true;
  } else if (!ctx.directProfile?.trc20Address && sibling?.projectData) {
    payload.referralVerified = Boolean(sibling.projectData.referralVerified);
    payload.selfReportedNonReferral = Boolean(sibling.projectData.selfReportedNonReferral);
  }

  const current = ctx.directProfile || {};
  const unchanged =
    current.trc20Address === trc20Address &&
    Boolean(current.referralVerified) === Boolean(payload.referralVerified) &&
    Boolean(current.selfReportedNonReferral) === Boolean(payload.selfReportedNonReferral) &&
    Number(current.referralOwnerId || 0) === Number(payload.referralOwnerId || 0);

  if (unchanged) {
    return;
  }

  setUserProjectProfile(userId, draw.projectId, payload);
}

function getPanelReferralOwnerLabel(winnerId, draw, deps) {
  const { readUserProjectProfiles, readProjects, readData, getWinnerDisplayName, getProjectById } = deps;
  const project = draw?.projectId ? getProjectById(draw.projectId) : null;
  if (!project?.name) {
    return "";
  }

  const brandEntries = listUserBrandProjectEntries(
    winnerId,
    project.name,
    readUserProjectProfiles,
    readProjects,
  );
  const ownerId = resolveReferralOwnerForBrand(winnerId, brandEntries, readData);
  if (!ownerId) {
    return "";
  }

  const profiles = readUserProjectProfiles();
  const ownerMeta = profiles.users?.[String(ownerId)]?.meta;
  const ownerName = ownerMeta ? getWinnerDisplayName(ownerMeta, ownerId) : `ID ${ownerId}`;
  return `Реф организатора: ${ownerName}`;
}

function findProjectIdsByBrandName(brandName, projects) {
  const normalized = normalizeProjectBrandName(brandName);
  if (!normalized) {
    return [];
  }
  return (projects || [])
    .filter((project) => normalizeProjectBrandName(project.name) === normalized)
    .map((project) => project.id);
}

function resetBrandProjectProfiles(brandName, options = {}) {
  const readUserProjectProfiles = options.readUserProjectProfiles;
  const readProjects = options.readProjects;
  const writeUserProjectProfiles = options.writeUserProjectProfiles;

  if (!readUserProjectProfiles || !readProjects || !writeUserProjectProfiles) {
    throw new Error("resetBrandProjectProfiles requires read/write helpers");
  }

  const projectRecords = readProjects().projects || [];
  const projectIds = new Set(findProjectIdsByBrandName(brandName, projectRecords));
  if (!projectIds.size) {
    return {
      brandName,
      projectIds: [],
      usersTouched: 0,
      entriesRemoved: 0,
      dryRun: options.dryRun !== false,
    };
  }

  const profiles = readUserProjectProfiles();
  let usersTouched = 0;
  let entriesRemoved = 0;

  for (const [userKey, userNode] of Object.entries(profiles.users || {})) {
    if (!userNode?.projects) {
      continue;
    }

    let removedForUser = 0;
    for (const projectId of projectIds) {
      if (userNode.projects[projectId]) {
        delete userNode.projects[projectId];
        removedForUser += 1;
        entriesRemoved += 1;
      }
    }

    if (removedForUser > 0) {
      usersTouched += 1;
      if (Object.keys(userNode.projects).length === 0) {
        userNode.projects = {};
      }
      profiles.users[userKey] = userNode;
    }
  }

  const result = {
    brandName,
    normalizedBrand: normalizeProjectBrandName(brandName),
    projectIds: [...projectIds],
    matchedProjects: projectRecords
      .filter((project) => projectIds.has(project.id))
      .map((project) => ({ id: project.id, name: project.name, ownerId: project.ownerId })),
    usersTouched,
    entriesRemoved,
    dryRun: options.dryRun !== false,
  };

  if (!result.dryRun) {
    writeUserProjectProfiles(profiles);
  }

  return result;
}

function isLegacyPokerdomProjectId(projectId) {
  return Boolean(projectId && LEGACY_POKERDOM_PROJECT_OWNERS[projectId]);
}

function isPokerdomDrawProjectId(projectId, readProjects) {
  if (!projectId) {
    return false;
  }
  if (isLegacyPokerdomProjectId(projectId)) {
    return true;
  }
  if (String(projectId).startsWith("brand_pokerdom_")) {
    return true;
  }
  const project = (readProjects().projects || []).find((item) => item.id === projectId);
  return Boolean(project && isPokerdomProject(project));
}

function normalizeWallet(value) {
  return String(value || "").trim();
}

function pickLegacyPokerdomSourceEntry(userProjects) {
  const entries = Object.entries(userProjects || {})
    .filter(([projectId, projectData]) => isLegacyPokerdomProjectId(projectId) && projectData?.trc20Address)
    .map(([projectId, projectData]) => ({ projectId, projectData }));

  return (
    entries.find((entry) => entry.projectData?.trc20Address) ||
    entries.find(
      (entry) =>
        entry.projectData?.referralVerified || entry.projectData?.selfReportedNonReferral,
    ) ||
    entries[0] ||
    null
  );
}

function buildPokerdomBrandPayload(sourceEntry, ownerId) {
  const { projectId, projectData } = sourceEntry;
  const payload = {
    inheritedFromProjectId: projectId,
    pokerdomLegacyMigratedAt: new Date().toISOString(),
  };

  for (const field of POKERDOM_PROFILE_COPY_FIELDS) {
    if (projectData[field] != null && projectData[field] !== "") {
      payload[field] = projectData[field];
    }
  }

  if (payload.referralOwnerId == null && Number.isFinite(ownerId)) {
    payload.referralOwnerId = ownerId;
  }

  return payload;
}

function collectPokerdomMigrationOwnerIds(userId, userProjects, readData, readArchivedDraws, readProjects) {
  const ownerIds = new Set();

  for (const [projectId, projectData] of Object.entries(userProjects || {})) {
    if (!isLegacyPokerdomProjectId(projectId) || !projectData?.trc20Address) {
      continue;
    }
    const legacyOwnerId = LEGACY_POKERDOM_PROJECT_OWNERS[projectId];
    if (Number.isFinite(legacyOwnerId)) {
      ownerIds.add(legacyOwnerId);
    }
    if (projectData.referralOwnerId != null) {
      ownerIds.add(Number(projectData.referralOwnerId));
    }
  }

  const allDraws = [
    ...(readData().draws || []),
    ...(readArchivedDraws().draws || []),
  ];
  for (const draw of allDraws) {
    if (!isPokerdomDrawProjectId(draw.projectId, readProjects)) {
      continue;
    }
    if (!(draw.participantIds || []).some((id) => String(id) === String(userId))) {
      continue;
    }
    const drawOwnerId = getDrawOwnerId(draw);
    if (drawOwnerId) {
      ownerIds.add(drawOwnerId);
    }
  }

  return [...ownerIds].filter((ownerId) => Number.isFinite(ownerId) && ownerId > 0);
}

function migratePokerdomLegacyProfiles(options = {}) {
  const {
    readUserProjectProfiles,
    readProjects,
    readData,
    readArchivedDraws,
    writeUserProjectProfiles,
    dryRun = true,
  } = options;

  if (!readUserProjectProfiles || !readProjects || !readData || !readArchivedDraws) {
    throw new Error("migratePokerdomLegacyProfiles requires read helpers");
  }

  const profiles = readUserProjectProfiles();
  const result = {
    usersScanned: 0,
    usersTouched: 0,
    brandProfilesCreated: 0,
    brandProfilesUpdated: 0,
    skippedExistingWallet: 0,
    skippedNoSource: 0,
    dryRun,
    samples: [],
  };

  for (const [userKey, userNode] of Object.entries(profiles.users || {})) {
    result.usersScanned += 1;
    const userProjects = userNode?.projects || {};
    const sourceEntry = pickLegacyPokerdomSourceEntry(userProjects);
    if (!sourceEntry?.projectData?.trc20Address) {
      result.skippedNoSource += 1;
      continue;
    }

    const ownerIds = collectPokerdomMigrationOwnerIds(
      userKey,
      userProjects,
      readData,
      readArchivedDraws,
      readProjects,
    );
    if (!ownerIds.length) {
      result.skippedNoSource += 1;
      continue;
    }

    let touchedUser = false;
    for (const ownerId of ownerIds) {
      const brandProjectId = buildBrandProjectId("pokerdom", ownerId);
      const current = userProjects[brandProjectId] || {};
      const sourceWallet = normalizeWallet(sourceEntry.projectData.trc20Address);
      const currentWallet = normalizeWallet(current.trc20Address);

      if (currentWallet && currentWallet !== sourceWallet) {
        result.skippedExistingWallet += 1;
        continue;
      }
      if (currentWallet === sourceWallet && current.inheritedFromProjectId) {
        continue;
      }

      const payload = buildPokerdomBrandPayload(sourceEntry, ownerId);
      if (!userNode.projects) {
        userNode.projects = {};
      }
      userNode.projects[brandProjectId] = {
        ...current,
        ...payload,
        updatedAt: new Date().toISOString(),
      };
      touchedUser = true;

      if (currentWallet) {
        result.brandProfilesUpdated += 1;
      } else {
        result.brandProfilesCreated += 1;
      }

      if (result.samples.length < 8) {
        result.samples.push({
          userId: userKey,
          from: sourceEntry.projectId,
          to: brandProjectId,
          wallet: sourceWallet.slice(0, 8) + "...",
        });
      }
    }

    if (touchedUser) {
      result.usersTouched += 1;
      profiles.users[userKey] = userNode;
    }
  }

  if (!dryRun && writeUserProjectProfiles) {
    writeUserProjectProfiles(profiles);
  }

  return result;
}

module.exports = {
  LEGACY_POKERDOM_PROJECT_OWNERS,
  normalizeProjectBrandName,
  getDrawOwnerId,
  listUserBrandProjectEntries,
  resolveReferralOwnerForBrand,
  resolveJoinProjectContext,
  ensureCrossOrganizerProjectProfile,
  getPanelReferralOwnerLabel,
  inferReferralOwnerId,
  findProjectIdsByBrandName,
  resetBrandProjectProfiles,
  migratePokerdomLegacyProfiles,
  LEGACY_POKERDOM_PROJECT_OWNERS,
};
