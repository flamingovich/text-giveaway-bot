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
const UI = require("./admin-ui");
const F = require("./admin-format");
const SYS = require("./admin-system");
const {
  readSupportChats,
  updateSupportChat,
  sendSupportBotMessage,
  closeSupportChatFromAdmin,
  appendTranscript,
  getChatTranscript,
  formatSupportChatUser,
  formatSupportChatName,
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

function emptyProjectRow(userId, userLabel, userName = userLabel, identity = null) {
  return {
    userId,
    userLabel,
    userName,
    identity: identity || F.identityOf(userId, {}),
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
      rows.push(
        emptyProjectRow(
          userId,
          userLabel,
          displayNameForUser(userId, profiles),
          F.identityOf(userId, userNode.meta || {}),
        ),
      );
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
        identity: F.identityOf(userId, profiles.users?.[String(userId)]?.meta || {}),
        projectId,
        projectName: project.name,
        brandKey: normalizeProjectBrandName(project.name),
        refStatus,
        referralOwnerId: referralOwnerId ? String(referralOwnerId) : "",
        referralOwnerLabel: referralOwnerId ? displayNameForUser(String(referralOwnerId), profiles) : "—",
        projectOwnerId: project.ownerId != null ? String(project.ownerId) : "",
        projectOwnerLabel:
          project.ownerId != null ? displayNameForUser(String(project.ownerId), profiles) : "—",
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
        emptyProjectRow(
          userId,
          labelForUser(userId, profiles),
          displayNameForUser(userId, profiles),
          F.identityOf(userId, profiles.users?.[String(userId)]?.meta || {}),
        ),
      );
      continue;
    }
    const project = projectById.get(resolveProjectId(projectId)) || missingProject(projectId);
    projectRows.push({
      userId,
      userLabel: labelForUser(userId, profiles),
      userName: displayNameForUser(userId, profiles),
      identity: F.identityOf(userId, profiles.users?.[String(userId)]?.meta || {}),
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
        identity: row.identity,
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
      identity: row.identity,
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
    return '<span class="chip chip-ok">реф</span>';
  }
  if (refStatus === "non-ref") {
    return '<span class="chip chip-warn">не реф</span>';
  }
  return '<span class="chip chip-muted">—</span>';
}

const PROJECTS_SHOWN_IN_CELL = 3;

// One user can carry eight project bindings, and printing each with its own
// referral-owner line turned a single row into half a screen of repeated text.
// The cell summarises; the user's own page has the full list.
function renderUserProjectsCell(projects) {
  const named = projects.filter((project) => project.projectId);
  if (named.length === 0) {
    return '<span class="chip chip-muted">без проекта</span>';
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
        `<span class="chip chip-${project.refStatus === "ref" ? "ok" : project.refStatus === "non-ref" ? "warn" : "muted"}">${escapeHtml(project.projectName)}</span>`,
    )
    .join("");

  const rest = Math.max(0, live.length - PROJECTS_SHOWN_IN_CELL);
  const more = rest > 0 ? `<span class="chip">+${rest}</span>` : "";
  const orphanChip = orphans
    ? `<span class="chip" title="привязки к удалённым проектам">удалённых: ${orphans}</span>`
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
    ? `<div class="dim ellip" style="margin-top:3px;font-size:11.5px" title="${escapeHtml(owners.join(", "))}">привёл: ${escapeHtml(owners[0])}${owners.length > 1 ? ` и ещё ${owners.length - 1}` : ""}</div>`
    : "";

  if (!chips && !orphanChip) {
    return '<span class="chip chip-muted">без проекта</span>';
  }
  return `<div class="chips">${chips}${more}${orphanChip}</div>${ownerLine}`;
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
  const { rows, page, totalPages, totalFiltered, filters, brands, refOwners, stats } = viewModel;

  const href = (overrides = {}) => {
    const query = new URLSearchParams();
    const merged = { ...filters, page: 1, ...overrides };
    for (const key of ["brand", "refOwnerId", "ref", "activity", "q", "sort", "dir"]) {
      if (merged[key]) query.set(key, merged[key]);
    }
    if (merged.page && Number(merged.page) > 1) query.set("page", String(merged.page));
    const text = query.toString();
    return text ? `/admin/users?${text}` : "/admin/users";
  };

  const sortLink = (label, key, alignRight = false) => {
    const active = filters.sort === key;
    const dir = active && filters.dir === "desc" ? "asc" : "desc";
    const arrow = active ? (filters.dir === "desc" ? "↓" : "↑") : "";
    return `<th class="${alignRight ? "num" : ""}"><a href="${href({ sort: key, dir })}">${escapeHtml(label)}${arrow ? ` <span class="dim">${arrow}</span>` : ""}</a></th>`;
  };

  const option = (value, label, selected) =>
    `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;

  const filterBar = `<form method="get" action="/admin/users" class="filterbar">
    <label class="field"><span>Бренд</span><select name="brand">
      ${option("", "Все", filters.brand)}${brands.map((b) => option(b.key, b.label, filters.brand)).join("")}
    </select></label>
    <label class="field"><span>Реф организатора</span><select name="refOwnerId">
      ${option("", "Все", filters.refOwnerId)}${refOwners.map((o) => option(o.id, o.label, filters.refOwnerId)).join("")}
    </select></label>
    <label class="field"><span>Статус</span><select name="ref">
      ${option("", "Все", filters.ref)}${option("ref", "Рефы", filters.ref)}${option("non-ref", "Не рефы", filters.ref)}
    </select></label>
    <label class="field"><span>Активность</span><select name="activity">
      ${option("", "Все", filters.activity)}
      ${option("participated", "Участвовали", filters.activity)}
      ${option("won", "Побеждали", filters.activity)}
      ${option("unpaid", "Не выплачено", filters.activity)}
      ${option("fraud", "Антифрод", filters.activity)}
    </select></label>
    <label class="field"><span>Поиск</span><input type="search" name="q" value="${escapeHtml(filters.q)}" placeholder="ID, имя, @username" /></label>
    <button class="btn btn-primary" type="submit">Применить</button>
    ${
      filters.brand || filters.refOwnerId || filters.ref || filters.activity || filters.q
        ? `<a class="btn btn-quiet" href="/admin/users">Сбросить</a>`
        : ""
    }
  </form>`;

  const activeFilters = [
    filters.brand && "бренд",
    filters.refOwnerId && "реф-организатор",
    filters.ref && "статус",
    filters.activity && "активность",
    filters.q && "поиск",
  ].filter(Boolean);

  const tableRows = rows
    .map(
      (row) => `<tr>
        <td>${UI.person(row.identity, { href: `/admin/users/${encodeURIComponent(row.userId)}` })}</td>
        <td>${renderUserProjectsCell(row.projects)}</td>
        <td>${renderAntiFraudCell(row)}</td>
        <td>${row.hasWallet ? '<span class="chip chip-ok">есть</span>' : '<span class="chip chip-muted">нет</span>'}</td>
        <td class="num strong">${row.participations}</td>
        <td class="num strong">${row.wins}</td>
        <td class="num nowrap">${escapeHtml(row.winningsText)}</td>
        <td class="num nowrap">${escapeHtml(row.payoutsText)}</td>
      </tr>`,
    )
    .join("");

  const table = tableRows
    ? `<div class="tbl-wrap"><table class="tbl tbl-sticky">
        <thead><tr>
          <th>Пользователь</th>
          <th>Проекты</th>
          <th>Антифрод</th>
          <th>Кошелёк</th>
          ${sortLink("Участий", "participations", true)}
          ${sortLink("Побед", "wins", true)}
          ${sortLink("Выиграно", "winnings", true)}
          ${sortLink("Выплачено", "payouts", true)}
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>`
    : UI.blank("Никого не нашлось", "Попробуйте снять фильтры или изменить запрос.");

  const from = totalFiltered === 0 ? 0 : (page - 1) * USERS_PAGE_SIZE + 1;
  const to = Math.min(totalFiltered, page * USERS_PAGE_SIZE);
  const foot = `<div class="foot-bar">
    <span>${from}–${to} из ${totalFiltered.toLocaleString("ru-RU")}${
      totalFiltered !== stats.usersTotal ? ` (всего ${stats.usersTotal.toLocaleString("ru-RU")})` : ""
    }</span>
    <span class="foot-actions">
      ${page > 1 ? `<a class="btn" href="${href({ page: page - 1 })}">← Назад</a>` : ""}
      <span class="dim">стр. ${page} из ${totalPages}</span>
      ${page < totalPages ? `<a class="btn" href="${href({ page: page + 1 })}">Вперёд →</a>` : ""}
    </span>
  </div>`;

  const body = `
    <div class="kpis kpis-4">
      ${UI.kpi({ label: "Пользователей", value: stats.usersTotal.toLocaleString("ru-RU"), note: "всего в базе" })}
      ${UI.kpi({ label: "Привязок к проектам", value: stats.bindingsTotal.toLocaleString("ru-RU"), note: "профиль по бренду" })}
      ${UI.kpi({ label: "Рефов", value: stats.refsTotal.toLocaleString("ru-RU"), note: "подтверждённых" })}
      ${UI.kpi({ label: "Не рефов", value: stats.nonRefsTotal.toLocaleString("ru-RU"), note: "отметились сами" })}
    </div>
    ${UI.card({ flush: true, body: `<div class="filterbar-wrap">${filterBar}</div>${table}${tableRows ? foot : ""}` })}`;

  return UI.renderShell({
    title: "Пользователи",
    subtitle: activeFilters.length
      ? `${totalFiltered.toLocaleString("ru-RU")} по фильтру · ${activeFilters.join(", ")}`
      : `${totalFiltered.toLocaleString("ru-RU")} всего`,
    active: "users",
    body,
    styles: `
      /* Filters belong above the table, not in the header: five selects there
         collided with the page title as soon as the window narrowed. */
      .filterbar-wrap { padding: 10px 14px; border-bottom: 1px solid var(--line-soft); }
      .filterbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
      .filterbar select, .filterbar input { min-width: 128px; }
      .filterbar input[type="search"] { min-width: 190px; }
      .filterbar .btn { margin-bottom: 1px; }
    `,
  });
}

function formatCardDate(iso, timezone) {
  if (!iso) {
    return "—";
  }
  const dt = DateTime.fromISO(iso, { zone: timezone });
  return dt.isValid ? dt.toFormat("dd.MM.yyyy HH:mm") : String(iso).slice(0, 16);
}

function renderUserCardPage(deps, card) {
  const tz = deps.timezone;
  const allProfiles = deps.readUserProjectProfiles() || { users: {} };
  const money = (rub, usd) => formatMoneyTotalsLocal(rub, usd, deps);

  const badges = [];
  if (card.fraud.length) {
    badges.push(`<span class="chip chip-danger">антифрод: ${card.fraud.length}</span>`);
  }
  if (card.totals.awaitingPayout > 0) {
    badges.push(`<span class="chip chip-warn">ждёт выплаты: ${card.totals.awaitingPayout}</span>`);
  }
  if (!card.known) {
    badges.push('<span class="chip chip-muted">нет профиля</span>');
  }
  if (!badges.length) {
    badges.push('<span class="chip chip-ok">без отметок</span>');
  }

  const who = F.identityOf(card.userId, card.meta || {});

  const identity = `<div class="profile">
    ${UI.avatar(who, true)}
    <div class="profile-main">
      <div class="profile-name">${escapeHtml(who.title)}</div>
      <div class="profile-meta">
        ${who.handle ? `<span>${escapeHtml(who.handle)}</span>` : ""}
        <button class="idcopy" type="button" data-id="${escapeHtml(card.userId)}" title="Скопировать Telegram ID">ID</button>
      </div>
      <div class="chips" style="margin-top:7px">${badges.join("")}</div>
    </div>
    <div class="profile-side">
      ${
        card.wallets.length
          ? card.wallets
              .map(
                (wallet) =>
                  `<div class="wallet"><span class="mono">${escapeHtml(wallet.address)}</span><span class="chip chip-muted">${escapeHtml(wallet.source)}</span></div>`,
              )
              .join("")
          : '<div class="dim">Кошелёк не указан</div>'
      }
    </div>
  </div>`;

  const drawRows = card.draws
    .map((draw) => {
      const outcome = draw.outcome
        ? `<span class="chip outcome-${escapeHtml(draw.outcome.tone)}">${escapeHtml(draw.outcome.label)}</span>`
        : '<span class="chip chip-muted">участвовал</span>';
      const detail = draw.outcome
        ? [
            draw.outcome.payoutPrize ? `к выплате ${escapeHtml(draw.outcome.payoutPrize)}` : "",
            draw.outcome.paidAt ? `выплачено ${escapeHtml(F.formatRelative(draw.outcome.paidAt, tz))}` : "",
            draw.outcome.reason ? escapeHtml(draw.outcome.reason) : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
      return `<tr>
        <td class="nowrap dim" title="${escapeHtml(F.formatDateTime(draw.at, tz))}">${escapeHtml(F.formatRelative(draw.at, tz))}</td>
        <td class="strong">${escapeHtml(draw.prize)}</td>
        <td>${draw.projectName === "Без проекта" ? '<span class="dim">—</span>' : escapeHtml(draw.projectName)}</td>
        <td>${outcome}${detail ? `<div class="dim" style="margin-top:3px;font-size:11.5px">${detail}</div>` : ""}</td>
        <td class="mono">${draw.outcome?.wallet ? escapeHtml(draw.outcome.wallet) : "—"}</td>
      </tr>`;
    })
    .join("");

  const projectRows = card.projects
    .map(
      (project) => `<tr>
        <td class="strong">${escapeHtml(project.projectName)}</td>
        <td class="dim">${project.ownerId ? escapeHtml(displayNameForUser(String(project.ownerId), allProfiles)) : "—"}</td>
        <td>${renderRefStatusBadge(project.refStatus)}</td>
        <td>${escapeHtml(project.nickname || project.accountId || "—")}</td>
        <td class="mono">${escapeHtml(project.wallet || "—")}</td>
        <td class="nowrap dim">${escapeHtml(F.formatRelative(project.updatedAt, tz))}</td>
      </tr>`,
    )
    .join("");

  const fraudItems = card.fraud
    .map((detail) => {
      const linked = (detail.linkedUserIds || [])
        .map((id) => `<a class="link" href="/admin/users/${encodeURIComponent(id)}">${escapeHtml(id)}</a>`)
        .join(", ");
      return `<li><span class="chip chip-danger">${escapeHtml(detail.label)}</span> <span class="dim">${escapeHtml(detail.drawTitle || detail.drawId || "")}</span>${
        linked ? `<div class="dim" style="margin-top:2px">связан с: ${linked}</div>` : ""
      }</li>`;
    })
    .join("");

  const supportRows = card.supportChats
    .map(
      (chat) => `<tr>
        <td><a class="link" href="/admin/support/${encodeURIComponent(chat.chatId)}">${escapeHtml(chat.botLabel)}</a></td>
        <td>${chat.sessionClosed ? '<span class="chip chip-muted">завершён</span>' : '<span class="chip chip-ok">активен</span>'}</td>
        <td class="num">${chat.messageCount}</td>
        <td class="nowrap dim">${escapeHtml(F.formatRelative(chat.lastMessageAt, tz))}</td>
        <td class="ellip dim">${escapeHtml(chat.preview || "")}</td>
      </tr>`,
    )
    .join("");

  const tableCard = (title, subtitle, head, rows, emptyText) =>
    UI.card({
      title,
      subtitle,
      flush: true,
      body: rows
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
        : UI.blank(emptyText),
    });

  const body = `
    ${UI.card({ body: identity })}
    <div class="kpis kpis-4" style="margin-top:12px">
      ${UI.kpi({ label: "Участий", value: card.totals.participations })}
      ${UI.kpi({ label: "Побед", value: card.totals.wins })}
      ${UI.kpi({ label: "Выиграно", value: money(card.totals.winningsRub, card.totals.winningsUsd) })}
      ${UI.kpi({ label: "Выплачено", value: money(card.totals.paidRub, card.totals.paidUsd), note: card.totals.awaitingPayout ? `ждёт выплаты: ${card.totals.awaitingPayout}` : "" })}
    </div>

    ${tableCard(
      "Проекты",
      `${card.projects.length} привязок`,
      "<th>Проект</th><th>Организатор</th><th>Статус</th><th>Ник / ID аккаунта</th><th>Кошелёк</th><th>Обновлён</th>",
      projectRows,
      "Нет привязок к проектам",
    )}

    <div style="height:12px"></div>
    ${tableCard(
      "Розыгрыши",
      `${card.draws.length} записей, новые сверху`,
      "<th>Дата</th><th>Приз</th><th>Проект</th><th>Итог</th><th>Кошелёк выплаты</th>",
      drawRows,
      "Не участвовал ни в одном розыгрыше",
    )}

    <div class="grid grid-2" style="margin-top:12px">
      ${UI.card({
        title: "Антифрод",
        body: fraudItems ? `<ul class="fraud-details">${fraudItems}</ul>` : '<div class="dim">Отметок нет.</div>',
      })}
      ${UI.card({
        title: "Поддержка",
        flush: true,
        body: supportRows
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Бот</th><th>Статус</th><th class="num">Сообщ.</th><th>Последнее</th><th>Превью</th></tr></thead><tbody>${supportRows}</tbody></table></div>`
          : UI.blank("Обращений не было"),
      })}
    </div>`;

  return UI.renderShell({
    title: who.title,
    subtitle: `${card.totals.participations} ${F.plural(card.totals.participations, "участие", "участия", "участий")} · ${card.totals.wins} ${F.plural(card.totals.wins, "победа", "победы", "побед")}`,
    pageTitle: who.title,
    active: "users",
    tools: `<a class="btn" href="/admin/users">← К списку</a>`,
    body,
    styles: `
      .profile { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
      /* The Telegram id is needed maybe once a week, to paste somewhere. It is
         a button you can copy, not a number printed under every name. */
      .idcopy {
        background: transparent; border: 1px solid var(--line); color: var(--text-faint);
        border-radius: 6px; padding: 0 6px; font: inherit; font-size: 11px; cursor: pointer;
      }
      .idcopy:hover { color: var(--text); border-color: #2c3950; }
      .profile-main { flex: 1; min-width: 220px; }
      .profile-name { font-size: 17px; font-weight: 650; }
      .profile-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; font-size: 12px; }
      .profile-side { display: flex; flex-direction: column; gap: 5px; align-items: flex-end; }
      .wallet { display: flex; align-items: center; gap: 7px; }
      .fraud-details { margin: 0; padding-left: 16px; }
      .fraud-details li { margin-bottom: 7px; }
    `,
    scripts: `<script>
      document.querySelectorAll(".idcopy").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const was = btn.textContent;
          try {
            await navigator.clipboard.writeText(btn.dataset.id);
            btn.textContent = "скопирован";
          } catch {
            btn.textContent = btn.dataset.id;
          }
          setTimeout(() => { btn.textContent = was; }, 1400);
        });
      });
    </script>`,
  });
}

function renderSystemPage(state) {
  const ok = (value) => (value ? "chip-ok" : "chip-danger");
  const dur = SYS.formatDuration;

  const overdueRows = state.draws.overdue
    .map(
      (draw) => `<tr>
        <td class="strong">${escapeHtml(draw.prize)}</td>
        <td class="num">${draw.participants}</td>
        <td class="num">${draw.lateMinutes} мин</td>
        <td class="mono">${escapeHtml(draw.id)}</td>
      </tr>`,
    )
    .join("");

  const groupRows = state.logs.errors.groups
    .map(
      (group) => `<tr>
        <td class="strong nowrap">${escapeHtml(group.label)}</td>
        <td class="num">${group.count}</td>
        <td class="dim">${escapeHtml(SYS.scrub(group.last).slice(0, 180))}</td>
      </tr>`,
    )
    .join("");

  const docRows = state.storage.docs
    .map(
      (doc) => `<tr>
        <td class="mono">${escapeHtml(doc.key)}</td>
        <td class="num">${escapeHtml(SYS.formatBytes(doc.size))}</td>
        <td class="dim nowrap">${escapeHtml(doc.updatedAt || "—")}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <div class="kpis kpis-4">
      ${UI.kpi({
        label: "Планировщик",
        value: state.scheduler.alive ? "работает" : "молчит",
        note: `пульс ${dur(state.scheduler.ageMs)} назад · тик #${state.scheduler.tick ?? "?"}`,
      })}
      ${UI.kpi({
        label: "Сторож",
        value: state.watchdog.installed ? (state.watchdog.healthy ? "норма" : "тревога") : "не стоит",
        note: state.watchdog.checkedAgeMs !== null ? `проверка ${dur(state.watchdog.checkedAgeMs)} назад` : "проверок не было",
      })}
      ${UI.kpi({
        label: "Аптайм процесса",
        value: dur(state.process.uptimeMs),
        note: `${state.process.memoryMb} МБ · node ${escapeHtml(state.process.node)}`,
      })}
      ${UI.kpi({
        label: "Свежий бэкап",
        value: state.backups.count ? dur(state.backups.ageMs) + " назад" : "нет",
        note: `${state.backups.count} копий`,
      })}
    </div>

    ${UI.card({
      title: "Отчёт для разработчика",
      subtitle: "нажмите — текст скопируется, вставьте его в чат",
      tools: `<button class="btn btn-primary" id="copyReport" type="button">Скопировать отчёт</button>`,
      body: `<pre class="report" id="reportText">${escapeHtml(SYS.buildPlainReport(state))}</pre>`,
    })}

    <div style="height:12px"></div>
    ${UI.card({
      title: "Розыгрыши, которые встали",
      subtitle: `активных ${state.draws.active} · завершённых без уведомления ${state.draws.finishedWithoutNotify}`,
      flush: true,
      body: overdueRows
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Приз</th><th class="num">Участников</th><th class="num">Просрочен</th><th>ID</th></tr></thead><tbody>${overdueRows}</tbody></table></div>`
        : UI.blank("Всё вовремя", "Ни один активный розыгрыш не просрочен."),
    })}

    <div class="grid grid-2" style="margin-top:12px">
      ${UI.card({
        title: "Ошибки в логе",
        subtitle: `${state.logs.errors.total} строк в хвосте`,
        flush: true,
        body: groupRows
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Что</th><th class="num">Раз</th><th>Последняя</th></tr></thead><tbody>${groupRows}</tbody></table></div>`
          : UI.blank("Чисто", "В хвосте лога ошибок нет."),
      })}
      ${UI.card({
        title: "База",
        subtitle: SYS.formatBytes(state.storage.dbSize),
        flush: true,
        body: docRows
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Документ</th><th class="num">Размер</th><th>Обновлён (UTC)</th></tr></thead><tbody>${docRows}</tbody></table></div>`
          : UI.blank("База недоступна"),
      })}
    </div>

    <div style="height:12px"></div>
    ${UI.card({
      title: "Последние строки лога",
      subtitle: "секреты вырезаны",
      body: `<pre class="report">${escapeHtml(state.logs.errors.tail.join("\n") || "пусто")}</pre>`,
    })}`;

  return UI.renderShell({
    title: "Система",
    subtitle: state.scheduler.alive ? "планировщик работает" : "планировщик молчит",
    active: "system",
    tools: `<a class="btn" href="/admin/system">Обновить</a>`,
    body,
    styles: `
      .report {
        margin: 0; padding: 11px 12px; border-radius: 8px; background: var(--rail);
        border: 1px solid var(--line); color: var(--text-dim);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
        max-height: 420px; overflow: auto;
      }
    `,
    scripts: `<script>
      const btn = document.getElementById("copyReport");
      btn?.addEventListener("click", async () => {
        const text = document.getElementById("reportText").textContent;
        const was = btn.textContent;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = "Скопировано";
        } catch {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(document.getElementById("reportText"));
          sel.removeAllRanges(); sel.addRange(range);
          btn.textContent = "Выделено — Ctrl+C";
        }
        setTimeout(() => { btn.textContent = was; }, 1800);
      });
    </script>`,
  });
}

function renderAdminNotFound(message) {
  return UI.renderShell({
    title: "Не найдено",
    active: "users",
    body: UI.card({ body: UI.blank(message, "Проверьте ссылку или вернитесь к списку.") }),
    tools: `<a class="btn" href="/admin/users">← К пользователям</a>`,
  });
}

function renderLoginPage(error = "") {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Вход — RollerBot Admin</title>
  <style>
    ${UI.baseStyles()}
    body { display: grid; place-items: center; padding: 24px; }
    .login { width: 100%; max-width: 340px; }
    .login-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; justify-content: center; }
    .login-brand .brand-mark { width: 26px; height: 26px; }
    .login-brand span { font-size: 15px; font-weight: 650; }
    .login form { display: flex; flex-direction: column; gap: 12px; }
    .login input { padding: 9px 11px; font-size: 13.5px; }
    .login .err { background: var(--danger-bg); color: var(--danger-fg); padding: 8px 11px; border-radius: 8px; font-size: 12.5px; }
    .login .hint { color: var(--text-faint); font-size: 12px; text-align: center; margin: 0; }
  </style>
</head>
<body>
  <div class="login">
    <div class="login-brand"><div class="brand-mark"></div><span>RollerBot Admin</span></div>
    <section class="card"><div class="card-body">
      <form method="post" action="/admin/login">
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <label class="field"><span>Логин</span><input name="login" autocomplete="username" required autofocus /></label>
        <label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit" class="btn btn-primary" style="justify-content:center">Войти</button>
      </form>
    </div></section>
    <p class="hint" style="margin-top:12px">Статистика, пользователи и поддержка</p>
  </div>
</body>
</html>`;
}

function renderDashboardPage(deps, stats, organizers, selectedOwner, userProfiles, period) {
  const link = (overrides = {}) => {
    const query = new URLSearchParams();
    const owner = overrides.ownerId ?? selectedOwner;
    const per = overrides.period ?? stats.period.id;
    if (owner) query.set("ownerId", owner);
    if (per && per !== "30") query.set("period", per);
    const text = query.toString();
    return text ? `/admin/dashboard?${text}` : "/admin/dashboard";
  };

  const periodSeg = UI.segmented(
    stats.periods.map((item) => ({
      label: item.label,
      href: link({ period: item.id }),
      active: item.id === stats.period.id,
    })),
  );

  const ownerName = selectedOwner
    ? (organizers.find((o) => o.id === selectedOwner)?.label || selectedOwner)
    : "";

  const ownerSelect = `<form method="get" action="/admin/dashboard">
    <input type="hidden" name="period" value="${escapeHtml(stats.period.id)}" />
    <select name="ownerId" onchange="this.form.submit()">
      <option value="">Все организаторы</option>
      ${organizers
        .map(
          (o) =>
            `<option value="${escapeHtml(o.id)}"${o.id === selectedOwner ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
        )
        .join("")}
    </select>
  </form>`;

  // Growth inside the window, compared with the window before it. A number with
  // nothing to compare against is just a number.
  const sumTail = (arr, n) => arr.slice(-n).reduce((a, b) => a + b, 0);
  const sumPrev = (arr, n) => arr.slice(-2 * n, -n).reduce((a, b) => a + b, 0);
  const span = Math.max(1, Math.min(stats.series.labels.length, stats.period.days || stats.series.labels.length));

  const metrics = [
    {
      id: "users",
      label: "Пользователи",
      total: stats.totals.users,
      series: stats.series.newUsers,
      cumulative: stats.series.totalUsers,
      note: "всего знакомы боту",
    },
    {
      id: "participants",
      label: "Участники",
      total: stats.totals.participants,
      series: stats.series.newParticipants,
      cumulative: stats.series.totalParticipants,
      note: "хотя бы один розыгрыш",
    },
    {
      id: "draws",
      label: "Розыгрыши",
      total: stats.totals.draws,
      series: stats.series.draws,
      cumulative: null,
      note: "создано за всё время",
    },
    {
      id: "joins",
      label: "Вступления",
      total: stats.series.joins.reduce((a, b) => a + b, 0),
      series: stats.series.joins,
      cumulative: null,
      note: `за ${stats.period.label.toLowerCase()}`,
    },
  ].map((metric) => {
    const measured = stats.deltas?.[metric.id] || null;
    return {
      ...metric,
      current: measured ? measured.current : sumTail(metric.series, span),
      delta: measured ? { percent: measured.percent, direction: measured.direction } : null,
    };
  });

  const lead = metrics[0];
  const tiles = metrics
    .map(
      (metric, index) => `<button class="tile${index === 0 ? " is-active" : ""}" data-metric="${metric.id}" type="button">
        <span class="tile-label">${escapeHtml(metric.label)}</span>
        <span class="tile-value">${F.formatCount(metric.total)}</span>
        <span class="tile-note">${escapeHtml(metric.note)}</span>
      </button>`,
    )
    .join("");

  const share = stats.totals.users
    ? Math.round((stats.totals.participants / stats.totals.users) * 100)
    : 0;

  const statusBars = UI.bars(
    [
      { label: "Завершённые", value: stats.breakdowns.status.finished || 0, color: "#6fdda0" },
      { label: "Активные", value: stats.breakdowns.status.active || 0, color: "#4f8cff" },
      { label: "Запланированные", value: stats.breakdowns.status.scheduled || 0, color: "#edc36f" },
    ].filter((item) => item.value > 0),
  );

  const brandBars = UI.bars(
    stats.breakdowns.brands.slice(0, 6).map(([label, value]) => ({ label, value })),
  );

  const refTotal =
    stats.breakdowns.referrals.refs +
    stats.breakdowns.referrals.nonRefs +
    stats.breakdowns.referrals.unknown;
  const refBars = UI.bars([
    { label: "Рефералы", value: stats.breakdowns.referrals.refs, color: "#6fdda0" },
    { label: "Не рефералы", value: stats.breakdowns.referrals.nonRefs, color: "#edc36f" },
    { label: "Не проходили проверку", value: stats.breakdowns.referrals.unknown, color: "#2c3950" },
  ].map((item) => ({
    ...item,
    display: refTotal ? `${F.formatCount(item.value)} · ${Math.round((item.value / refTotal) * 100)}%` : item.value,
  })));

  const organizerRows = stats.organizerRows
    .map((row) => {
      const identity = F.identityOf(row.id, userProfiles.users?.[String(row.id)]?.meta || {});
      return `<tr>
        <td>${UI.person(identity, { href: link({ ownerId: row.id }) })}</td>
        <td class="num strong">${F.formatCount(row.draws)}</td>
        <td class="num">${F.formatCount(row.referrals)}</td>
      </tr>`;
    })
    .join("");

  const payload = JSON.stringify({
    labels: stats.series.labels.map((day) => {
      const [, m, d] = day.split("-");
      return `${d}.${m}`;
    }),
    metrics: Object.fromEntries(
      metrics.map((metric) => [
        metric.id,
        { label: metric.label, bars: metric.series, line: metric.cumulative },
      ]),
    ),
  });

  const body = `
    ${UI.card({
      body: `
        <div class="hero">
          <div class="hero-metric">
            <div class="kpi-label">${escapeHtml(lead.label)} · ${escapeHtml(stats.period.label.toLowerCase())}</div>
            <div class="metric-row" style="margin-top:6px">
              <span class="metric-value" id="heroValue">${F.formatCount(lead.current)}</span>
              <span id="heroDelta">${UI.delta(lead.delta)}</span>
            </div>
            <div class="kpi-note" id="heroNote">новых за период · всего ${F.formatCount(lead.total)}</div>
          </div>
          <div class="tiles">${tiles}</div>
        </div>
        <div class="chart"><canvas id="mainChart"></canvas></div>`,
    })}

    <div class="grid grid-3" style="margin-top:12px">
      ${UI.card({
        title: "Кто эти люди",
        subtitle: `${share}% участвовали хотя бы раз`,
        body: refBars,
      })}
      ${UI.card({ title: "Розыгрыши", subtitle: "по статусу", body: statusBars })}
      ${UI.card({ title: "Бренды", subtitle: "розыгрышей проведено", body: brandBars })}
    </div>

    <div style="margin-top:12px">
      ${UI.card({
        title: "Организаторы",
        subtitle: "нажмите, чтобы отфильтровать всю страницу",
        flush: true,
        body: organizerRows
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Организатор</th><th class="num">Розыгрышей</th><th class="num">Рефералов</th></tr></thead><tbody>${organizerRows}</tbody></table></div>`
          : UI.blank("Пока никто не проводил розыгрыши"),
      })}
    </div>`;

  const scripts = `
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script>
    const D = ${payload};
    const META = ${JSON.stringify(
      Object.fromEntries(
        metrics.map((m) => [
          m.id,
          { value: F.formatCount(m.current), delta: UI.delta(m.delta), total: F.formatCount(m.total) },
        ]),
      ),
    )};
    Chart.defaults.color = "#6b7789";
    Chart.defaults.font.size = 11;
    Chart.defaults.font.family = "ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = "#161d2b";
    Chart.defaults.plugins.tooltip.borderColor = "#1f2836";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;

    const ctx = document.getElementById("mainChart");
    const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(79,140,255,.34)");
    gradient.addColorStop(1, "rgba(79,140,255,0)");

    function datasetsFor(id) {
      const m = D.metrics[id];
      const sets = [{
        type: "line", label: m.label, data: m.bars, yAxisID: "y",
        borderColor: "#4f8cff", backgroundColor: gradient, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 4, tension: .35, fill: true,
      }];
      if (m.line) {
        sets.push({
          type: "line", label: "Всего", data: m.line, yAxisID: "y1",
          borderColor: "#6fdda0", borderWidth: 1.5, borderDash: [4, 4],
          pointRadius: 0, pointHoverRadius: 4, tension: .35, fill: false,
        });
      }
      return sets;
    }

    const chart = new Chart(ctx, {
      data: { labels: D.labels, datasets: datasetsFor("users") },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { color: "#1f2836" }, ticks: { maxRotation: 0, autoSkipPadding: 24 } },
          y: { beginAtZero: true, grid: { color: "rgba(148,163,184,.08)" }, border: { display: false } },
          y1: { position: "right", beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { color: "#43506a" } },
        },
      },
    });

    document.querySelectorAll(".tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        document.querySelectorAll(".tile").forEach((t) => t.classList.remove("is-active"));
        tile.classList.add("is-active");
        const id = tile.dataset.metric;
        chart.data.datasets = datasetsFor(id);
        chart.options.scales.y1.display = Boolean(D.metrics[id].line);
        chart.update();
        document.getElementById("heroValue").textContent = META[id].value;
        document.getElementById("heroDelta").innerHTML = META[id].delta;
        document.getElementById("heroNote").textContent =
          (D.metrics[id].line ? "новых за период · всего " : "за период · всего ") + META[id].total;
        document.querySelector(".kpi-label").textContent =
          D.metrics[id].label + " · ${escapeHtml(stats.period.label.toLowerCase())}";
      });
    });
  </script>`;

  return UI.renderShell({
    title: "Статистика",
    subtitle: ownerName ? `организатор: ${ownerName}` : "все организаторы",
    active: "stats",
    tools: `${periodSeg}${ownerSelect}`,
    body,
    scripts,
    styles: `
      .hero { display: flex; gap: 22px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; margin-bottom: 6px; }
      .hero-metric { min-width: 210px; }
      .tiles { display: flex; gap: 8px; flex-wrap: wrap; }
      .tile {
        display: flex; flex-direction: column; gap: 2px; align-items: flex-start; cursor: pointer;
        padding: 9px 13px; border-radius: 10px; min-width: 128px; text-align: left;
        background: var(--surface-2); border: 1px solid var(--line); color: var(--text-dim); font: inherit;
      }
      .tile:hover { border-color: #2c3950; }
      .tile.is-active { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }
      .tile-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); }
      .tile.is-active .tile-label { color: #a9c6ff; }
      .tile-value { font-size: 18px; font-weight: 650; color: var(--text); }
      .tile-note { font-size: 11px; color: var(--text-faint); }
      .chart { position: relative; height: 262px; margin-top: 10px; }
    `,
  });
}

function formatCardDate(iso, timezone) {
  if (!iso) {
    return "—";
  }
  const dt = DateTime.fromISO(iso, { zone: timezone });
  return dt.isValid ? dt.toFormat("dd.MM.yyyy HH:mm") : String(iso).slice(0, 16);
}

function supportHref(view, overrides = {}) {
  const query = new URLSearchParams();
  const tab = overrides.tab ?? view.activeTab;
  const q = overrides.q ?? view.query;
  const page = overrides.page ?? 1;
  if (tab && tab !== "attention") query.set("tab", tab);
  if (q) query.set("q", q);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `?${text}` : "";
}

function renderSupportAside(view, selectedId = "") {
  const counts = {
    attention: view.summary.attention,
    open: view.summary.open,
    errors: view.summary.withErrors,
    closed: view.summary.total - view.summary.open,
    all: view.summary.total,
  };

  const tabs = UI.segmented(
    view.tabs.map((tab) => ({
      label: tab.label,
      href: `/admin/support${supportHref(view, { tab: tab.id })}`,
      active: tab.id === view.activeTab,
      count: counts[tab.id] ?? 0,
    })),
  );

  const items = view.rows
    .map((chat) => {
      const flags = chat.flags
        .slice(0, 2)
        .map((flag) => `<span class="chip chip-${flag.tone === "muted" ? "muted" : flag.tone}">${escapeHtml(flag.label)}</span>`)
        .join("");
      const active = String(chat.chatId) === String(selectedId);
      const who = F.identityOf(chat.chatId, view.metaById?.[String(chat.chatId)] || {});
      return `<a class="conv${active ? " is-active" : ""}" href="/admin/support/${encodeURIComponent(chat.chatId)}${supportHref(view)}">
        <div class="conv-row">
          ${UI.avatar(who)}
          <div class="conv-body">
            <div class="conv-top">
              <span class="conv-name">${escapeHtml(chat.name || who.title)}</span>
              <span class="conv-time">${escapeHtml(F.formatRelative(chat.lastMessageAt, view.timezone))}</span>
            </div>
            <div class="conv-preview">${escapeHtml(chat.preview || "—")}</div>
            <div class="conv-foot">
              <span class="chips">${flags}</span>
              <span class="dim">${chat.messageCount}</span>
            </div>
          </div>
        </div>
      </a>`;
    })
    .join("");

  const pager =
    view.totalPages > 1
      ? `<div class="foot-bar">
          <span>${view.rows.length} из ${view.totalFiltered}</span>
          <span class="foot-actions">
            ${view.page > 1 ? `<a class="btn" href="/admin/support${supportHref(view, { page: view.page - 1 })}">←</a>` : ""}
            <span class="dim">${view.page}/${view.totalPages}</span>
            ${view.page < view.totalPages ? `<a class="btn" href="/admin/support${supportHref(view, { page: view.page + 1 })}">→</a>` : ""}
          </span>
        </div>`
      : "";

  return `<aside class="conv-list">
    <div class="conv-head">
      ${tabs}
      <form method="get" action="/admin/support" class="conv-search">
        <input type="hidden" name="tab" value="${escapeHtml(view.activeTab)}" />
        <input type="search" name="q" value="${escapeHtml(view.query)}" placeholder="Поиск по переписке, имени, ID…" />
      </form>
    </div>
    <div class="conv-scroll">${items || UI.blank("Ничего не найдено", "Смените вкладку или запрос.")}</div>
    ${pager}
  </aside>`;
}

function supportStyles() {
  return `
    .support { display: grid; grid-template-columns: 372px 1fr; min-height: calc(100vh - var(--head-h)); }
    .conv-list { border-right: 1px solid var(--line); display: flex; flex-direction: column; min-width: 0; background: var(--rail); }
    .conv-head { padding: 10px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
    /* In a 372px column the tabs wrapped onto three lines; let them scroll
       sideways as one row instead. */
    .conv-head { overflow: hidden; }
    .conv-head .seg { flex-wrap: nowrap; overflow-x: auto; max-width: 100%; scrollbar-width: none; }
    .conv-head .seg::-webkit-scrollbar { display: none; }
    .conv-head .seg a { white-space: nowrap; flex: none; }
    .conv-search input { width: 100%; }
    .conv-scroll { overflow-y: auto; flex: 1; }
    .conv { display: block; padding: 10px 12px; border-bottom: 1px solid var(--line-soft); }
    .conv:hover { background: var(--surface); }
    .conv.is-active { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
    .conv-row { display: flex; gap: 9px; align-items: flex-start; }
    .conv-body { min-width: 0; flex: 1; }
    .conv-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
    .conv-name { font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .conv-time { font-size: 11px; color: var(--text-faint); flex: none; }
    .conv-preview { font-size: 12px; color: var(--text-dim); margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .conv-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; }

    .thread { display: flex; flex-direction: column; min-width: 0; }
    .thread-head { padding: 12px 18px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .thread-title { font-size: 14px; font-weight: 650; }
    .thread-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--text-faint); margin-top: 2px; }
    .thread-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; }
    .msg { max-width: 62%; padding: 8px 11px; border-radius: 12px; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .msg-meta { font-size: 10.5px; color: var(--text-faint); margin-top: 4px; }
    .msg-user { align-self: flex-start; background: var(--surface-2); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
    .msg-bot { align-self: flex-end; background: var(--accent-soft); border: 1px solid rgba(79,140,255,.25); border-bottom-right-radius: 4px; }
    .msg-admin { align-self: flex-end; background: var(--ok-bg); border: 1px solid rgba(111,221,160,.25); border-bottom-right-radius: 4px; }
    .msg-error { align-self: flex-end; background: var(--danger-bg); border: 1px solid rgba(255,143,151,.25); }
    .msg-system { align-self: center; background: transparent; border: 1px dashed var(--line); color: var(--text-faint); font-size: 11.5px; }
    .compose { border-top: 1px solid var(--line); padding: 12px 18px; display: flex; flex-direction: column; gap: 8px; }
    .compose textarea { width: 100%; min-height: 74px; resize: vertical; }
    .compose-row { display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap; }
    .flash { padding: 8px 12px; border-radius: 8px; font-size: 12.5px; margin: 12px 18px 0; }
    .flash-ok { background: var(--ok-bg); color: var(--ok-fg); }
    .flash-error { background: var(--danger-bg); color: var(--danger-fg); }
    @media (max-width: 1100px) { .support { grid-template-columns: 1fr; } .conv-list { border-right: none; border-bottom: 1px solid var(--line); max-height: 46vh; } }
  `;
}

function renderSupportListPage(view, timezone) {
  view.timezone = timezone;
  const body = `<div class="support">
    ${renderSupportAside(view)}
    <section class="thread">
      ${UI.blank("Выберите диалог", "Слева список: сверху те, где бот не справился.")}
    </section>
  </div>`;

  return UI.renderShell({
    title: "Поддержка",
    subtitle: `${view.summary.attention} требуют внимания · ${view.summary.open} живых · ${view.summary.total} всего`,
    active: "support",
    body,
    flush: true,
    styles: supportStyles(),
  });
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

function renderSupportChatPage(view, chatId, state, timezone, options = {}) {
  view.timezone = timezone;
  const transcript = getChatTranscript(state);
  const name = formatSupportChatName(state, chatId);
  const sessionClosed = Boolean(state.sessionClosed);
  const flash = options.flash;
  const who = F.identityOf(chatId, options.meta || {});
  const threadMeta = [
    options.storeLabel || "",
    sessionClosed ? "диалог завершён" : "диалог активен",
    `${transcript.length} ${F.plural(transcript.length, "сообщение", "сообщения", "сообщений")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const messages = transcript
    .map((msg) => {
      const role =
        msg.role === "user"
          ? "user"
          : msg.kind === "admin"
            ? "admin"
            : msg.kind === "error"
              ? "error"
              : msg.role === "system"
                ? "system"
                : "bot";
      const time = F.formatRelative(msg.at, timezone);
      return `<div class="msg msg-${role}">${escapeHtml(msg.content || "")}<div class="msg-meta">${escapeHtml(roleLabel(msg.role, msg.kind))} · ${escapeHtml(time)}</div></div>`;
    })
    .join("");

  const compose =
    options.canReply === false
      ? `<div class="compose"><div class="dim">Диалог второго бота поддержки — только просмотр.</div></div>`
      : sessionClosed
        ? `<div class="compose"><div class="dim">Диалог завершён. Пользователь получил сообщение с просьбой нажать /start.</div></div>`
        : `<form class="compose" method="post" action="/admin/support/${encodeURIComponent(chatId)}/reply">
            <textarea name="text" required placeholder="Ответ уйдёт пользователю в Telegram от support-бота…"></textarea>
            <div class="compose-row">
              <span class="dim">AI-бот продолжает отвечать как обычно.</span>
              <span class="foot-actions">
                <button type="submit" class="btn btn-primary">Отправить</button>
                <button type="submit" class="btn btn-danger" formaction="/admin/support/${encodeURIComponent(chatId)}/close" formmethod="post" formnovalidate onclick="return confirm('Завершить диалог? Пользователю уйдёт сообщение с /start.');">Завершить</button>
              </span>
            </div>
          </form>`;

  const body = `<div class="support">
    ${renderSupportAside(view, chatId)}
    <section class="thread">
      <div class="thread-head">
        ${UI.person(who, { href: `/admin/users/${encodeURIComponent(chatId)}`, sub: threadMeta })}
        <a class="btn" href="/admin/users/${encodeURIComponent(chatId)}">Профиль →</a>
      </div>
      ${flash ? `<div class="flash ${flash.type === "error" ? "flash-error" : "flash-ok"}">${escapeHtml(flash.text)}</div>` : ""}
      <div class="thread-body" id="threadBody">${messages || UI.blank("Переписка пуста")}</div>
      ${compose}
    </section>
  </div>`;

  return UI.renderShell({
    title: "Поддержка",
    subtitle: name,
    pageTitle: name,
    active: "support",
    body,
    flush: true,
    styles: supportStyles(),
    scripts: `<script>
      const t = document.getElementById("threadBody");
      if (t) { t.scrollTop = t.scrollHeight; }
    </script>`,
  });
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

  // Faces come from Telegram. The organiser panel had its own avatar route
  // behind its own auth, so the admin panel had none and showed ids instead.
  app.get("/admin/system", requireAuth, (_req, res) => {
    try {
      const state = SYS.collectSystemState({
        timezone: deps.timezone,
        buildId: process.env.JOIN_PAGE_BUILD,
        botUsername: deps.botUsername,
        schedulerIntervalMs: Number(process.env.CHECK_INTERVAL_MS || 30000),
      });
      res.type("html").send(renderSystemPage(state));
    } catch (error) {
      console.error("[admin] GET /admin/system:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать состояние системы."));
    }
  });

  app.get("/admin/avatar/:userId", requireAuth, async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    const fileId = deps.readUserProjectProfiles()?.users?.[userId]?.meta?.avatarFileId;
    if (!fileId || !deps.resolveAvatarUrl) {
      res.status(404).end();
      return;
    }
    try {
      const url = await deps.resolveAvatarUrl(fileId);
      res.set("Cache-Control", "private, max-age=900").redirect(String(url));
    } catch {
      res.status(404).end();
    }
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

  // Both pages draw the same list, so both build it the same way.
  function buildSupportViewFromRequest(req) {
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

    // Faces for the list come from the same profiles the rest of the panel uses.
    const users = deps.readUserProjectProfiles()?.users || {};
    view.metaById = Object.fromEntries(
      view.rows.map((chat) => [String(chat.chatId), users[String(chat.chatId)]?.meta || {}]),
    );
    return view;
  }

  app.get("/admin/support", requireAuth, (req, res) => {
    res.type("html").send(renderSupportListPage(buildSupportViewFromRequest(req), deps.timezone));
  });

  function renderSupportChatView(res, chatId, flash, req = { query: {} }) {
    // The second support bot writes to its own store, and the panel used to look
    // only in the first one, so those conversations 404'd.
    const found = findSupportChatAnywhere(chatId);
    const state = found?.state;
    if (!state) {
      res.status(404).type("html").send(renderAdminNotFound("Диалог не найден."));
      return false;
    }
    res.type("html").send(
      renderSupportChatPage(buildSupportViewFromRequest(req), chatId, state, deps.timezone, {
        flash,
        storeLabel: found.store.label,
        canReply: found.store.canReply,
        meta: deps.readUserProjectProfiles()?.users?.[String(chatId)]?.meta || {},
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
    renderSupportChatView(res, chatId, flash, req);
  });

  app.post("/admin/support/:chatId/reply", requireAuth, async (req, res) => {
    const chatId = String(req.params.chatId || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!text) {
      renderSupportChatView(res, chatId, { type: "error", text: "Введите текст сообщения." }, req);
      return;
    }
    if (!deps.supportBotToken) {
      renderSupportChatView(res, chatId, {
        type: "error",
        text: "SUPPORT_BOT_TOKEN не задан в .env — отправка в Telegram недоступна.",
      }, req);
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
      }, req);
    }
  });

  app.post("/admin/support/:chatId/close", requireAuth, async (req, res) => {
    const chatId = String(req.params.chatId || "").trim();
    if (!deps.supportBotToken) {
      renderSupportChatView(res, chatId, {
        type: "error",
        text: "SUPPORT_BOT_TOKEN не задан в .env — завершение диалога недоступно.",
      }, req);
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
      }, req);
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
