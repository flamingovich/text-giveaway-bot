const crypto = require("crypto");
const fs = require("fs");
const { resolveShotFile } = require("./profile-shot-store");
const { DATA_DIR } = require("./storage/paths");
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
const F = require("./admin-format");
const SYS = require("./admin-system");
const REFERRALS = require("./admin-referrals");
const PROJECT_STATS = require("./admin-projects");
const FUNNEL = require("./admin-funnel");
const LINKS = require("./admin-links");
const { normalizeProjectAccountId } = require("./project-account-id");
const {
  renderLoginPage,
  renderAdminNotFound,
  renderDashboardPage,
  renderFunnelPage,
  renderUsersPage,
  renderUserCardPage,
  renderProjectsPage,
  renderReferralsPage,
  renderLinksPage,
  renderLinkClusterPage,
  renderSystemPage,
  renderSupportListPage,
  renderSupportChatPage,
} = require("./admin-pages");
const { createRateLimiter } = require("./rate-limiter");
const { extractClientIp } = require("./client-ip");
const {
  updateSupportChat,
  sendSupportBotMessage,
  closeSupportChatFromAdmin,
  appendTranscript,
  getChatTranscript,
  listSupportChats,
  SUPPORT_STORES,
  readSupportChatsFor,
  findSupportChatAnywhere,
} = require("./support-transcripts");

const COOKIE_NAME = "admin_panel";
const SESSION_MAX_AGE_SEC = 86400 * 7;


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

  // Ten wrong passwords from one address, then a quarter of an hour's pause.
  // Before this the password could be guessed at whatever speed a script ran.
  const loginFailures = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

  app.post("/admin/login", (req, res) => {
    const clientIp = extractClientIp(req) || "unknown";
    if (loginFailures.isBlocked(clientIp)) {
      res.status(429).type("html").send(renderLoginPage("Слишком много попыток. Подождите 15 минут."));
      return;
    }
    const username = String(req.body?.login || "").trim();
    const password = String(req.body?.password || "");
    if (!auth.checkCredentials(username, password)) {
      loginFailures.take(clientIp);
      res.status(401).type("html").send(renderLoginPage("Неверный логин или пароль."));
      return;
    }
    loginFailures.reset(clientIp);
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
        pageSize: USERS_PAGE_SIZE,
      }),
    );
  });

  // Faces come from Telegram. The organiser panel had its own avatar route
  // behind its own auth, so the admin panel had none and showed ids instead.
  app.get("/admin/projects", requireAuth, (_req, res) => {
    try {
      const draws = collectAllDraws(deps);
      const stats = PROJECT_STATS.buildProjectStats(
        draws,
        deps.readProjects().projects || [],
        deps.readUserProjectProfiles(),
      );
      res.type("html").send(renderProjectsPage(stats));
    } catch (error) {
      console.error("[admin] GET /admin/projects:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать статистику проектов."));
    }
  });

  app.get("/admin/funnel", requireAuth, (req, res) => {
    try {
      const stats = FUNNEL.buildFunnelStats({
        store: deps.joinFunnel,
        draws: collectAllDraws(deps),
        projects: deps.readProjects().projects || [],
        timezone: deps.timezone,
        period: req.query.period,
      });
      res.type("html").send(renderFunnelPage(stats, deps.timezone));
    } catch (error) {
      console.error("[admin] GET /admin/funnel:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать воронку."));
    }
  });

  app.get("/admin/referrals", requireAuth, (_req, res) => {
    try {
      const draws = collectAllDraws(deps);
      const stats = REFERRALS.buildReferralStats(draws, deps.readUserProjectProfiles());
      res.type("html").send(renderReferralsPage(stats));
    } catch (error) {
      console.error("[admin] GET /admin/referrals:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать статистику приглашений."));
    }
  });

  // The clusters are rebuilt from every draw and profile: kept five minutes,
  // the page is opened rarely and the picture does not change by the minute.
  let linksCache = null;
  function getLinksView() {
    if (linksCache && Date.now() - linksCache.at < 5 * 60 * 1000) {
      return linksCache.view;
    }
    const view = LINKS.buildLinksView({
      draws: collectAllDraws(deps),
      userProfiles: (deps.readUserProjectProfilesSnapshot || deps.readUserProjectProfiles)(),
      projects: deps.readProjects().projects || [],
      counterparties: deps.listWalletCounterparties ? deps.listWalletCounterparties() : [],
      normalizeAccountId: (value) => normalizeProjectAccountId(value) || "",
    });
    linksCache = { at: Date.now(), view };
    return view;
  }

  app.get("/admin/links", requireAuth, (_req, res) => {
    try {
      res.type("html").send(renderLinksPage(getLinksView()));
    } catch (error) {
      console.error("[admin] GET /admin/links:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать связи."));
    }
  });

  // Any member's id opens their cluster.
  app.get("/admin/links/:userId", requireAuth, (req, res) => {
    try {
      const userId = String(req.params.userId || "");
      const cluster = getLinksView().clusters.find((item) => item.members.some((m) => m.identity.userId === userId));
      if (!cluster) {
        res.status(404).type("html").send(renderAdminNotFound("Этот человек ни с кем не связан."));
        return;
      }
      res.type("html").send(renderLinkClusterPage(cluster));
    } catch (error) {
      console.error("[admin] GET /admin/links/:userId:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать кластер."));
    }
  });

  app.get("/admin/system", requireAuth, (_req, res) => {
    try {
      const state = SYS.collectSystemState({
        timezone: deps.timezone,
        buildId: process.env.JOIN_PAGE_BUILD,
        botUsername: deps.botUsername,
        schedulerIntervalMs: Number(process.env.CHECK_INTERVAL_MS || 30000),
        telegramCalls: deps.getTelegramCallStats ? deps.getTelegramCallStats() : null,
      });
      res.type("html").send(renderSystemPage(state));
    } catch (error) {
      console.error("[admin] GET /admin/system:", error);
      res.status(500).type("html").send(renderAdminNotFound("Не удалось собрать состояние системы."));
    }
  });

  app.get("/admin/avatar/:userId", requireAuth, async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    // One request per picture: the shared snapshot when index.js passes it.
    const readProfiles = deps.readUserProjectProfilesSnapshot || deps.readUserProjectProfiles;
    const fileId = readProfiles()?.users?.[userId]?.meta?.avatarFileId;
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

  // A profile screenshot from the join (profile-shot-store.js): to the owner in
  // the admin only, never cached outside the browser.
  app.get("/admin/users/:userId/shot/:projectId", requireAuth, (req, res) => {
    const userId = String(req.params.userId || "").trim();
    const projectId = String(req.params.projectId || "").trim();
    const profiles = deps.readUserProjectProfiles();
    const projects = resolveUserProjects(profiles.users?.[userId]?.projects);
    const file = /^\d+$/.test(userId) ? projects[projectId]?.profileShot?.file : null;
    const absolute = file ? resolveShotFile(DATA_DIR, file) : null;
    if (!absolute || !fs.existsSync(absolute)) {
      res.status(404).end();
      return;
    }
    res.set("Cache-Control", "private, no-store");
    res.sendFile(absolute);
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
      res.type("html").send(
        renderUserCardPage(deps, card, {
          money: (rub, usd) => formatMoneyTotalsLocal(rub, usd, deps),
          nameOf: (id) => displayNameForUser(id, profiles),
        }),
      );
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
  // Exported for tests: these decide what the users page actually shows, and
  // a page that throws while rendering is only caught by rendering it.
  renderReferralsPage,
  renderProjectsPage,
  renderFunnelPage,
  buildAdminUserProjectRows,
  buildAdminUserRows,
  sortAdminUserRows,
  filterAdminUserRows,
};
