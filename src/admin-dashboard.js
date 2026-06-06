const crypto = require("crypto");
const { DateTime } = require("luxon");
const { inferReferralOwnerId, normalizeProjectBrandName } = require("./project-profile-bridge");
const { buildUserProjectActivityIndex, getUserProjectActivity } = require("./admin-user-stats");
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

function formatStatsDay(isoValue, timezone) {
  if (!isoValue) {
    return "";
  }
  const dt = DateTime.fromISO(isoValue, { zone: timezone });
  if (!dt.isValid) {
    return "";
  }
  return dt.toFormat("yyyy-MM-dd");
}

function buildStats(deps, ownerFilter = "") {
  const { readData, readUserProjectProfiles, readProjects, timezone } = deps;
  const data = readData();
  const profiles = readUserProjectProfiles() || { users: {} };
  const projects = readProjects() || { projects: [] };

  let draws = asArray(data.draws);
  if (ownerFilter) {
    draws = draws.filter((draw) => String(draw.ownerId || "") === ownerFilter);
  }

  const statusCounts = { draft: 0, scheduled: 0, active: 0, finished: 0 };
  let totalWinners = 0;
  const participantSet = new Set();

  for (const draw of draws) {
    statusCounts[draw.status] = (statusCounts[draw.status] || 0) + 1;
    for (const id of draw.participantIds || []) {
      participantSet.add(String(id));
    }
    totalWinners += (draw.winnerIds || []).length;
  }

  const allUsers = Object.keys(profiles.users || {});
  const withTrc = allUsers.filter((key) => {
    const projectsNode = profiles.users[key]?.projects || {};
    return Object.values(projectsNode).some((p) => p.trc20Address);
  }).length;

  const dayMap = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    const day = DateTime.now().setZone(timezone).minus({ days: i }).toFormat("yyyy-MM-dd");
    dayMap.set(day, { draws: 0, participants: 0, uniqueJoins: new Set() });
  }

  for (const draw of draws) {
    const created = formatStatsDay(draw.createdAt, timezone);
    if (dayMap.has(created)) {
      dayMap.get(created).draws += 1;
    }
    const publish = formatStatsDay(draw.publishAt, timezone) || created;
    if (dayMap.has(publish)) {
      dayMap.get(publish).participants += asArray(draw.participantIds).length;
    }
    for (const participantId of asArray(draw.participantIds)) {
      const joinedAt = draw.participantMeta?.[String(participantId)]?.updatedAt;
      const joinDay = formatStatsDay(joinedAt, timezone);
      if (joinDay && dayMap.has(joinDay)) {
        dayMap.get(joinDay).uniqueJoins.add(String(participantId));
      }
    }
  }

  const chartLabels = [...dayMap.keys()];
  const chartDraws = chartLabels.map((k) => dayMap.get(k).draws);
  const chartParticipants = chartLabels.map((k) => dayMap.get(k).participants);
  const chartUniqueJoins = chartLabels.map((k) => dayMap.get(k).uniqueJoins.size);

  const recentDraws = [...draws]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 50)
    .map((draw) => ({
      id: draw.id,
      prize: draw.prize,
      status: draw.status,
      ownerId: draw.ownerId,
      participants: (draw.participantIds || []).length,
      winners: (draw.winnerIds || []).length,
      createdAt: draw.createdAt,
    }));

  const topOrganizers = new Map();
  for (const draw of asArray(data.draws)) {
    const key = String(draw.ownerId || "unknown");
    const row = topOrganizers.get(key) || { draws: 0, referrals: 0 };
    row.draws += 1;
    topOrganizers.set(key, row);
  }
  for (const [ownerId, row] of topOrganizers.entries()) {
    if (ownerId === "unknown") {
      row.referrals = 0;
      continue;
    }
    row.referrals = countReferralsForOwner(ownerId, projects, profiles);
  }

  const organizerRows = [...topOrganizers.entries()]
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => b.draws - a.draws)
    .slice(0, 20);

  return {
    totals: {
      users: allUsers.length,
      usersWithWallet: withTrc,
      draws: draws.length,
      uniqueParticipants: participantSet.size,
      referrals: countReferralsForOwner(ownerFilter, projects, profiles),
      winners: totalWinners,
      active: statusCounts.active || 0,
      finished: statusCounts.finished || 0,
    },
    statusCounts,
    chartLabels,
    chartDraws,
    chartParticipants,
    chartUniqueJoins,
    recentDraws,
    organizerRows,
  };
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

function buildAdminUserProjectRows(deps) {
  const { readUserProjectProfiles, readProjects, readData } = deps;
  const profiles = readUserProjectProfiles();
  const projectsList = readProjects().projects || [];
  const projectById = new Map(projectsList.map((project) => [project.id, project]));
  const rows = [];

  for (const [userKey, userNode] of Object.entries(profiles.users || {})) {
    const userId = userKey;
    const userLabel = labelForUser(userId, profiles);

    for (const [projectId, projectData] of Object.entries(userNode.projects || {})) {
      const project = projectById.get(projectId);
      if (!project) {
        continue;
      }

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

function filterAdminUserProjectRows(rows, filters) {
  const q = String(filters.q || "")
    .trim()
    .toLowerCase();
  const brand = String(filters.brand || "").trim();
  const refOwnerId = String(filters.refOwnerId || "").trim();
  const refFilter = String(filters.ref || "").trim();

  return rows.filter((row) => {
    if (brand && row.brandKey !== brand) {
      return false;
    }
    if (refOwnerId && row.referralOwnerId !== refOwnerId) {
      return false;
    }
    if (refFilter === "ref" && row.refStatus !== "ref") {
      return false;
    }
    if (refFilter === "non-ref" && row.refStatus !== "non-ref") {
      return false;
    }
    if (q) {
      const fraudHaystack = (row.fraudDetails || [])
        .map((detail) => `${detail.displayText || ""} ${(detail.linkedUserIds || []).join(" ")}`)
        .join(" ");
      const haystack =
        `${row.userId} ${row.userLabel} ${row.projectName} ${row.referralOwnerLabel} ${(row.fraudLabels || []).join(" ")} ${fraudHaystack}`.toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

function collectReferralOwnerOptions(rows, userProfiles) {
  const map = new Map();
  for (const row of rows) {
    if (!row.referralOwnerId) {
      continue;
    }
    map.set(row.referralOwnerId, row.referralOwnerLabel);
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
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

function renderAntiFraudCell(row) {
  if (!row.hasFraud) {
    return '<span class="badge badge-ok">Чисто</span>';
  }

  const badges = row.fraudLabels
    .map((label) => `<span class="badge badge-danger">${escapeHtml(label)}</span>`)
    .join("");

  const details = row.fraudDetails
    .map((detail) => `<li>${escapeHtml(detail.displayText)}</li>`)
    .join("");

  return `<div class="fraud-badges">${badges}</div>${details ? `<ul class="fraud-details">${details}</ul>` : ""}`;
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
        <td>${escapeHtml(row.userLabel)}<div class="mono">${escapeHtml(row.userId)}</div></td>
        <td>${escapeHtml(row.projectName)}</td>
        <td>${renderRefStatusBadge(row.refStatus)}</td>
        <td>${renderAntiFraudCell(row)}</td>
        <td>${escapeHtml(row.referralOwnerLabel)}${row.referralOwnerId ? `<div class="mono">${escapeHtml(row.referralOwnerId)}</div>` : ""}</td>
        <td>${escapeHtml(row.projectOwnerLabel)}</td>
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
  if (filters.q) queryBase.set("q", filters.q);

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
      <p class="hint">Показывает, на каком проекте (бренде) пользователь чей реф. Данные из SQLite (<code>data/giveaway.db</code>).</p>
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
            <th>Проект</th>
            <th>Реф</th>
            <th>Антифрод</th>
            <th>Реф организатора</th>
            <th>Владелец проекта</th>
            <th>Кошелёк</th>
            <th>Участий</th>
            <th>Побед</th>
            <th>Выигрыши</th>
            <th>Выплаты</th>
          </tr>
        </thead>
        <tbody>${tableRows || "<tr><td colspan='11'>Нет записей по выбранным фильтрам</td></tr>"}</tbody>
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
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; }
    .top { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #334155; background: #1e293b; }
    .top h1 { margin: 0; font-size: 20px; }
    .wrap { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 14px; }
    .stat b { display: block; font-size: 24px; margin-top: 4px; }
    .stat span { font-size: 12px; color: #94a3b8; }
    .panel { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .panel h2 { margin: 0 0 12px; font-size: 16px; }
    .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    select, .btn, input[type="search"], input[type="text"] { padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; font-size: 14px; }
    .btn { text-decoration: none; display: inline-block; cursor: pointer; }
    .btn-primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    .btn-ghost { background: transparent; }
    .btn-nav-active { background: #334155; border-color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #334155; vertical-align: top; }
    th { color: #94a3b8; font-weight: 600; }
    .logout { margin: 0; }
    .top-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .admin-nav { display: flex; gap: 6px; }
    .hint { color: #94a3b8; font-size: 13px; margin: 0 0 14px; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #334155; white-space: nowrap; }
    .badge-ok { background: #14532d; color: #bbf7d0; }
    .badge-warn { background: #713f12; color: #fde68a; }
    .badge-muted { background: #334155; color: #cbd5e1; }
    .badge-danger { background: #7f1d1d; color: #fecaca; }
    .pager { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; font-size: 13px; color: #94a3b8; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .wrap-wide { max-width: 1600px; }
    .users-table-wrap { overflow-x: auto; }
    .fraud-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
    .fraud-details { margin: 4px 0 0; padding-left: 16px; color: #94a3b8; font-size: 12px; max-width: 360px; }
    .fraud-details li { margin-bottom: 2px; }
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

function renderDashboardPage(deps, stats, organizers, selectedOwner, userProfiles) {
  const ownerOptions = organizers
    .map(
      (o) =>
        `<option value="${escapeHtml(o.id)}"${o.id === selectedOwner ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");

  const drawRows = stats.recentDraws
    .map((draw) => {
      const ownerLabel = labelForUser(draw.ownerId, userProfiles);
      return `<tr>
        <td>${escapeHtml(draw.prize)}</td>
        <td><span class="tag tag-${escapeHtml(draw.status)}">${escapeHtml(draw.status)}</span></td>
        <td>${escapeHtml(ownerLabel)}</td>
        <td>${draw.participants}</td>
        <td>${draw.winners}</td>
        <td>${escapeHtml(draw.createdAt ? draw.createdAt.slice(0, 16).replace("T", " ") : "—")}</td>
      </tr>`;
    })
    .join("");

  const orgRows = stats.organizerRows
    .map((row) => {
      const label = labelForUser(row.id, userProfiles);
      return `<tr>
        <td>${escapeHtml(label)}</td>
        <td>${row.draws}</td>
        <td>${row.referrals}</td>
        <td><a href="/admin/dashboard?ownerId=${encodeURIComponent(row.id)}">Фильтр</a></td>
      </tr>`;
    })
    .join("");

  const chartPayload = JSON.stringify({
    labels: stats.chartLabels.map((label) => label.slice(5)),
    draws: stats.chartDraws,
    participants: stats.chartParticipants,
    uniqueJoins: stats.chartUniqueJoins,
    status: stats.statusCounts,
  });

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RollerBot — Admin</title>
  <style>
    ${getAdminBaseStyles()}
    .tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #334155; }
    .tag-active { background: #14532d; color: #bbf7d0; }
    .tag-finished { background: #1e3a5f; color: #bfdbfe; }
    .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .chart-card { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 12px; }
    .chart-card h3 { margin: 0 0 10px; font-size: 13px; color: #94a3b8; font-weight: 600; }
    .chart-box { position: relative; height: 280px; }
    .chart-box.chart-box-sm { height: 240px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
  ${renderAdminTop("RollerBot Admin", "stats")}
  <main class="wrap">
    <div class="grid">
      <div class="stat"><span>Пользователей</span><b>${stats.totals.users}</b></div>
      <div class="stat"><span>С кошельком TRC-20</span><b>${stats.totals.usersWithWallet}</b></div>
      <div class="stat"><span>Розыгрышей</span><b>${stats.totals.draws}</b></div>
      <div class="stat"><span>Активных</span><b>${stats.totals.active}</b></div>
      <div class="stat"><span>Завершённых</span><b>${stats.totals.finished}</b></div>
      <div class="stat"><span>Участников (уник.)</span><b>${stats.totals.uniqueParticipants}</b></div>
      <div class="stat"><span>Рефералов${selectedOwner ? "" : " (все)"}</span><b>${stats.totals.referrals}</b></div>
    </div>

    <section class="panel">
      <h2>Фильтр по организатору</h2>
      <form class="filters" method="get" action="/admin/dashboard">
        <label>
          <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px">Организатор</span>
          <select name="ownerId">
            <option value="">Все</option>
            ${ownerOptions}
          </select>
        </label>
        <button type="submit" class="btn btn-primary">Применить</button>
        ${selectedOwner ? `<a class="btn btn-ghost" href="/admin/dashboard">Сбросить</a>` : ""}
      </form>
    </section>

    <section class="panel">
      <h2>Графики (14 дней)</h2>
      <div class="charts-grid">
        <div class="chart-card" style="grid-column: 1 / -1;">
          <h3>Розыгрыши и участники</h3>
          <div class="chart-box"><canvas id="chartActivity"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Новые участники по дням</h3>
          <div class="chart-box chart-box-sm"><canvas id="chartJoins"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Статусы розыгрышей</h3>
          <div class="chart-box chart-box-sm"><canvas id="chartStatus"></canvas></div>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Организаторы</h2>
      <table>
        <thead><tr><th>Организатор</th><th>Розыгрышей</th><th>Рефералов</th><th></th></tr></thead>
        <tbody>${orgRows || "<tr><td colspan='4'>Нет данных</td></tr>"}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Последние розыгрыши</h2>
      <table>
        <thead><tr><th>Приз</th><th>Статус</th><th>Организатор</th><th>Участн.</th><th>Побед.</th><th>Создан</th></tr></thead>
        <tbody>${drawRows || "<tr><td colspan='6'>Нет данных</td></tr>"}</tbody>
      </table>
    </section>
  </main>
  <script>
    (function () {
      const payload = ${chartPayload};
      const axisColor = "#94a3b8";
      const gridColor = "rgba(148, 163, 184, 0.15)";
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: axisColor } },
          tooltip: {
            backgroundColor: "#1e293b",
            borderColor: "#475569",
            borderWidth: 1,
            titleColor: "#f8fafc",
            bodyColor: "#e2e8f0",
          },
        },
      };

      const activityCtx = document.getElementById("chartActivity");
      if (activityCtx) {
        new Chart(activityCtx, {
          type: "line",
          data: {
            labels: payload.labels,
            datasets: [
              {
                label: "Новых розыгрышей",
                data: payload.draws,
                borderColor: "#60a5fa",
                backgroundColor: "rgba(96, 165, 250, 0.18)",
                fill: true,
                tension: 0.3,
                yAxisID: "y",
              },
              {
                label: "Записей участия",
                data: payload.participants,
                borderColor: "#4ade80",
                backgroundColor: "rgba(74, 222, 128, 0.12)",
                fill: true,
                tension: 0.3,
                yAxisID: "y1",
              },
            ],
          },
          options: {
            ...commonOptions,
            scales: {
              x: { ticks: { color: axisColor }, grid: { color: gridColor } },
              y: {
                position: "left",
                ticks: { color: axisColor, precision: 0 },
                grid: { color: gridColor },
                title: { display: true, text: "Розыгрыши", color: axisColor },
              },
              y1: {
                position: "right",
                ticks: { color: axisColor, precision: 0 },
                grid: { drawOnChartArea: false },
                title: { display: true, text: "Участия", color: axisColor },
              },
            },
          },
        });
      }

      const joinsCtx = document.getElementById("chartJoins");
      if (joinsCtx) {
        new Chart(joinsCtx, {
          type: "bar",
          data: {
            labels: payload.labels,
            datasets: [
              {
                label: "Уникальных вступлений",
                data: payload.uniqueJoins,
                backgroundColor: "rgba(250, 204, 21, 0.75)",
                borderColor: "#eab308",
                borderWidth: 1,
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...commonOptions,
            scales: {
              x: { ticks: { color: axisColor }, grid: { color: gridColor } },
              y: { ticks: { color: axisColor, precision: 0 }, grid: { color: gridColor } },
            },
          },
        });
      }

      const statusCtx = document.getElementById("chartStatus");
      if (statusCtx) {
        const status = payload.status || {};
        new Chart(statusCtx, {
          type: "doughnut",
          data: {
            labels: ["Активные", "Завершённые", "Запланированные", "Черновики"],
            datasets: [
              {
                data: [
                  status.active || 0,
                  status.finished || 0,
                  status.scheduled || 0,
                  status.draft || 0,
                ],
                backgroundColor: ["#22c55e", "#3b82f6", "#f59e0b", "#64748b"],
                borderColor: "#0f172a",
                borderWidth: 2,
              },
            ],
          },
          options: {
            ...commonOptions,
            plugins: {
              ...commonOptions.plugins,
              legend: { position: "bottom", labels: { color: axisColor } },
            },
          },
        });
      }
    })();
  </script>
</body>
</html>`;
}

function renderSupportListPage(chats, timezone) {
  const rows = chats
    .map((chat) => {
      const time = formatMessageTime(chat.lastMessageAt, timezone);
      const statusBadge = chat.sessionClosed
        ? '<span class="badge badge-warn">завершён</span>'
        : '<span class="badge">активен</span>';
      return `<tr>
        <td><a href="/admin/support/${encodeURIComponent(chat.chatId)}">${escapeHtml(chat.label)}</a></td>
        <td>${escapeHtml(chat.agentName)}</td>
        <td>${statusBadge}</td>
        <td class="preview-cell">${escapeHtml(chat.preview)}</td>
        <td>${chat.messageCount}</td>
        <td>${escapeHtml(time)}</td>
      </tr>`;
    })
    .join("");

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
    .preview-cell { max-width: 320px; color: #cbd5e1; }
  </style>
</head>
<body>
  ${renderAdminTop("Поддержка", "support")}
  <main class="wrap">
    <section class="panel">
      <h2>Диалоги с ботом поддержки</h2>
      <p class="hint">Переписки из SQLite (<code>data/giveaway.db</code>, ключ support-chats). В диалоге можно отправить ответ пользователю в Telegram.</p>
      <table class="support-table">
        <thead>
          <tr>
            <th>Пользователь</th>
            <th>Оператор</th>
            <th>Статус</th>
            <th>Последнее</th>
            <th>Сообщ.</th>
            <th>Время</th>
          </tr>
        </thead>
        <tbody>${rows || "<tr><td colspan='6'>Пока нет диалогов</td></tr>"}</tbody>
      </table>
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
    <p><a class="btn btn-ghost" href="/admin/support">← Все диалоги</a></p>
    <section class="panel">
      <h2 style="margin:0 0 8px">${escapeHtml(label)}</h2>
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
        sessionClosed
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
      const data = deps.readData();
      const profiles = deps.readUserProjectProfiles() || { users: {} };
      const delegated = deps.readDelegatedAdmins()?.admins || [];
      const organizers = collectOrganizerOptions(
        asArray(data.draws),
        deps.adminIds,
        delegated,
        profiles,
      );
      const stats = buildStats(deps, selectedOwner);
      res.type("html").send(renderDashboardPage(deps, stats, organizers, selectedOwner, profiles));
    } catch (error) {
      console.error("[admin] GET /admin/dashboard:", error);
      res.status(500).type("html").send(
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Admin — ошибка</title></head><body style="font-family:system-ui,sans-serif;padding:24px;background:#0f172a;color:#e2e8f0"><h1>Не удалось загрузить дашборд</h1><p>Проверьте логи giveaway-bot на сервере. Частая причина — битые даты или формат данных в базе.</p><p><a href="/admin/login" style="color:#93c5fd">Вернуться ко входу</a></p></body></html>`,
      );
    }
  });

  app.get("/admin/users", requireAuth, (req, res) => {
    const filters = {
      brand: String(req.query.brand || "").trim(),
      refOwnerId: String(req.query.refOwnerId || "").trim(),
      ref: String(req.query.ref || "").trim(),
      q: String(req.query.q || "").trim(),
    };
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);

    const projectsList = deps.readProjects().projects || [];
    const profiles = deps.readUserProjectProfiles();
    const activityIndex = buildUserProjectActivityIndex(deps, profiles, (userId) =>
      labelForUser(userId, profiles),
    );
    const allRows = buildAdminUserProjectRows(deps).map((row) => ({
      ...row,
      ...getUserProjectActivity(activityIndex, row.userId, row.projectId),
    }));
    const filteredRows = filterAdminUserProjectRows(allRows, filters);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / USERS_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * USERS_PAGE_SIZE;
    const pageRows = filteredRows.slice(offset, offset + USERS_PAGE_SIZE);

    const stats = {
      usersTotal: Object.keys(profiles.users || {}).length,
      bindingsTotal: allRows.length,
      refsTotal: allRows.filter((row) => row.refStatus === "ref").length,
      nonRefsTotal: allRows.filter((row) => row.refStatus === "non-ref").length,
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
        refOwners: collectReferralOwnerOptions(allRows, profiles),
        stats,
      }),
    );
  });

  app.get("/admin/support", requireAuth, (_req, res) => {
    const raw = readSupportChats();
    const chats = listSupportChats(raw);
    res.type("html").send(renderSupportListPage(chats, deps.timezone));
  });

  function renderSupportChatView(res, chatId, flash) {
    const raw = readSupportChats();
    const state = raw[chatId];
    if (!state) {
      res.status(404).type("html").send(`<!doctype html><html lang="ru"><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px"><p>Диалог не найден.</p><p><a href="/admin/support" style="color:#93c5fd">← К списку</a></p></body></html>`);
      return false;
    }
    res.type("html").send(renderSupportChatPage(chatId, state, deps.timezone, { flash }));
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

module.exports = { registerAdminDashboard, hashPassword };
