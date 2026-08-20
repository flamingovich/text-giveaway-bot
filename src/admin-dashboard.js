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
    ? `<div class="dim ellip" style="margin-top:3px;font-size:11.5px" title="${escapeHtml(owners.join(", "))}">реф: ${escapeHtml(owners[0])}${owners.length > 1 ? ` +${owners.length - 1}` : ""}</div>`
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
        <td>
          <a class="link" href="/admin/users/${encodeURIComponent(row.userId)}">${escapeHtml(row.userName || row.userLabel)}</a>
          <div class="mono">${escapeHtml(row.userId)}</div>
        </td>
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

  const initial = (card.fullName || card.label).replace(/^@/, "").charAt(0).toUpperCase() || "?";

  const identity = `<div class="profile">
    <div class="avatar">${escapeHtml(initial)}</div>
    <div class="profile-main">
      <div class="profile-name">${escapeHtml(card.label)}</div>
      <div class="profile-meta">
        <span class="mono">ID ${escapeHtml(card.userId)}</span>
        ${card.fullName ? `<span class="dim">${escapeHtml(card.fullName)}</span>` : ""}
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
            draw.outcome.paidAt ? `выплачено ${escapeHtml(formatCardDate(draw.outcome.paidAt, tz))}` : "",
            draw.outcome.reason ? escapeHtml(draw.outcome.reason) : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
      return `<tr>
        <td class="nowrap dim">${escapeHtml(formatCardDate(draw.at, tz))}</td>
        <td class="strong">${escapeHtml(draw.prize)}<div class="mono">${escapeHtml(draw.id)}</div></td>
        <td>${escapeHtml(draw.projectName)}</td>
        <td>${outcome}${detail ? `<div class="dim" style="margin-top:3px;font-size:11.5px">${detail}</div>` : ""}</td>
        <td class="mono">${draw.outcome?.wallet ? escapeHtml(draw.outcome.wallet) : "—"}</td>
      </tr>`;
    })
    .join("");

  const projectRows = card.projects
    .map(
      (project) => `<tr>
        <td class="strong">${escapeHtml(project.projectName)}</td>
        <td class="dim">${project.ownerId ? escapeHtml(labelForUser(String(project.ownerId), allProfiles)) : "—"}</td>
        <td>${renderRefStatusBadge(project.refStatus)}</td>
        <td>${escapeHtml(project.nickname || project.accountId || "—")}</td>
        <td class="mono">${escapeHtml(project.wallet || "—")}</td>
        <td class="nowrap dim">${escapeHtml(formatCardDate(project.updatedAt, tz))}</td>
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
        <td class="nowrap dim">${escapeHtml(formatCardDate(chat.lastMessageAt, tz))}</td>
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
    title: card.label,
    subtitle: `${card.totals.participations} участий · ${card.totals.wins} побед`,
    pageTitle: card.label,
    active: "users",
    tools: `<a class="btn" href="/admin/users">← К списку</a>`,
    body,
    styles: `
      .profile { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
      .avatar {
        width: 46px; height: 46px; border-radius: 12px; flex: none;
        display: flex; align-items: center; justify-content: center;
        background: var(--accent-soft); color: #b9d2ff; font-size: 19px; font-weight: 650;
      }
      .profile-main { flex: 1; min-width: 220px; }
      .profile-name { font-size: 17px; font-weight: 650; }
      .profile-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; font-size: 12px; }
      .profile-side { display: flex; flex-direction: column; gap: 5px; align-items: flex-end; }
      .wallet { display: flex; align-items: center; gap: 7px; }
      .fraud-details { margin: 0; padding-left: 16px; }
      .fraud-details li { margin-bottom: 7px; }
    `,
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

  const ownerSelect = `<form method="get" action="/admin/dashboard" class="field">
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

  const share = stats.totals.users
    ? Math.round((stats.totals.participants / stats.totals.users) * 100)
    : 0;

  const heroes = [
    UI.kpi({
      label: "Пользователей в боте",
      value: stats.totals.users.toLocaleString("ru-RU"),
      note: "всего известных боту",
      lead: true,
    }),
    UI.kpi({
      label: "Участников",
      value: stats.totals.participants.toLocaleString("ru-RU"),
      note: `хотя бы один розыгрыш · <b class="strong">${share}%</b> от всех`,
      lead: true,
      share,
    }),
    UI.kpi({
      label: "Розыгрышей",
      value: stats.totals.draws.toLocaleString("ru-RU"),
      note: `активных ${stats.totals.active} · завершённых ${stats.totals.finished}`,
      lead: true,
    }),
  ].join("");

  const secondary = [
    UI.kpi({ label: "Победителей", value: stats.totals.winners, note: "уникальных людей" }),
    UI.kpi({ label: "Побед всего", value: stats.totals.wins, note: "с повторными" }),
    UI.kpi({ label: "С кошельком", value: stats.totals.withWallet, note: "указан TRC-20" }),
    UI.kpi({
      label: "Вступлений",
      value: stats.series.joins.reduce((sum, n) => sum + n, 0),
      note: `за ${stats.period.label.toLowerCase()}`,
    }),
  ].join("");

  const chart = (id, title, subtitle) =>
    UI.card({
      title,
      subtitle,
      body: `<div class="chart"><canvas id="${id}"></canvas></div>`,
      tight: true,
    });

  const brandRows = stats.breakdowns.brands
    .map(
      ([name, count]) =>
        `<tr><td class="strong">${escapeHtml(name)}</td><td class="num">${count}</td></tr>`,
    )
    .join("");

  const orgRows = stats.organizerRows
    .map((row) => {
      const label = labelForUser(row.id, userProfiles);
      return `<tr>
        <td><a class="link" href="${link({ ownerId: row.id })}">${escapeHtml(label)}</a></td>
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
    referrals: stats.breakdowns.referrals,
  });

  const body = `
    <div class="kpis kpis-3">${heroes}</div>
    <div class="kpis kpis-4">${secondary}</div>

    <div class="grid grid-2" style="margin-bottom:12px">
      ${chart("usersChart", "Рост пользователей", "новые за день и общее число")}
      ${chart("participantsChart", "Рост участников", "первое участие и общее число")}
    </div>

    <div class="grid grid-2" style="margin-bottom:12px">
      ${chart("drawsChart", "Розыгрышей создано", "по дням")}
      ${chart("joinsChart", "Вступлений в розыгрыши", "по дням, с повторными")}
    </div>

    <div class="grid grid-3" style="margin-bottom:12px">
      ${chart("statusChart", "Статусы розыгрышей", "")}
      ${chart("prizeChart", "Типы призов", "")}
      ${chart("refChart", "Реф-статус", "")}
    </div>

    <div class="grid grid-2">
      ${UI.card({
        title: "Розыгрыши по брендам",
        flush: true,
        body: brandRows
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Бренд</th><th class="num">Розыгрышей</th></tr></thead><tbody>${brandRows}</tbody></table></div>`
          : UI.blank("Нет розыгрышей"),
      })}
      ${UI.card({
        title: "Организаторы",
        flush: true,
        body: orgRows
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Организатор</th><th class="num">Розыгрышей</th><th class="num">Рефералов</th></tr></thead><tbody>${orgRows}</tbody></table></div>`
          : UI.blank("Нет организаторов"),
      })}
    </div>`;

  const scripts = `
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script>
    const D = ${payload};
    const GRID = "rgba(148,163,184,.10)";
    Chart.defaults.color = "#6b7789";
    Chart.defaults.font.size = 11;
    Chart.defaults.font.family = "ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = "#161d2b";
    Chart.defaults.plugins.tooltip.borderColor = "#1f2836";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 9;

    const growth = (id, bars, line, barLabel, lineLabel) =>
      new Chart(document.getElementById(id), {
        data: {
          labels: D.labels,
          datasets: [
            { type: "bar", label: barLabel, data: bars, yAxisID: "y",
              backgroundColor: "rgba(79,140,255,.38)", hoverBackgroundColor: "rgba(79,140,255,.7)",
              borderRadius: 3, borderSkipped: false, maxBarThickness: 22 },
            { type: "line", label: lineLabel, data: line, yAxisID: "y1",
              borderColor: "#6fdda0", backgroundColor: "rgba(111,221,160,.10)",
              borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .35, fill: true },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 14 } } },
          scales: {
            x: { grid: { display: false }, border: { color: "#1f2836" }, ticks: { maxRotation: 0, autoSkipPadding: 22 } },
            y: { beginAtZero: true, grid: { color: GRID }, border: { display: false } },
            y1: { position: "right", beginAtZero: true, grid: { display: false }, border: { display: false } },
          },
        },
      });

    growth("usersChart", D.newUsers, D.totalUsers, "Новые", "Всего");
    growth("participantsChart", D.newParticipants, D.totalParticipants, "Новые", "Всего");

    const bars = (id, data, label, color) =>
      new Chart(document.getElementById(id), {
        type: "bar",
        data: { labels: D.labels, datasets: [{ label, data, backgroundColor: color, borderRadius: 3, borderSkipped: false, maxBarThickness: 22 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, border: { color: "#1f2836" }, ticks: { maxRotation: 0, autoSkipPadding: 22 } },
            y: { beginAtZero: true, grid: { color: GRID }, border: { display: false } },
          },
        },
      });

    bars("drawsChart", D.draws, "Розыгрышей", "rgba(237,195,111,.55)");
    bars("joinsChart", D.joins, "Вступлений", "rgba(79,140,255,.45)");

    const PIE = ["#4f8cff", "#6fdda0", "#edc36f", "#ff8f97", "#b48ef0", "#67d5e0"];
    const donut = (id, labels, values) =>
      new Chart(document.getElementById(id), {
        type: "doughnut",
        data: { labels, datasets: [{ data: values, backgroundColor: PIE, borderColor: "#111722", borderWidth: 3, hoverOffset: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "64%",
          plugins: { legend: { position: "bottom", labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 12 } } },
        },
      });

    donut("statusChart", ["Активные", "Завершённые", "Запланированные", "Черновики"],
      [D.status.active || 0, D.status.finished || 0, D.status.scheduled || 0, D.status.draft || 0]);
    donut("prizeChart", D.prizeTypes.map(x => x[0]), D.prizeTypes.map(x => x[1]));
    donut("refChart", ["Рефы", "Не рефы", "Не определено"],
      [D.referrals.refs, D.referrals.nonRefs, D.referrals.unknown]);
  </script>`;

  return UI.renderShell({
    title: "Статистика",
    subtitle: `${stats.period.label.toLowerCase()}${selectedOwner ? " · один организатор" : ""}`,
    active: "stats",
    tools: `${periodSeg}${ownerSelect}`,
    body,
    scripts,
    styles: `
      .chart { position: relative; height: 230px; }
      .grid-3 .chart { height: 200px; }
    `,
  });
}

// Список и переписка на одном экране, как в почтовике: выбор диалога не уводит
// со страницы, а открывает его рядом со списком.
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
      return `<a class="conv${active ? " is-active" : ""}" href="/admin/support/${encodeURIComponent(chat.chatId)}${supportHref(view)}">
        <div class="conv-top">
          <span class="conv-name">${escapeHtml(chat.name || chat.label)}</span>
          <span class="conv-time">${escapeHtml(formatMessageTime(chat.lastMessageAt, view.timezone))}</span>
        </div>
        <div class="conv-preview">${escapeHtml(chat.preview || "—")}</div>
        <div class="conv-foot">
          <span class="chips">${flags}</span>
          <span class="dim">${chat.messageCount} сообщ.</span>
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
      const time = formatMessageTime(msg.at, timezone);
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
        <div>
          <div class="thread-title">${escapeHtml(name)}</div>
          <div class="thread-meta">
            <span class="mono">ID ${escapeHtml(chatId)}</span>
            <span>${options.storeLabel ? escapeHtml(options.storeLabel) : "—"}</span>
            <span>${sessionClosed ? "завершён" : "активен"}</span>
            <span>${transcript.length} сообщений</span>
          </div>
        </div>
        <a class="btn" href="/admin/users/${encodeURIComponent(chatId)}">Карточка пользователя →</a>
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

    return buildSupportView(chats, {
      tab: String(req.query.tab || "attention"),
      query: String(req.query.q || ""),
      page: Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1),
    });
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
