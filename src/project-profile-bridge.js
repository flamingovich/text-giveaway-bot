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
    const canSkipRegistration = Boolean(
      directProfile &&
        (directProfile.referralVerified || directProfile.selfReportedNonReferral) &&
        directProfile.trc20Address,
    );

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

  const hasDirectComplete = Boolean(
    directProfile &&
      (directProfile.referralVerified || directProfile.selfReportedNonReferral) &&
      directProfile.trc20Address,
  );
  const hasSiblingTrc20 = Boolean(sibling?.projectData?.trc20Address);

  let effectiveProfile = directProfile;
  if (!hasDirectComplete && hasSiblingTrc20) {
    effectiveProfile = {
      ...(directProfile || {}),
      trc20Address: sibling.projectData.trc20Address,
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

  const canSkipRegistration =
    hasDirectComplete ||
    (hasSiblingTrc20 &&
      (Boolean(sibling?.projectData?.referralVerified) ||
        Boolean(sibling?.projectData?.selfReportedNonReferral) ||
        isCrossOrganizerNonReferral));

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

module.exports = {
  normalizeProjectBrandName,
  getDrawOwnerId,
  listUserBrandProjectEntries,
  resolveJoinProjectContext,
  ensureCrossOrganizerProjectProfile,
  getPanelReferralOwnerLabel,
  inferReferralOwnerId,
  findProjectIdsByBrandName,
  resetBrandProjectProfiles,
};
