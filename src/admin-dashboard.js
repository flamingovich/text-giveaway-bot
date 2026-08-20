const crypto = require("crypto");
const { DateTime } = require("luxon");
const { inferReferralOwnerId, normalizeProjectBrandName } = require("./project-profile-bridge");
const {
  buildUserProjectActivityIndex,
  getUserProjectActivity,
  listActivityKeys,
} = require("./admin-user-stats");
const { collectAllDraws } = require("./admin-draw-source");
const { buildUserCard } = require("./admin-user-card");
const { buildSupportView } = require("./admin-support-view");
const { resolveProjectId, resolveUserProjects } = require("./project-identity");
const { buildDashboardStats } = require("./admin-dashboard-stats");
const {
  readSupportChats,
  updateSupportChat,
  sendSupportBotMessage,
  closeSupportChatFromAdmin,
  appendTranscript,
  getChatTranscript,
  formatSupportChatUser,
  listSupportChats,
  formatMessageTime,
  SUPPORT_STORES,
  readSupportChatsFor,
  findSupportChatAnywhere,
} = require("./support-transcripts");

const COOKIE_NAME = "admin_panel";
const SESSION_MAX_AGE_SEC = 86400 * 7;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return null;
}

function createAdminAuth({ login, passwordHash, botToken, cookieSecure }) {
  function createToken() {
    const issued = String(Date.now());
    const sig = crypto.createHmac("sha256", botToken).update(`admin:${issued}`).digest("hex");
    return `${issued}.${sig}`;
  }

  function parseToken(token) {
    if (!token) return false;
    const dot = token.lastIndexOf(".");
    if (dot === -1) return false;
    const issued = Number(token.slice(0, dot));
    const sig = token.slice(dot + 1);
    if (!Number.isFinite(issued)) return false;
    if (Date.now() - issued > SESSION_MAX_AGE_SEC * 1000) return false;
    const expected = crypto.createHmac("sha256", botToken).update(`admin:${issued}`).digest("hex");
    return sig === expected;
  }

  function setCookie(res) {
    const token = createToken();
    const parts = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      "Path=/admin",
      "HttpOnly",
      `Max-Age=${SESSION_MAX_AGE_SEC}`,
    ];
    if (cookieSecure) {
      parts.push("Secure", "SameSite=None");
    } else {
      parts.push("SameSite=Lax");
    }
    res.setHeader("Set-Cookie", parts.join("; "));
  }

  function clearCookie(res) {
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/admin; HttpOnly; Max-Age=0`);
  }

  function isAuthed(req) {
    return parseToken(getCookie(req, COOKIE_NAME));
  }

  function safeEqualText(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    if (left.length !== right.length) {
      return false;
    }
    return crypto.timingSafeEqual(left, right);
  }

  function checkCredentials(username, password) {
    if (!login || !passwordHash) return false;
    if (!safeEqualText(username, login)) return false;
    const hash = crypto.createHash("sha256").update(String(password || "")).digest();
    const expected = Buffer.from(passwordHash, "hex");
    if (hash.length !== expected.length) return false;
    return crypto.timingSafeEqual(hash, expected);
  }

  return { isAuthed, setCookie, clearCookie, checkCredentials };
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function collectOrganizerOptions(draws, adminIds, delegatedAdmins, userProfiles) {
  const map = new Map();
  for (const id of adminIds || []) {
    map.set(String(id), labelForUser(id, userProfiles));
  }
  for (const entry of delegatedAdmins || []) {
    const id = String(entry.userId);
    map.set(id, labelForUser(id, userProfiles, entry));
  }
  for (const draw of draws || []) {
    if (draw.ownerId) {
      const id = String(draw.ownerId);
      if (!map.has(id)) {
        map.set(id, labelForUser(id, userProfiles));
      }
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

// The table prints the id in its own line underneath, so repeating it inside
// the label showed the same number twice in one cell.
function displayNameForUser(userId, userProfiles, entry = {}) {
  const meta = userProfiles.users?.[String(userId)]?.meta || {};
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  const username = meta.username ? `@${meta.username}` : entry.username ? `@${entry.username}` : "";
  if (name && username) {
    return `${name} (${username})`;
  }
  return username || name || `ID ${userId}`;
}

function labelForUser(userId, userProfiles, entry = {}) {
  const meta = userProfiles.users?.[String(userId)]?.meta || {};
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  const username = meta.username ? `@${meta.username}` : entry.username ? `@${entry.username}` : "";
  if (name && username) return `${name} (${username}) · ${userId}`;
  if (username) return `${username} · ${userId}`;
  if (name) return `${name} · ${userId}`;
  return `ID ${userId}`;
}

function countReferralsForOwner(ownerId, projectsData, profiles) {
  const ownerKey = ownerId ? String(ownerId) : "";
  const projectIds = new Set(
    asArray(projectsData?.projects)
      .filter((project) => !ownerKey || String(project.ownerId || "") === ownerKey)
      .map((project) => project.id),
  );
  if (!projectIds.size) {
    return 0;
  }

  const refs = new Set();
  for (const [userKey, userNode] of Object.entries(profiles.users || {})) {
    for (const [projectId, projectData] of Object.entries(userNode.projects || {})) {
      if (projectIds.has(projectId) && projectData?.referralVerified) {
        refs.add(userKey);
      }
    }
  }
  return refs.size;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const USERS_PAGE_SIZE = 100;

function collectBrandOptions(projectsList) {
  const byBrand = new Map();
  for (const project of projectsList || []) {
    const key = normalizeProjectBrandName(project.name);
    if (!key) continue;
    if (!byBrand.has(key)) {
      byBrand.set(key, project.name);
    }
  }
  return [...byBrand.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function missingProject(projectId) {
  return { id: projectId, name: "Проект удалён", ownerId: null, missing: true };
}

function emptyProjectRow(userId, userLabel, userName = userLabel) {
  return {
    userId,
    userLabel,
    userName,
    projectId: "",
    projectName: "Без проекта",
    brandKey: "",
    refStatus: "unknown",
    referralOwnerId: "",
    referralOwnerLabel: "—",
    projectOwnerId: "",
    projectOwnerLabel: "—",
    hasWallet: false,
  };
}

function buildAdminUserProjectRows(deps) {
  const { readUserProjectProfiles, readProjects, readData } = deps;
  const profiles = readUserProjectProfiles();
  const projectsList = readProjects().projects || [];
  const projectById = new Map(projectsList.map((project) => [project.id, project]));
  const rows = [];

  for (const [userKey, userNode] of Object.entries(profiles.users || {})) {
    const userId = userKey;
    const userLabel = labelForUser(userId, profiles);

    // Bindings left pointing at pre-brand project ids are folded onto the brand
    // they became, so nothing reads as "Проект удалён" for a project that was
    // only moved.
    const projectEntries = Object.entries(resolveUserProjects(userNode.projects));

    // A project that was deleted or renamed by the brand migration used to drop
    // the whole row, hiding 288 users on production. Keep the person and mark
    // the project instead.
    if (projectEntries.length === 0) {
      rows.push(emptyProjectRow(userId, userLabel, displayNameForUser(userId, profiles)));
    }

    for (const [projectId, projectData] of projectEntries) {
      const project = projectById.get(projectId) || missingProject(projectId);

      const isRef = Boolean(projectData.referralVerified);
      const isNonRef = Boolean(projectData.selfReportedNonReferral);
      let refStatus = "unknown";
      if (isRef) {
        refStatus = "ref";
      } else if (isNonRef) {
        refStatus = "non-ref";
      }

      const referralOwnerId = inferReferralOwnerId(userId, projectId, projectData, readData);
      rows.push({
        userId,
        userLabel,
        userName: displayNameForUser(userId, profiles),
        projectId,
        projectName: project.name,
        brandKey: normalizeProjectBrandName(project.name),
        refStatus,
        referralOwnerId: referralOwnerId ? String(referralOwnerId) : "",
        referralOwnerLabel: referralOwnerId ? labelForUser(String(referralOwnerId), profiles) : "—",
        projectOwnerId: project.ownerId != null ? String(project.ownerId) : "",
        projectOwnerLabel:
          project.ownerId != null ? labelForUser(String(project.ownerId), profiles) : "—",
        hasWallet: Boolean(projectData.trc20Address),
      });
    }
  }

  rows.sort((left, right) => {
    const nameCmp = left.projectName.localeCompare(right.projectName, "ru");
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return left.userLabel.localeCompare(right.userLabel, "ru");
  });

  return rows;
}

function formatMoneyTotalsLocal(rub, usd, deps) {
  const parts = [];
  if (rub > 0 && deps.formatRubAmount) {
    parts.push(deps.formatRubAmount(rub));
  }
  if (usd > 0 && deps.formatUsdAmount) {
    parts.push(deps.formatUsdAmount(usd));
  }
  return parts.length ? parts.join(" · ") : "—";
}

// Profiles alone do not describe who took part: a person can be a participant
// or even a winner of a draw whose project they have no profile entry for
// (39 wins on production). Cover every key the activity index actually holds.
function addActivityOnlyRows(deps, projectRows, activityIndex) {
  const known = new Set(projectRows.map((row) => `${row.userId}:${row.projectId}`));
  const profiles = deps.readUserProjectProfiles();
  const projectById = new Map(
    (deps.readProjects().projects || []).map((project) => [project.id, project]),
  );

  for (const { userId, projectId } of listActivityKeys(activityIndex)) {
    if (known.has(`${userId}:${projectId}`)) {
      continue;
    }
    known.add(`${userId}:${projectId}`);
    // Mega giveaways have no project of their own.
    if (!projectId) {
      projectRows.push(
        emptyProjectRow(userId, labelForUser(userId, profiles), displayNameForUser(userId, profiles)),
      );
      continue;
    }
    const project = projectById.get(resolveProjectId(projectId)) || missingProject(projectId);
    projectRows.push({
      userId,
      userLabel: labelForUser(userId, profiles),
      userName: displayNameForUser(userId, profiles),
      projectId,
      projectName: project.name,
      brandKey: normalizeProjectBrandName(project.name),
      refStatus: "unknown",
      referralOwnerId: "",
      referralOwnerLabel: "—",
      projectOwnerId: project.ownerId != null ? String(project.ownerId) : "",
      projectOwnerLabel:
        project.ownerId != null ? labelForUser(String(project.ownerId), profiles) : "—",
      hasWallet: false,
    });
  }

  return projectRows;
}

function buildAdminUserRows(deps, activityIndex, prebuiltProjectRows = null) {
  const projectRows = addActivityOnlyRows(
    deps,
    prebuiltProjectRows || buildAdminUserProjectRows(deps),
    activityIndex,
  );
  const byUser = new Map();

  for (const row of projectRows) {
    const activity = getUserProjectActivity(activityIndex, row.userId, row.projectId);
    let userRow = byUser.get(row.userId);
    if (!userRow) {
      userRow = {
        userId: row.userId,
        userLabel: row.userLabel,
        userName: row.userName || row.userLabel,
        projects: [],
        participations: 0,
        wins: 0,
        winningsRub: 0,
        winningsUsd: 0,
        paidRub: 0,
        paidUsd: 0,
        fraudLabels: new Set(),
        fraudDetails: [],
        fraudDetailKeys: new Set(),
        hasWallet: false,
      };
      byUser.set(row.userId, userRow);
    }

    userRow.projects.push({
      projectId: row.projectId,
      projectName: row.projectName,
      brandKey: row.brandKey,
      refStatus: row.refStatus,
      referralOwnerLabel: row.referralOwnerLabel,
      referralOwnerId: row.referralOwnerId,
      projectOwnerLabel: row.projectOwnerLabel,
      hasWallet: row.hasWallet,
    });
    if (row.hasWallet) {
      userRow.hasWallet = true;
    }
    userRow.participations += activity.participations;
    userRow.wins += activity.wins;
    userRow.winningsRub += activity.winningsRub;
    userRow.winningsUsd += activity.winningsUsd;
    userRow.paidRub += activity.paidRub;
    userRow.paidUsd += activity.paidUsd;

    for (const label of activity.fraudLabels) {
      userRow.fraudLabels.add(label);
    }
    for (const detail of activity.fraudDetails) {
      const detailKey = `${detail.kind}:${detail.drawId}:${detail.label}:${row.projectId}`;
      if (userRow.fraudDetailKeys.has(detailKey)) {
        continue;
      }
      userRow.fraudDetailKeys.add(detailKey);
      userRow.fraudDetails.push({ ...detail, projectName: row.projectName });
    }
  }

  return [...byUser.values()]
    .map((row) => ({
      userId: row.userId,
      userLabel: row.userLabel,
      userName: row.userName,
      projects: row.projects,
      participations: row.participations,
      wins: row.wins,
      winningsRub: row.winningsRub,
      winningsUsd: row.winningsUsd,
      paidRub: row.paidRub,
      paidUsd: row.paidUsd,
      winningsText: formatMoneyTotalsLocal(row.winningsRub, row.winningsUsd, deps),
      payoutsText: formatMoneyTotalsLocal(row.paidRub, row.paidUsd, deps),
      fraudLabels: [...row.fraudLabels],
      fraudDetails: row.fraudDetails,
      hasFraud: row.fraudDetails.length > 0,
      hasWallet: row.hasWallet,
    }))
    .sort((left, right) => left.userLabel.localeCompare(right.userLabel, "ru"));
}

function filterAdminUserRows(rows, filters) {
  const q = String(filters.q || "")
    .trim()
    .toLowerCase();
  const brand = String(filters.brand || "").trim();
  const refOwnerId = String(filters.refOwnerId || "").trim();
  const refFilter = String(filters.ref || "").trim();
  const activity = String(filters.activity || "").trim();

  return rows.filter((row) => {
    // Listing everyone who ever touched the bot is correct but noisy: about two
    // thousand of them never entered a draw.
    if (activity === "participated" && row.participations === 0) {
      return false;
    }
    if (activity === "won" && row.wins === 0) {
      return false;
    }
    if (activity === "unpaid" && !(row.wins > 0 && row.paidRub === 0 && row.paidUsd === 0)) {
      return false;
    }
    if (activity === "fraud" && !row.hasFraud) {
      return false;
    }
    if (brand && !row.projects.some((project) => project.brandKey === brand)) {
      return false;
    }
    if (refOwnerId && !row.projects.some((project) => project.referralOwnerId === refOwnerId)) {
      return false;
    }
    if (refFilter === "ref" && !row.projects.some((project) => project.refStatus === "ref")) {
      return false;
    }
    if (refFilter === "non-ref" && !row.projects.some((project) => project.refStatus === "non-ref")) {
      return false;
    }
    if (q) {
      const projectHaystack = row.projects
        .map(
          (project) =>
            `${project.projectName} ${project.referralOwnerLabel} ${project.projectOwnerLabel}`,
        )
        .join(" ");
      const fraudHaystack = (row.fraudDetails || [])
        .map((detail) => `${detail.displayText || ""} ${(detail.linkedUserIds || []).join(" ")}`)
        .join(" ");
      const haystack =
        `${row.userId} ${row.userLabel} ${projectHaystack} ${(row.fraudLabels || []).join(" ")} ${fraudHaystack}`.toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

function collectReferralOwnerOptions(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const project of row.projects || []) {
      if (!project.referralOwnerId) {
        continue;
      }
      map.set(project.referralOwnerId, project.referralOwnerLabel);
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function compareAdminUserRows(left, right, sortKey, sortDir) {
  const dir = sortDir === "asc" ? 1 : -1;
  if (sortKey === "winnings") {
    if (left.winningsRub !== right.winningsRub) {
      return (left.winningsRub - right.winningsRub) * dir;
    }
    return (left.winningsUsd - right.winningsUsd) * dir;
  }
  if (sortKey === "payouts") {
    if (left.paidRub !== right.paidRub) {
      return (left.paidRub - right.paidRub) * dir;
    }
    return (left.paidUsd - right.paidUsd) * dir;
  }
  return ((left[sortKey] || 0) - (right[sortKey] || 0)) * dir;
}

function sortAdminUserRows(rows, sortKey, sortDir) {
  const allowed = new Set(["participations", "wins", "winnings", "payouts"]);
  if (!allowed.has(sortKey)) {
    // Alphabetical order put whoever happens to start with "A" on page one.
    // Now that everyone who ever touched the bot is listed, the people worth
    // seeing first are the ones who actually took part.
    return [...rows].sort((left, right) => {
      if (right.participations !== left.participations) {
        return right.participations - left.participations;
      }
      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }
      return String(left.userName || "").localeCompare(String(right.userName || ""), "ru");
    });
  }
  const direction = sortDir === "asc" ? "asc" : "desc";
  return [...rows].sort((left, right) => compareAdminUserRows(left, right, sortKey, direction));
}

function renderRefStatusBadge(refStatus) {
  if (refStatus === "ref") {
    return '<span class="badge badge-ok">Реф</span>';
  }
  if (refStatus === "non-ref") {
    return '<span class="badge badge-warn">Не реф</span>';
  }
  return '<span class="badge badge-muted">—</span>';
}

const PROJECTS_SHOWN_IN_CELL = 3;

// One user can carry eight project bindings, and printing each with its own
// referral-owner line turned a single row into half a screen of repeated text.
// The cell summarises; the user's own page has the full list.
function renderUserProjectsCell(projects) {
  const named = projects.filter((project) => project.projectId);
  if (named.length === 0) {
    return '<span class="badge badge-muted">Без проекта</span>';
  }

  // Legacy bindings from before the brand migration all resolve to the same
  // "deleted" label, and printing it three times in a row says nothing.
  const withName = named.filter((project) => project.projectName !== "Проект удалён");
  const orphans = named.length - withName.length;

  // The same brand exists as a separate project per owner, so one person can
  // hold three bindings all called Pokerdom. Show the brand once.
  const live = [];
  const seenNames = new Set();
  for (const project of withName) {
    if (seenNames.has(project.projectName)) {
      continue;
    }
    seenNames.add(project.projectName);
    live.push(project);
  }

  const chips = live
    .slice(0, PROJECTS_SHOWN_IN_CELL)
    .map(
      (project) =>
        `<span class="project-chip project-chip-${escapeHtml(project.refStatus)}">${escapeHtml(project.projectName)}</span>`,
    )
    .join("");

  const rest = Math.max(0, live.length - PROJECTS_SHOWN_IN_CELL);
  const more = rest > 0 ? `<span class="project-chip project-chip-more">+${rest}</span>` : "";
  const orphanChip = orphans
    ? `<span class="project-chip project-chip-more" title="привязки к удалённым проектам">удалённых: ${orphans}</span>`
    : "";

  // The referral owner is nearly always the same across a user's projects, so
  // it belongs on one line rather than repeated under every chip.
  const owners = [
    ...new Set(
      named
        .map((project) => project.referralOwnerLabel)
        .filter((label) => label && label !== "—"),
    ),
  ];
  const ownerLine = owners.length
    ? `<div class="hint owner-line" title="${escapeHtml(owners.join(", "))}">реф: ${escapeHtml(owners[0])}${owners.length > 1 ? ` +${owners.length - 1}` : ""}</div>`
    : "";

  if (!chips && !orphanChip) {
    return '<span class="badge badge-muted">Без проекта</span>';
  }
  return `<div class="user-projects">${chips}${more}${orphanChip}</div>${ownerLine}`;
}

function renderAntiFraudCell(row) {
  if (!row.hasFraud) {
    return '<span class="badge badge-ok">Чисто</span>';
  }

  const groups = new Map();
  for (const detail of row.fraudDetails) {
    const kind = detail.kind || "other";
    if (!groups.has(kind)) {
      groups.set(kind, { label: detail.label, items: [] });
    }
    groups.get(kind).items.push(detail);
  }

  const kindTitles = {
    ip: "Бот по IP",
    wallet: "Мультиаккаунт",
    subscription: "Подписка",
    other: "Другое",
  };

  const blocks = [...groups.entries()]
    .map(([kind, group]) => {
      const items = group.items
        .map((detail) => {
          const drawTitle = detail.drawTitle ? `«${detail.drawTitle}»` : detail.drawId || "—";
          const projectPart = detail.projectName ? `<span class="fraud-project">${escapeHtml(detail.projectName)}</span>` : "";
          const linkedPart = detail.linkedUsersText
            ? `<div class="fraud-linked">${escapeHtml(detail.linkedUsersText)}</div>`
            : detail.reason
              ? `<div class="fraud-linked">${escapeHtml(detail.reason)}</div>`
              : "";
          return `<div class="fraud-item">
            ${projectPart}
            <div class="fraud-draw">${escapeHtml(drawTitle)}</div>
            ${linkedPart}
          </div>`;
        })
        .join("");
      const title = kindTitles[kind] || group.label || kind;
      return `<div class="fraud-group">
        <div class="fraud-group-title"><span class="badge badge-danger">${escapeHtml(title)}</span></div>
        ${items}
      </div>`;
    })
    .join("");

  return `<div class="fraud-panel">${blocks}</div>`;
}

function renderSortHeader(label, columnKey, filters) {
  const sort = filters.sort || "";
  const dir = filters.dir === "asc" ? "asc" : "desc";
  const nextDir = sort === columnKey && dir === "desc" ? "asc" : "desc";
  const indicator = sort === columnKey ? (dir === "desc" ? " ↓" : " ↑") : "";
  const params = new URLSearchParams();
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.refOwnerId) params.set("refOwnerId", filters.refOwnerId);
  if (filters.ref) params.set("ref", filters.ref);
  if (filters.q) params.set("q", filters.q);
  params.set("sort", columnKey);
  params.set("dir", nextDir);
  return `<th><a class="sort-link" href="/admin/users?${params.toString()}">${escapeHtml(label)}${indicator}</a></th>`;
}

function renderUsersPage(deps, viewModel) {
  const { rows, page, totalPages, totalFiltered, totalAll, filters, brands, refOwners, stats } =
    viewModel;

  const brandOptions = brands
    .map(
      (brand) =>
        `<option value="${escapeHtml(brand.key)}"${brand.key === filters.brand ? " selected" : ""}>${escapeHtml(brand.label)}</option>`,
    )
    .join("");

  const refOwnerOptions = refOwners
    .map(
      (owner) =>
        `<option value="${escapeHtml(owner.id)}"${owner.id === filters.refOwnerId ? " selected" : ""}>${escapeHtml(owner.label)}</option>`,
    )
    .join("");

  const tableRows = rows
    .map(
      (row) => `<tr>
        <td><a class="user-link" href="/admin/users/${encodeURIComponent(row.userId)}">${escapeHtml(row.userName || row.userLabel)}</a><div class="mono">${escapeHtml(row.userId)}</div></td>
        <td>${renderUserProjectsCell(row.projects)}</td>
        <td>${renderAntiFraudCell(row)}</td>
        <td>${row.hasWallet ? '<span class="badge badge-ok">Есть</span>' : '<span class="badge badge-muted">Нет</span>'}</td>
        <td>${row.participations}</td>
        <td>${row.wins}</td>
        <td>${escapeHtml(row.winningsText)}</td>
        <td>${escapeHtml(row.payoutsText)}</td>
      </tr>`,
    )
    .join("");

  const queryBase = new URLSearchParams();
  if (filters.brand) queryBase.set("brand", filters.brand);
  if (filters.refOwnerId) queryBase.set("refOwnerId", filters.refOwnerId);
  if (filters.ref) queryBase.set("ref", filters.ref);
  if (filters.activity) queryBase.set("activity", filters.activity);
  if (filters.q) queryBase.set("q", filters.q);
  if (filters.sort) queryBase.set("sort", filters.sort);
  if (filters.dir) queryBase.set("dir", filters.dir);

  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const prevHref = prevPage
    ? `/admin/users?${new URLSearchParams({ ...Object.fromEntries(queryBase), page: String(prevPage) }).toString()}`
    : "";
  const nextHref = nextPage
    ? `/admin/users?${new URLSearchParams({ ...Object.fromEntries(queryBase), page: String(nextPage) }).toString()}`
    : "";

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Юзеры — Admin</title>
  <style>${getAdminBaseStyles()}</style>
</head>
<body>
  ${renderAdminTop("Юзеры и рефы", "users")}
  <main class="wrap wrap-wide">
    <div class="grid">
      <div class="stat"><span>Пользователей в базе</span><b>${stats.usersTotal}</b></div>
      <div class="stat"><span>Привязок к проектам</span><b>${stats.bindingsTotal}</b></div>
      <div class="stat"><span>Рефов</span><b>${stats.refsTotal}</b></div>
      <div class="stat"><span>Не реф</span><b>${stats.nonRefsTotal}</b></div>
    </div>

    <section class="panel">
      <h2>Фильтры</h2>
      <p class="hint">Один пользователь — одна строка; проекты и реф-статус показаны в колонке «Проекты». Данные из SQLite (<code>data/giveaway.db</code>).</p>
      <form class="filters" method="get" action="/admin/users">
        <label>
          <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px">Бренд / проект</span>
          <select name="brand">
            <option value="">Все</option>
            ${brandOptions}
          </select>
        </label>
        <label>
          <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px">Реф организатора</span>
          <select name="refOwnerId">
            <option value="">Все</option>
            ${refOwnerOptions}
          </select>
        </label>
        <label>
          <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px">Статус</span>
          <select name="ref">
            <option value=""${filters.ref === "" ? " selected" : ""}>Все</option>
            <option value="ref"${filters.ref === "ref" ? " selected" : ""}>Только рефы</option>
            <option value="non-ref"${filters.ref === "non-ref" ? " selected" : ""}>Только не рефы</option>
          </select>
        </label>
        <label>
          <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px">Активность</span>
          <select name="activity">
            <option value=""${filters.activity === "" ? " selected" : ""}>Все</option>
            <option value="participated"${filters.activity === "participated" ? " selected" : ""}>Участвовали</option>
            <option value="won"${filters.activity === "won" ? " selected" : ""}>Побеждали</option>
            <option value="unpaid"${filters.activity === "unpaid" ? " selected" : ""}>Выиграли, но не выплачено</option>
            <option value="fraud"${filters.activity === "fraud" ? " selected" : ""}>С антифродом</option>
          </select>
        </label>
        <label>
          <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px">Поиск</span>
          <input type="search" name="q" value="${escapeHtml(filters.q)}" placeholder="ID, имя, @username" />
        </label>
        <button type="submit" class="btn btn-primary">Применить</button>
        <a class="btn btn-ghost" href="/admin/users">Сбросить</a>
      </form>
    </section>

    <section class="panel">
      <h2>Записи (${totalFiltered}${totalFiltered !== totalAll ? ` из ${totalAll}` : ""})</h2>
      <div class="users-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Пользователь</th>
            <th>Проекты</th>
            <th>Антифрод</th>
            <th>Кошелёк</th>
            ${renderSortHeader("Участия", "participations", filters)}
            ${renderSortHeader("Побед", "wins", filters)}
            ${renderSortHeader("Выигрыши", "winnings", filters)}
            ${renderSortHeader("Выплаты", "payouts", filters)}
          </tr>
        </thead>
        <tbody>${tableRows || "<tr><td colspan='8'>Нет записей по выбранным фильтрам</td></tr>"}</tbody>
      </table>
      </div>
      <div class="pager">
        <span>Страница ${page} из ${totalPages}</span>
        ${prevHref ? `<a class="btn btn-ghost" href="${prevHref}">← Назад</a>` : ""}
        ${nextHref ? `<a class="btn btn-ghost" href="${nextHref}">Вперёд →</a>` : ""}
      </div>
    </section>
  </main>
</body>
</html>`;
}

const ADMIN_NAV_ITEMS = [
  { id: "stats", href: "/admin/dashboard", label: "Статистика" },
  { id: "users", href: "/admin/users", label: "Юзеры" },
  { id: "support", href: "/admin/support", label: "Поддержка" },
];

function formatCardDate(iso, timezone) {
  if (!iso) {
    return "—";
  }
  const dt = DateTime.fromISO(iso, { zone: timezone });
  return dt.isValid ? dt.toFormat("dd.MM.yyyy HH:mm") : String(iso).slice(0, 16);
}

function renderUserCardPage(deps, card) {
  const tz = deps.timezone;
  const money = (rub, usd) => formatMoneyTotalsLocal(rub, usd, deps);

  const badges = [];
  if (card.fraud.length) {
    badges.push(`<span class="badge badge-danger">Антифрод: ${card.fraud.length}</span>`);
  }
  if (card.totals.awaitingPayout > 0) {
    badges.push(`<span class="badge badge-warn">Ждёт выплаты: ${card.totals.awaitingPayout}</span>`);
  }
  if (!card.known) {
    badges.push('<span class="badge badge-muted">Нет профиля</span>');
  }

  const drawRows = card.draws
    .map((draw) => {
      const outcome = draw.outcome
        ? `<span class="badge outcome-${escapeHtml(draw.outcome.tone)}">${escapeHtml(draw.outcome.label)}</span>`
        : '<span class="badge badge-muted">Участвовал</span>';
      const details = draw.outcome
        ? [
            draw.outcome.payoutPrize ? `к выплате ${escapeHtml(draw.outcome.payoutPrize)}` : "",
            draw.outcome.paidAt ? `выплачено ${escapeHtml(formatCardDate(draw.outcome.paidAt, tz))}` : "",
            draw.outcome.reason ? `причина: ${escapeHtml(draw.outcome.reason)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
      return `<tr>
        <td class="nowrap">${escapeHtml(formatCardDate(draw.at, tz))}</td>
        <td>${escapeHtml(draw.prize)}<div class="mono">${escapeHtml(draw.id)}</div></td>
        <td>${escapeHtml(draw.projectName)}</td>
        <td>${outcome}${details ? `<div class="hint" style="margin:4px 0 0">${details}</div>` : ""}</td>
        <td class="mono">${draw.outcome?.wallet ? escapeHtml(draw.outcome.wallet) : "—"}</td>
      </tr>`;
    })
    .join("");

  const projectRows = card.projects
    .map(
      (project) => `<tr>
        <td>${escapeHtml(project.projectName)}</td>
        <td>${renderRefStatusBadge(project.refStatus)}</td>
        <td>${escapeHtml(project.nickname || project.accountId || "—")}</td>
        <td class="mono">${escapeHtml(project.wallet || "—")}</td>
        <td class="nowrap">${escapeHtml(formatCardDate(project.updatedAt, tz))}</td>
      </tr>`,
    )
    .join("");

  const fraudItems = card.fraud
    .map((detail) => {
      const linked = (detail.linkedUserIds || [])
        .map(
          (id) =>
            `<a class="user-link" href="/admin/users/${encodeURIComponent(id)}">${escapeHtml(id)}</a>`,
        )
        .join(", ");
      return `<li><b>${escapeHtml(detail.label)}</b> — ${escapeHtml(detail.drawTitle || detail.drawId || "")}${
        linked ? `<br><span class="hint">связан с: ${linked}</span>` : ""
      }</li>`;
    })
    .join("");

  const supportRows = card.supportChats
    .map(
      (chat) => `<tr>
        <td><a class="user-link" href="/admin/support/${encodeURIComponent(chat.chatId)}">${escapeHtml(chat.botLabel)}</a></td>
        <td>${chat.sessionClosed ? '<span class="badge badge-muted">завершён</span>' : '<span class="badge badge-ok">активен</span>'}</td>
        <td>${chat.messageCount}</td>
        <td class="nowrap">${escapeHtml(formatCardDate(chat.lastMessageAt, tz))}</td>
        <td class="preview-cell">${escapeHtml(chat.preview || "")}</td>
      </tr>`,
    )
    .join("");

  const walletItems = card.wallets
    .map(
      (wallet) =>
        `<li class="mono">${escapeHtml(wallet.address)} <span class="hint">(${escapeHtml(wallet.source)})</span></li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(card.label)} — Admin</title>
  <style>
    ${getAdminBaseStyles()}
    .preview-cell { max-width: 320px; color: #cbd5e1; }
  </style>
</head>
<body>
  ${renderAdminTop(card.label, "users")}
  <main class="wrap wrap-wide">
    <p><a class="btn btn-ghost" href="/admin/users">← Все юзеры</a></p>

    <section class="panel">
      <div class="card-head">
        <div class="card-title">
          <h2>${escapeHtml(card.label)}</h2>
          <div class="hint mono">ID ${escapeHtml(card.userId)}${card.fullName ? ` · ${escapeHtml(card.fullName)}` : ""}</div>
        </div>
        <div class="card-badges">${badges.join("") || '<span class="badge badge-ok">Чисто</span>'}</div>
      </div>
    </section>

    <div class="grid">
      <div class="stat"><span>Участий</span><b>${card.totals.participations}</b></div>
      <div class="stat"><span>Побед</span><b>${card.totals.wins}</b></div>
      <div class="stat"><span>Выиграно</span><b>${escapeHtml(money(card.totals.winningsRub, card.totals.winningsUsd))}</b></div>
      <div class="stat"><span>Выплачено</span><b>${escapeHtml(money(card.totals.paidRub, card.totals.paidUsd))}</b></div>
      <div class="stat"><span>Ждёт выплаты</span><b>${card.totals.awaitingPayout}</b></div>
    </div>

    <section class="panel">
      <h2>Кошельки</h2>
      ${walletItems ? `<ul class="fraud-details">${walletItems}</ul>` : '<p class="empty">Кошелёк не указан.</p>'}
    </section>

    <section class="panel">
      <h2>Проекты</h2>
      ${
        projectRows
          ? `<table><thead><tr><th>Проект</th><th>Статус</th><th>Ник / ID</th><th>Кошелёк</th><th>Обновлён</th></tr></thead><tbody>${projectRows}</tbody></table>`
          : '<p class="empty">Нет привязок к проектам.</p>'
      }
    </section>

    <section class="panel">
      <h2>Розыгрыши (${card.draws.length})</h2>
      ${
        drawRows
          ? `<div class="users-table-wrap"><table><thead><tr><th>Дата</th><th>Приз</th><th>Проект</th><th>Итог</th><th>Кошелёк выплаты</th></tr></thead><tbody>${drawRows}</tbody></table></div>`
          : '<p class="empty">Не участвовал ни в одном розыгрыше.</p>'
      }
    </section>

    <section class="panel">
      <h2>Антифрод</h2>
      ${fraudItems ? `<ul class="fraud-details">${fraudItems}</ul>` : '<p class="empty">Отметок нет.</p>'}
    </section>

    <section class="panel">
      <h2>Поддержка</h2>
      ${
        supportRows
          ? `<table><thead><tr><th>Бот</th><th>Статус</th><th>Сообщ.</th><th>Последнее</th><th>Превью</th></tr></thead><tbody>${supportRows}</tbody></table>`
          : '<p class="empty">Обращений в поддержку не было.</p>'
      }
    </section>
  </main>
</body>
</html>`;
}

function renderAdminNotFound(message) {
  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Admin</title>
<style>${getAdminBaseStyles()}</style></head>
<body>
  ${renderAdminTop("Admin", "users")}
  <main class="wrap"><section class="panel"><p class="empty">${escapeHtml(message)}</p>
  <p><a class="btn btn-ghost" href="/admin/users">← Все юзеры</a></p></section></main>
</body>
</html>`;
}

function renderAdminNav(active = "stats") {
  const links = ADMIN_NAV_ITEMS.map((item) => {
    const cls = item.id === active ? "btn btn-ghost btn-nav-active" : "btn btn-ghost";
    return `<a class="${cls}" href="${item.href}">${escapeHtml(item.label)}</a>`;
  }).join("");
  return `<nav class="admin-nav">${links}</nav>`;
}

function renderAdminTop(title, active = "stats") {
  return `<header class="top">
    <h1>${escapeHtml(title)}</h1>
    <div class="top-actions">
      ${renderAdminNav(active)}
      <form method="post" action="/admin/logout" class="logout"><button type="submit" class="btn btn-ghost">Выйти</button></form>
    </div>
  </header>`;
}

function getAdminBaseStyles() {
  return `
    /* Dense dark, desktop first: this panel is read at night, on a big screen,
       and the job is to scan a lot of rows quickly rather than to look roomy. */
    :root {
      --bg: #0b0f17;
      --panel: #131926;
      --panel-2: #0f1523;
      --line: #212b3d;
      --line-soft: #1a2233;
      --text: #e6edf7;
      --muted: #8b98ad;
      --accent: #4f8cff;
      --ok-bg: #10331f; --ok-fg: #7ee2a8;
      --warn-bg: #3a2a10; --warn-fg: #f0c975;
      --danger-bg: #3a1618; --danger-fg: #ff9ea4;
      --muted-bg: #1c2434; --muted-fg: #a9b6c9;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    a { color: var(--accent); }

    .top {
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between;
      padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line);
      position: sticky; top: 0; z-index: 20;
    }
    .top h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: .2px; }
    .top-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .admin-nav { display: flex; gap: 4px; }
    .logout { margin: 0; }

    .wrap { padding: 14px 16px 40px; max-width: 1240px; margin: 0 auto; }
    .wrap-wide { max-width: 1720px; }

    .btn {
      display: inline-block; text-decoration: none; cursor: pointer;
      padding: 5px 10px; border-radius: 7px; font-size: 12.5px; line-height: 1.3;
      border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
    }
    .btn:hover { border-color: #33405a; }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #06101f; font-weight: 650; }
    .btn-ghost { background: transparent; }
    .btn-nav-active { background: #1d2739; border-color: #33405a; color: #fff; }
    .btn-danger { background: var(--danger-bg); border-color: #5a2429; color: var(--danger-fg); }

    select, input[type="search"], input[type="text"], input[type="password"], textarea {
      padding: 5px 8px; border-radius: 7px; font-size: 12.5px; font-family: inherit;
      border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
    }
    select:focus, input:focus, textarea:focus { outline: none; border-color: var(--accent); }

    /* Counters. The three headline numbers come first and are meant to be read
       from across the room; everything after them is context. */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }
    .grid-hero { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
    .stat {
      background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
    }
    .stat span { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .stat b { display: block; font-size: 20px; font-weight: 650; margin-top: 3px; letter-spacing: -.01em; }
    .stat-hero b { font-size: 30px; }
    .stat small { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }

    .panel {
      background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
      padding: 12px 14px; margin-bottom: 12px;
    }
    .panel h2 { margin: 0 0 10px; font-size: 12px; font-weight: 650; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
    .panel-flush { padding: 0; overflow: hidden; }
    .panel-flush h2 { padding: 10px 14px 0; margin-bottom: 8px; }
    .hint { color: var(--muted); font-size: 12px; margin: 0 0 10px; }
    .empty { color: var(--muted); font-size: 12.5px; padding: 14px; text-align: center; }

    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    thead th {
      position: sticky; top: 41px; z-index: 5;
      background: var(--panel-2); color: var(--muted);
      font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
      text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line);
    }
    tbody td { padding: 6px 10px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
    tbody tr:hover td { background: #161d2c; }
    tbody tr:last-child td { border-bottom: none; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

    .badge {
      display: inline-block; font-size: 10.5px; line-height: 1.6; padding: 1px 7px; border-radius: 999px;
      background: var(--muted-bg); color: var(--muted-fg); white-space: nowrap;
    }
    .badge-ok { background: var(--ok-bg); color: var(--ok-fg); }
    .badge-warn { background: var(--warn-bg); color: var(--warn-fg); }
    .badge-muted { background: var(--muted-bg); color: var(--muted-fg); }
    .badge-danger { background: var(--danger-bg); color: var(--danger-fg); }
    .outcome-ok { background: var(--ok-bg); color: var(--ok-fg); }
    .outcome-warn { background: var(--warn-bg); color: var(--warn-fg); }
    .outcome-danger { background: var(--danger-bg); color: var(--danger-fg); }
    .outcome-muted { background: var(--muted-bg); color: var(--muted-fg); }

    .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
    .filters label { display: block; }
    .filters label > span { display: block; font-size: 11px; color: var(--muted); margin-bottom: 3px; }

    .pager { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 14px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line-soft); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--muted); }
    .nowrap { white-space: nowrap; }
    .users-table-wrap { overflow-x: auto; }
    .users-table-wrap > table { min-width: 980px; }

    .user-link { color: var(--accent); text-decoration: none; font-weight: 600; }
    .user-link:hover { text-decoration: underline; }
    .user-projects { display: flex; flex-wrap: wrap; gap: 3px; }
    .project-chip { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: var(--muted-bg); color: var(--muted-fg); white-space: nowrap; }
    .project-chip-ref { background: var(--ok-bg); color: var(--ok-fg); }
    .project-chip-non-ref { background: var(--warn-bg); color: var(--warn-fg); }
    .project-chip-more { background: transparent; border: 1px solid var(--line); color: var(--muted); }
    .owner-line { margin-top: 3px; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fraud-badges { display: flex; flex-wrap: wrap; gap: 3px; }
    .fraud-details { margin: 3px 0 0; padding-left: 15px; color: var(--muted); font-size: 11.5px; }
    .fraud-details li { margin-bottom: 2px; }
    .fraud-panel { display: flex; flex-direction: column; gap: 6px; max-width: 420px; }

    .card-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    .card-title h2 { margin: 0; font-size: 18px; color: var(--text); text-transform: none; letter-spacing: 0; }
    .card-badges { display: flex; flex-wrap: wrap; gap: 5px; }
  `;
}

function renderLoginPage(error = "") {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin — вход</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 24px;
    }
    .card {
      width: 100%; max-width: 400px; background: #1e293b; border-radius: 16px;
      padding: 28px; border: 1px solid #334155;
    }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 20px; color: #94a3b8; font-size: 14px; }
    label { display: block; font-size: 13px; margin-bottom: 6px; color: #cbd5e1; }
    input {
      width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #475569;
      background: #0f172a; color: #f8fafc; margin-bottom: 14px; font-size: 15px;
    }
    button {
      width: 100%; padding: 12px; border: 0; border-radius: 10px;
      background: #3b82f6; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer;
    }
    .err { background: #450a0a; color: #fecaca; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; font-size: 14px; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/admin/login">
    <h1>RollerBot Admin</h1>
    <p>Статистика и база розыгрышей</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
    <label>Логин</label>
    <input name="login" autocomplete="username" required />
    <label>Пароль</label>
    <input name="password" type="password" autocomplete="current-password" required />
    <button type="submit">Войти</button>
  </form>
</body>
</html>`;
}

function renderDashboardPage(deps, stats, organizers, selectedOwner, userProfiles, period) {
  const ownerOptions = organizers
    .map(
      (o) =>
        `<option value="${escapeHtml(o.id)}"${o.id === selectedOwner ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");

  const periodTabs = stats.periods
    .map((item) => {
      const query = new URLSearchParams();
      if (selectedOwner) query.set("ownerId", selectedOwner);
      if (item.id !== "30") query.set("period", item.id);
      const href = query.toString() ? `/admin/dashboard?${query}` : "/admin/dashboard";
      const cls = item.id === stats.period.id ? "btn btn-ghost btn-nav-active" : "btn btn-ghost";
      return `<a class="${cls}" href="${href}">${escapeHtml(item.label)}</a>`;
    })
    .join("");

  const brandRows = stats.breakdowns.brands
    .map(
      ([name, count]) =>
        `<tr><td>${escapeHtml(name)}</td><td class="num">${count}</td></tr>`,
    )
    .join("");

  const orgRows = stats.organizerRows
    .map((row) => {
      const label = labelForUser(row.id, userProfiles);
      const query = new URLSearchParams({ ownerId: row.id });
      if (stats.period.id !== "30") query.set("period", stats.period.id);
      return `<tr>
        <td><a class="user-link" href="/admin/dashboard?${query}">${escapeHtml(label)}</a></td>
        <td class="num">${row.draws}</td>
        <td class="num">${row.referrals}</td>
      </tr>`;
    })
    .join("");

  const payload = JSON.stringify({
    labels: stats.series.labels.map((day) => day.slice(5)),
    newUsers: stats.series.newUsers,
    totalUsers: stats.series.totalUsers,
    newParticipants: stats.series.newParticipants,
    totalParticipants: stats.series.totalParticipants,
    joins: stats.series.joins,
    draws: stats.series.draws,
    status: stats.breakdowns.status,
    prizeTypes: stats.breakdowns.prizeTypes,
    brands: stats.breakdowns.brands.slice(0, 6),
    referrals: stats.breakdowns.referrals,
  });

  const participantShare = stats.totals.users
    ? Math.round((stats.totals.participants / stats.totals.users) * 100)
    : 0;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RollerBot — Admin</title>
  <style>
    ${getAdminBaseStyles()}
    .charts-row { display: grid; gap: 10px; margin-bottom: 12px; }
    .charts-2 { grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); }
    .charts-3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .chart-card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
    .chart-card h3 { margin: 0 0 8px; font-size: 11px; font-weight: 650; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
    .chart-box { position: relative; height: 240px; }
    .chart-box-sm { height: 190px; }
    .period-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
  ${renderAdminTop("Статистика", "stats")}
  <main class="wrap wrap-wide">

    <div class="toolbar">
      <div class="period-tabs">${periodTabs}</div>
      <form method="get" action="/admin/dashboard" class="filters">
        <input type="hidden" name="period" value="${escapeHtml(stats.period.id)}" />
        <label>
          <span>Организатор</span>
          <select name="ownerId" onchange="this.form.submit()">
            <option value="">Все организаторы</option>
            ${ownerOptions}
          </select>
        </label>
      </form>
    </div>

    <div class="grid grid-hero">
      <div class="stat stat-hero">
        <span>Пользователей в боте</span><b>${stats.totals.users}</b>
        <small>всего известных боту</small>
      </div>
      <div class="stat stat-hero">
        <span>Участников</span><b>${stats.totals.participants}</b>
        <small>хотя бы один розыгрыш · ${participantShare}% от всех</small>
      </div>
      <div class="stat stat-hero">
        <span>Розыгрышей</span><b>${stats.totals.draws}</b>
        <small>активных ${stats.totals.active} · завершённых ${stats.totals.finished}</small>
      </div>
    </div>

    <div class="grid">
      <div class="stat"><span>Победителей</span><b>${stats.totals.winners}</b><small>уникальных людей</small></div>
      <div class="stat"><span>Побед всего</span><b>${stats.totals.wins}</b><small>с повторными</small></div>
      <div class="stat"><span>С кошельком</span><b>${stats.totals.withWallet}</b><small>указан TRC-20</small></div>
    </div>

    <div class="charts-row charts-2">
      <div class="chart-card">
        <h3>Рост пользователей</h3>
        <div class="chart-box"><canvas id="usersChart"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Рост участников</h3>
        <div class="chart-box"><canvas id="participantsChart"></canvas></div>
      </div>
    </div>

    <div class="charts-row charts-2">
      <div class="chart-card">
        <h3>Розыгрышей создано</h3>
        <div class="chart-box"><canvas id="drawsChart"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Вступлений в розыгрыши</h3>
        <div class="chart-box"><canvas id="joinsChart"></canvas></div>
      </div>
    </div>

    <div class="charts-row charts-3">
      <div class="chart-card">
        <h3>Статусы розыгрышей</h3>
        <div class="chart-box chart-box-sm"><canvas id="statusChart"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Типы призов</h3>
        <div class="chart-box chart-box-sm"><canvas id="prizeChart"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Реф-статус пользователей</h3>
        <div class="chart-box chart-box-sm"><canvas id="refChart"></canvas></div>
      </div>
    </div>

    <div class="charts-row charts-2">
      <div class="panel panel-flush">
        <h2>Розыгрышей по брендам</h2>
        <table>
          <thead><tr><th>Бренд</th><th class="num">Розыгрышей</th></tr></thead>
          <tbody>${brandRows || '<tr><td colspan="2"><p class="empty">Нет данных.</p></td></tr>'}</tbody>
        </table>
      </div>
      <div class="panel panel-flush">
        <h2>Организаторы</h2>
        <table>
          <thead><tr><th>Организатор</th><th class="num">Розыгрышей</th><th class="num">Рефералов</th></tr></thead>
          <tbody>${orgRows || '<tr><td colspan="3"><p class="empty">Нет данных.</p></td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </main>

  <script>
    const D = ${payload};
    const GRID = "rgba(148,163,184,.12)";
    const TICK = "#8b98ad";
    Chart.defaults.color = TICK;
    Chart.defaults.font.size = 11;
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";

    const lineOpts = (leftTitle, rightTitle) => ({
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
      scales: {
        x: { grid: { color: GRID }, ticks: { maxRotation: 0, autoSkipPadding: 16 } },
        y: { position: "left", beginAtZero: true, grid: { color: GRID }, title: { display: true, text: leftTitle } },
        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: rightTitle } },
      },
    });

    const growth = (canvasId, newData, totalData, newLabel, totalLabel) =>
      new Chart(document.getElementById(canvasId), {
        data: {
          labels: D.labels,
          datasets: [
            { type: "bar", label: newLabel, data: newData, yAxisID: "y",
              backgroundColor: "rgba(79,140,255,.45)", borderColor: "#4f8cff", borderWidth: 1, borderRadius: 2 },
            { type: "line", label: totalLabel, data: totalData, yAxisID: "y1",
              borderColor: "#7ee2a8", backgroundColor: "rgba(126,226,168,.12)",
              borderWidth: 2, pointRadius: 0, tension: .3, fill: true },
          ],
        },
        options: lineOpts(newLabel, totalLabel),
      });

    growth("usersChart", D.newUsers, D.totalUsers, "Новые", "Всего");
    growth("participantsChart", D.newParticipants, D.totalParticipants, "Новые", "Всего");

    const bars = (canvasId, data, label, color) =>
      new Chart(document.getElementById(canvasId), {
        type: "bar",
        data: { labels: D.labels, datasets: [{ label, data, backgroundColor: color, borderRadius: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: GRID }, ticks: { maxRotation: 0, autoSkipPadding: 16 } },
            y: { beginAtZero: true, grid: { color: GRID } },
          },
        },
      });

    bars("drawsChart", D.draws, "Розыгрышей", "rgba(240,201,117,.7)");
    bars("joinsChart", D.joins, "Вступлений", "rgba(79,140,255,.6)");

    const PIE = ["#4f8cff", "#7ee2a8", "#f0c975", "#ff9ea4", "#b48ef0", "#67d5e0"];
    const donut = (canvasId, labels, values) =>
      new Chart(document.getElementById(canvasId), {
        type: "doughnut",
        data: { labels, datasets: [{ data: values, backgroundColor: PIE, borderColor: "#131926", borderWidth: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "58%",
          plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 10 } } },
        },
      });

    donut("statusChart", ["Активные", "Завершённые", "Запланированные", "Черновики"],
      [D.status.active || 0, D.status.finished || 0, D.status.scheduled || 0, D.status.draft || 0]);
    donut("prizeChart", D.prizeTypes.map(x => x[0]), D.prizeTypes.map(x => x[1]));
    donut("refChart", ["Рефы", "Не рефы", "Не определено"],
      [D.referrals.refs, D.referrals.nonRefs, D.referrals.unknown]);
  </script>
</body>
</html>`;
}

function renderSupportListPage(view, timezone) {
  const params = (overrides = {}) => {
    const query = new URLSearchParams();
    const tab = overrides.tab ?? view.activeTab;
    const q = overrides.q ?? view.query;
    const page = overrides.page ?? 1;
    if (tab && tab !== "attention") query.set("tab", tab);
    if (q) query.set("q", q);
    if (page > 1) query.set("page", String(page));
    const text = query.toString();
    return text ? `/admin/support?${text}` : "/admin/support";
  };

  const tabs = view.tabs
    .map((tab) => {
      const counts = {
        attention: view.summary.attention,
        open: view.summary.open,
        errors: view.summary.withErrors,
        closed: view.summary.total - view.summary.open,
        all: view.summary.total,
      };
      const cls = tab.id === view.activeTab ? "btn btn-ghost btn-nav-active" : "btn btn-ghost";
      return `<a class="${cls}" href="${params({ tab: tab.id })}">${escapeHtml(tab.label)} <span class="tab-count">${counts[tab.id] ?? 0}</span></a>`;
    })
    .join("");

  const rows = view.rows
    .map((chat) => {
      const time = formatMessageTime(chat.lastMessageAt, timezone);
      const flags = chat.flags.length
        ? chat.flags
            .map((flag) => `<span class="badge outcome-${escapeHtml(flag.tone)}">${escapeHtml(flag.label)}</span>`)
            .join(" ")
        : '<span class="badge badge-ok">Норм</span>';
      return `<tr>
        <td>
          <a href="/admin/support/${encodeURIComponent(chat.chatId)}">${escapeHtml(chat.name || chat.label)}</a>
          <div class="mono"><a class="user-link" href="/admin/users/${encodeURIComponent(chat.chatId)}">${escapeHtml(chat.chatId)}</a></div>
        </td>
        <td class="nowrap">${escapeHtml(chat.botLabel || "—")}</td>
        <td><div class="fraud-badges">${flags}</div></td>
        <td class="preview-cell">${escapeHtml(chat.preview || "")}</td>
        <td>${chat.messageCount}</td>
        <td class="nowrap">${escapeHtml(time)}</td>
      </tr>`;
    })
    .join("");

  const prevHref = view.page > 1 ? params({ page: view.page - 1 }) : "";
  const nextHref = view.page < view.totalPages ? params({ page: view.page + 1 }) : "";

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Поддержка — Admin</title>
  <style>
    ${getAdminBaseStyles()}
    .support-table a { color: #93c5fd; text-decoration: none; }
    .support-table a:hover { text-decoration: underline; }
    .preview-cell { color: #cbd5e1; }
    .tab-count { opacity: 0.65; font-size: 12px; }
    /* Inside a horizontally scrolling wrapper: below this width the columns
       crushed into each other instead of letting the table scroll. */
    .support-table { table-layout: fixed; min-width: 900px; }
    .support-table th:nth-child(1), .support-table td:nth-child(1) { width: 20%; }
    .support-table th:nth-child(2), .support-table td:nth-child(2) { width: 9%; }
    .support-table th:nth-child(3), .support-table td:nth-child(3) { width: 20%; }
    .support-table th:nth-child(4), .support-table td:nth-child(4) { width: 33%; }
    .support-table th:nth-child(5), .support-table td:nth-child(5) { width: 7%; }
    .support-table th:nth-child(6), .support-table td:nth-child(6) { width: 11%; }
    .support-table td { overflow-wrap: anywhere; }
    .support-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .support-search { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .support-search input[type="search"] { flex: 1; min-width: 220px; }
  </style>
</head>
<body>
  ${renderAdminTop("Поддержка", "support")}
  <main class="wrap wrap-wide">
    <div class="grid">
      <div class="stat"><span>Всего диалогов</span><b>${view.summary.total}</b></div>
      <div class="stat"><span>Требуют внимания</span><b>${view.summary.attention}</b></div>
      <div class="stat"><span>Живых</span><b>${view.summary.open}</b></div>
      <div class="stat"><span>Со сбоями AI</span><b>${view.summary.withErrors}</b></div>
    </div>

    <section class="panel">
      <div class="support-tabs">${tabs}</div>
      <form class="support-search" method="get" action="/admin/support">
        <input type="hidden" name="tab" value="${escapeHtml(view.activeTab)}" />
        <input type="search" name="q" value="${escapeHtml(view.query)}" placeholder="Поиск по тексту переписки, имени или ID…" />
        <button class="btn btn-primary" type="submit">Найти</button>
        ${view.query ? `<a class="btn btn-ghost" href="${params({ q: "" })}">Сбросить</a>` : ""}
      </form>

      <div class="users-table-wrap">
        <table class="support-table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Бот</th>
              <th>Метки</th>
              <th>Последнее сообщение</th>
              <th>Сообщ.</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6"><p class="empty">Ничего не найдено.</p></td></tr>`}</tbody>
        </table>
      </div>

      <div class="pager">
        <span>Показано ${view.rows.length} из ${view.totalFiltered} · страница ${view.page} из ${view.totalPages}</span>
        ${prevHref ? `<a class="btn btn-ghost" href="${prevHref}">← Назад</a>` : ""}
        ${nextHref ? `<a class="btn btn-ghost" href="${nextHref}">Вперёд →</a>` : ""}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function roleLabel(role, kind) {
  if (role === "user") return "Пользователь";
  if (kind === "greeting") return "Приветствие";
  if (kind === "escalation") return "Эскалация";
  if (kind === "off_hours") return "Вне часов";
  if (kind === "idle_close") return "Закрытие";
  if (kind === "closed") return "Завершён (/stop)";
  if (kind === "admin") return "Админ (панель)";
  if (kind === "media") return "Медиа";
  if (kind === "error") return "Ошибка AI";
  return "Бот";
}

function renderSupportChatPage(chatId, state, timezone, options = {}) {
  const transcript = getChatTranscript(state);
  const label = formatSupportChatUser(state, chatId);
  const agentName = state.agentName || "—";
  const sessionClosed = Boolean(state.sessionClosed);
  const status = sessionClosed ? "завершён — пользователю нужен /start" : "активен";
  const flash = options.flash || "";
  const flashHtml = flash
    ? `<div class="flash ${flash.type === "error" ? "flash-error" : "flash-ok"}">${escapeHtml(flash.text)}</div>`
    : "";

  const messages = transcript
    .map((msg) => {
      let role = msg.role === "user" ? "user" : msg.role === "system" ? "system" : "assistant";
      if (msg.kind === "admin") {
        role = "admin";
      }
      const css =
        role === "user"
          ? "chat-msg-user"
          : role === "admin"
            ? "chat-msg-admin"
            : role === "system"
              ? "chat-msg-system"
              : "chat-msg-assistant";
      const meta = `${roleLabel(msg.role, msg.kind)} · ${formatMessageTime(msg.at, timezone)}`;
      return `<div class="chat-msg ${css}">${escapeHtml(msg.content)}<span class="chat-msg-meta">${escapeHtml(meta)}</span></div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(label)} — Поддержка</title>
  <style>
    ${getAdminBaseStyles()}
    .wrap { max-width: 900px; }
    .chat-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; font-size: 13px; color: #94a3b8; }
    .chat-close-bar { margin: 0 0 12px; }
    .chat-close-bar .btn-danger { width: 100%; padding: 12px 16px; font-size: 15px; font-weight: 600; }
    .chat-log { display: flex; flex-direction: column; gap: 10px; max-height: 70vh; overflow: auto; padding: 12px; background: #0f172a; border-radius: 12px; border: 1px solid #334155; }
    .chat-msg { max-width: 85%; padding: 10px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
    .chat-msg-user { align-self: flex-end; background: #1d4ed8; color: #eff6ff; border-bottom-right-radius: 4px; }
    .chat-msg-assistant { align-self: flex-start; background: #334155; color: #f1f5f9; border-bottom-left-radius: 4px; }
    .chat-msg-admin { align-self: flex-start; background: #14532d; color: #dcfce7; border-bottom-left-radius: 4px; border: 1px solid #22c55e; }
    .chat-msg-system { align-self: center; background: #422006; color: #fde68a; font-size: 12px; max-width: 95%; text-align: center; }
    .chat-msg-meta { display: block; margin-top: 6px; font-size: 11px; opacity: 0.75; }
    .chat-compose { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
    .chat-compose textarea {
      width: 100%; min-height: 88px; padding: 12px 14px; border-radius: 10px;
      border: 1px solid #475569; background: #0f172a; color: #f8fafc; font-size: 14px;
      font-family: inherit; resize: vertical;
    }
    .chat-compose-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .btn-primary { background: #3b82f6; border-color: #3b82f6; color: #fff; cursor: pointer; }
    .btn-danger { background: #7f1d1d; border-color: #b91c1c; color: #fecaca; cursor: pointer; }
    .flash { padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 14px; }
    .flash-ok { background: #14532d; color: #bbf7d0; }
    .flash-error { background: #450a0a; color: #fecaca; }
    .compose-hint { font-size: 12px; color: #94a3b8; margin: 0; }
  </style>
</head>
<body>
  ${renderAdminTop("Диалог", "support")}
  <main class="wrap">
    <p>
      <a class="btn btn-ghost" href="/admin/support">← Все диалоги</a>
      <a class="btn btn-ghost" href="/admin/users/${encodeURIComponent(chatId)}">Карточка пользователя →</a>
    </p>
    <section class="panel">
      <h2 style="margin:0 0 8px">${escapeHtml(label)}</h2>
      ${options.storeLabel ? `<p class="hint">Бот: ${escapeHtml(options.storeLabel)}</p>` : ""}
      ${
        sessionClosed
          ? ""
          : `<form method="post" action="/admin/support/${encodeURIComponent(chatId)}/close" class="chat-close-bar" onsubmit="return confirm('Завершить диалог? Пользователю уйдёт сообщение с /start.');">
        <button type="submit" class="btn btn-danger">Завершить диалог</button>
      </form>`
      }
      <div class="chat-meta">
        <span>Оператор: <b>${escapeHtml(agentName)}</b></span>
        <span>Статус: <b>${escapeHtml(status)}</b></span>
        <span>Chat ID: <b>${escapeHtml(chatId)}</b></span>
      </div>
      ${flashHtml}
      <div class="chat-log" id="chatLog">${messages || '<div class="chat-msg chat-msg-system">Сообщений пока нет</div>'}</div>
      ${
        options.canReply === false
          ? `<p class="compose-hint">Диалог второго бота поддержки — доступен только для чтения.</p>`
          : sessionClosed
          ? `<p class="compose-hint">Диалог завершён. Пользователь получил сообщение с просьбой нажать /start для нового оператора.</p>`
          : `<form class="chat-compose" method="post" action="/admin/support/${encodeURIComponent(chatId)}/reply">
        <label class="compose-hint" for="replyText">Сообщение уйдёт пользователю в Telegram от support-бота. AI-бот продолжает отвечать как обычно.</label>
        <textarea id="replyText" name="text" required placeholder="Напишите ответ…"></textarea>
        <div class="chat-compose-actions">
          <button type="submit" class="btn btn-primary">Отправить</button>
          <button type="submit" formaction="/admin/support/${encodeURIComponent(chatId)}/close" formmethod="post" class="btn btn-danger" formnovalidate onclick="return confirm('Завершить диалог? Пользователю уйдёт сообщение с /start.');">Завершить диалог</button>
        </div>
      </form>`
      }
    </section>
  </main>
  <script>
    const log = document.getElementById("chatLog");
    if (log) log.scrollTop = log.scrollHeight;
  </script>
</body>
</html>`;
}

function registerAdminDashboard(app, deps) {
  const login = (process.env.ADMIN_DASHBOARD_LOGIN || "admin").trim();
  const passwordPlain = process.env.ADMIN_DASHBOARD_PASSWORD || "";
  const passwordHash = passwordPlain ? hashPassword(passwordPlain) : "";

  const auth = createAdminAuth({
    login,
    passwordHash,
    botToken: deps.botToken,
    cookieSecure: deps.cookieSecure,
  });

  function requireAuth(req, res, next) {
    if (!passwordHash) {
      res.status(503).type("html").send(renderLoginPage("Задайте ADMIN_DASHBOARD_PASSWORD в .env на сервере."));
      return;
    }
    if (!auth.isAuthed(req)) {
      res.redirect(302, "/admin/login");
      return;
    }
    next();
  }

  app.get("/admin", (_req, res) => {
    res.redirect(302, "/admin/dashboard");
  });

  app.get("/admin/login", (req, res) => {
    if (auth.isAuthed(req)) {
      res.redirect(302, "/admin/dashboard");
      return;
    }
    res.type("html").send(renderLoginPage());
  });

  app.post("/admin/login", (req, res) => {
    const username = String(req.body?.login || "").trim();
    const password = String(req.body?.password || "");
    if (!auth.checkCredentials(username, password)) {
      res.status(401).type("html").send(renderLoginPage("Неверный логин или пароль."));
      return;
    }
    auth.setCookie(res);
    res.redirect(302, "/admin/dashboard");
  });

  app.post("/admin/logout", (req, res) => {
    auth.clearCookie(res);
    res.redirect(302, "/admin/login");
  });

  app.get("/admin/dashboard", requireAuth, (req, res) => {
    try {
      const selectedOwner = String(req.query.ownerId || "").trim();
      const period = String(req.query.period || "30").trim();
      const profiles = deps.readUserProjectProfiles() || { users: {} };
      const delegated = deps.readDelegatedAdmins()?.admins || [];
      const allDraws = collectAllDraws(deps);
      const organizers = collectOrganizerOptions(allDraws, deps.adminIds, delegated, profiles);

      const stats = buildDashboardStats(deps, { ownerFilter: selectedOwner, period });

      // Built here rather than in the stats module: counting an organiser's
      // referrals needs the project list and the label lookup this file owns.
      const projectsData = deps.readProjects() || { projects: [] };
      const drawsByOwner = new Map();
      const scopedDraws = selectedOwner
        ? allDraws.filter((draw) => String(draw.ownerId || "") === selectedOwner)
        : allDraws;
      for (const draw of scopedDraws) {
        const key = String(draw.ownerId || "unknown");
        drawsByOwner.set(key, (drawsByOwner.get(key) || 0) + 1);
      }
      stats.organizerRows = [...drawsByOwner.entries()]
        .map(([id, draws]) => ({
          id,
          draws,
          referrals: id === "unknown" ? 0 : countReferralsForOwner(id, projectsData, profiles),
        }))
        .sort((left, right) => right.draws - left.draws)
        .slice(0, 20);

      res.type("html").send(
        renderDashboardPage(deps, stats, organizers, selectedOwner, profiles, period),
      );
    } catch (error) {
      console.error("[admin] GET /admin/dashboard:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось загрузить статистику."));
    }
  });

  app.get("/admin/users", requireAuth, (req, res) => {
    const filters = {
      brand: String(req.query.brand || "").trim(),
      refOwnerId: String(req.query.refOwnerId || "").trim(),
      ref: String(req.query.ref || "").trim(),
      activity: String(req.query.activity || "").trim(),
      q: String(req.query.q || "").trim(),
      sort: String(req.query.sort || "").trim(),
      dir: String(req.query.dir || "desc").trim(),
    };
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);

    const projectsList = deps.readProjects().projects || [];
    const profiles = deps.readUserProjectProfiles();
    const activityIndex = buildUserProjectActivityIndex(deps, profiles, (userId) =>
      labelForUser(userId, profiles),
    );
    // Built once and handed on: this walks every user profile, and the page used
    // to walk them twice.
    const projectRows = buildAdminUserProjectRows(deps);
    const bindingRows = projectRows.filter((row) => row.projectId);
    const allRows = sortAdminUserRows(
      buildAdminUserRows(deps, activityIndex, projectRows),
      filters.sort,
      filters.dir,
    );
    const filteredRows = filterAdminUserRows(allRows, filters);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / USERS_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * USERS_PAGE_SIZE;
    const pageRows = filteredRows.slice(offset, offset + USERS_PAGE_SIZE);

    const stats = {
      usersTotal: Object.keys(profiles.users || {}).length,
      bindingsTotal: bindingRows.length,
      refsTotal: bindingRows.filter((row) => row.refStatus === "ref").length,
      nonRefsTotal: bindingRows.filter((row) => row.refStatus === "non-ref").length,
    };

    res.type("html").send(
      renderUsersPage(deps, {
        rows: pageRows,
        page: safePage,
        totalPages,
        totalFiltered: filteredRows.length,
        totalAll: allRows.length,
        filters,
        brands: collectBrandOptions(projectsList),
        refOwners: collectReferralOwnerOptions(allRows),
        stats,
      }),
    );
  });

  app.get("/admin/users/:userId", requireAuth, (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!/^\d+$/.test(userId)) {
      res.status(404).type("html").send(renderAdminNotFound("Пользователь не найден."));
      return;
    }

    try {
      const profiles = deps.readUserProjectProfiles();
      const activityIndex = buildUserProjectActivityIndex(deps, profiles, (id) =>
        labelForUser(id, profiles),
      );

      const fraudDetails = [];
      const seen = new Set();
      for (const { userId: activityUserId, projectId } of listActivityKeys(activityIndex)) {
        if (activityUserId !== userId) {
          continue;
        }
        for (const detail of getUserProjectActivity(activityIndex, userId, projectId).fraudDetails) {
          const key = `${detail.kind}:${detail.drawId}:${detail.label}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          fraudDetails.push(detail);
        }
      }

      const supportChats = [];
      for (const store of SUPPORT_STORES) {
        const state = readSupportChatsFor(store.key)[userId];
        if (!state) {
          continue;
        }
        const transcript = getChatTranscript(state);
        supportChats.push({
          chatId: userId,
          botLabel: store.label,
          sessionClosed: Boolean(state.sessionClosed),
          messageCount: transcript.length,
          lastMessageAt: state.lastMessageAt || transcript[transcript.length - 1]?.at || "",
          preview: transcript[transcript.length - 1]?.content || "",
        });
      }

      const card = buildUserCard(deps, userId, { fraudDetails, supportChats });
      res.type("html").send(renderUserCardPage(deps, card));
    } catch (error) {
      console.error("[admin] GET /admin/users/:userId:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать карточку пользователя."));
    }
  });

  app.get("/admin/support", requireAuth, (req, res) => {
    // Both bots, not just the first one.
    const chats = SUPPORT_STORES.flatMap((store) => {
      const raw = readSupportChatsFor(store.key);
      return listSupportChats(raw).map((chat) => ({
        ...chat,
        botLabel: store.label,
        transcript: getChatTranscript(raw[chat.chatId] || {}),
      }));
    });

    const view = buildSupportView(chats, {
      tab: String(req.query.tab || "attention"),
      query: String(req.query.q || ""),
      page: Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1),
    });
    res.type("html").send(renderSupportListPage(view, deps.timezone));
  });

  function renderSupportChatView(res, chatId, flash) {
    // The second support bot writes to its own store, and the panel used to look
    // only in the first one, so those conversations 404'd.
    const found = findSupportChatAnywhere(chatId);
    const state = found?.state;
    if (!state) {
      res.status(404).type("html").send(`<!doctype html><html lang="ru"><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px"><p>Диалог не найден.</p><p><a href="/admin/support" style="color:#93c5fd">← К списку</a></p></body></html>`);
      return false;
    }
    res.type("html").send(
      renderSupportChatPage(chatId, state, deps.timezone, {
        flash,
        storeLabel: found.store.label,
        canReply: found.store.canReply,
      }),
    );
    return true;
  }

  app.get("/admin/support/:chatId", requireAuth, (req, res) => {
    const chatId = String(req.params.chatId || "").trim();
    const flash =
      req.query.sent === "1"
        ? { type: "ok", text: "Сообщение отправлено в Telegram." }
        : req.query.closed === "1"
            ? { type: "ok", text: "Диалог завершён. Пользователю отправлено сообщение с /start." }
            : null;
    renderSupportChatView(res, chatId, flash);
  });

  app.post("/admin/support/:chatId/reply", requireAuth, async (req, res) => {
    const chatId = String(req.params.chatId || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!text) {
      renderSupportChatView(res, chatId, { type: "error", text: "Введите текст сообщения." });
      return;
    }
    if (!deps.supportBotToken) {
      renderSupportChatView(res, chatId, {
        type: "error",
        text: "SUPPORT_BOT_TOKEN не задан в .env — отправка в Telegram недоступна.",
      });
      return;
    }

    try {
      await sendSupportBotMessage(deps.supportBotToken, chatId, text);
      updateSupportChat(chatId, (state) => {
        delete state.adminHold;
        state.hasUserMessage = true;
        appendTranscript(state, { role: "assistant", content: text, kind: "admin" });
        const history = Array.isArray(state.history) ? state.history : [];
        history.push({ role: "assistant", content: text });
        state.history = history.slice(-16);
      });
      res.redirect(302, `/admin/support/${encodeURIComponent(chatId)}?sent=1`);
    } catch (error) {
      renderSupportChatView(res, chatId, {
        type: "error",
        text: `Не удалось отправить: ${error.message}`,
      });
    }
  });

  app.post("/admin/support/:chatId/close", requireAuth, async (req, res) => {
    const chatId = String(req.params.chatId || "").trim();
    if (!deps.supportBotToken) {
      renderSupportChatView(res, chatId, {
        type: "error",
        text: "SUPPORT_BOT_TOKEN не задан в .env — завершение диалога недоступно.",
      });
      return;
    }

    try {
      await closeSupportChatFromAdmin(deps.supportBotToken, chatId);
      res.redirect(302, `/admin/support/${encodeURIComponent(chatId)}?closed=1`);
    } catch (error) {
      renderSupportChatView(res, chatId, {
        type: "error",
        text:
          error.code === "not_found"
            ? "Диалог не найден."
            : `Не удалось завершить: ${error.message}`,
      });
    }
  });
}

module.exports = {
  registerAdminDashboard,
  hashPassword,
  // Exported for tests: these decide what the users page actually shows.
  buildAdminUserProjectRows,
  buildAdminUserRows,
  sortAdminUserRows,
  filterAdminUserRows,
};
