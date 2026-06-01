const crypto = require("crypto");
const { DateTime } = require("luxon");

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

function buildStats(deps, ownerFilter = "") {
  const { readData, readUserProjectProfiles, readProjects, readKnownChannels, timezone } = deps;
  const data = readData();
  const profiles = readUserProjectProfiles();
  const projects = readProjects();
  const channels = readKnownChannels();

  let draws = data.draws || [];
  if (ownerFilter) {
    draws = draws.filter((draw) => String(draw.ownerId || "") === ownerFilter);
  }

  const statusCounts = { draft: 0, scheduled: 0, active: 0, finished: 0 };
  let totalParticipants = 0;
  let totalWinners = 0;
  const participantSet = new Set();

  for (const draw of draws) {
    statusCounts[draw.status] = (statusCounts[draw.status] || 0) + 1;
    for (const id of draw.participantIds || []) {
      participantSet.add(String(id));
      totalParticipants += 1;
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
    dayMap.set(day, { draws: 0, participants: 0 });
  }

  for (const draw of draws) {
    const created = draw.createdAt
      ? DateTime.fromISO(draw.createdAt, { zone: timezone }).toFormat("yyyy-MM-dd")
      : "";
    if (dayMap.has(created)) {
      dayMap.get(created).draws += 1;
    }
    const publish = draw.publishAt
      ? DateTime.fromISO(draw.publishAt, { zone: timezone }).toFormat("yyyy-MM-dd")
      : created;
    if (dayMap.has(publish)) {
      dayMap.get(publish).participants += (draw.participantIds || []).length;
    }
  }

  const chartLabels = [...dayMap.keys()];
  const chartDraws = chartLabels.map((k) => dayMap.get(k).draws);
  const chartParticipants = chartLabels.map((k) => dayMap.get(k).participants);

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
  for (const draw of data.draws || []) {
    const key = String(draw.ownerId || "unknown");
    const row = topOrganizers.get(key) || { draws: 0, participants: 0 };
    row.draws += 1;
    row.participants += (draw.participantIds || []).length;
    topOrganizers.set(key, row);
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
      projects: (projects.projects || []).length,
      channels: (channels.channels || []).length,
      uniqueParticipants: participantSet.size,
      participantEntries: totalParticipants,
      winners: totalWinners,
      active: statusCounts.active || 0,
      finished: statusCounts.finished || 0,
    },
    statusCounts,
    chartLabels,
    chartDraws,
    chartParticipants,
    recentDraws,
    organizerRows,
  };
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

function renderBarChart(labels, values, color) {
  const max = Math.max(1, ...values);
  const bars = values
    .map((v, i) => {
      const h = Math.round((v / max) * 100);
      return `<div class="bar-wrap" title="${escapeHtml(labels[i])}: ${v}"><div class="bar" style="height:${h}%;background:${color}"></div><span>${escapeHtml(labels[i].slice(5))}</span></div>`;
    })
    .join("");
  return `<div class="chart">${bars}</div>`;
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
        <td>${row.participants}</td>
        <td><a href="/admin/dashboard?ownerId=${encodeURIComponent(row.id)}">Фильтр</a></td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RollerBot — Admin</title>
  <style>
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
    select, .btn { padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; font-size: 14px; }
    .btn { text-decoration: none; display: inline-block; cursor: pointer; }
    .btn-primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    .btn-ghost { background: transparent; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; }
    .tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #334155; }
    .tag-active { background: #14532d; color: #bbf7d0; }
    .tag-finished { background: #1e3a5f; color: #bfdbfe; }
    .chart { display: flex; align-items: flex-end; gap: 6px; height: 140px; padding-top: 8px; }
    .bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; min-width: 0; }
    .bar { width: 100%; max-width: 28px; border-radius: 6px 6px 0 0; min-height: 4px; }
    .bar-wrap span { font-size: 10px; color: #64748b; margin-top: 4px; }
    .logout { margin: 0; }
  </style>
</head>
<body>
  <header class="top">
    <h1>RollerBot Admin</h1>
    <form method="post" action="/admin/logout" class="logout"><button type="submit" class="btn btn-ghost">Выйти</button></form>
  </header>
  <main class="wrap">
    <div class="grid">
      <div class="stat"><span>Пользователей</span><b>${stats.totals.users}</b></div>
      <div class="stat"><span>С кошельком TRC-20</span><b>${stats.totals.usersWithWallet}</b></div>
      <div class="stat"><span>Розыгрышей</span><b>${stats.totals.draws}</b></div>
      <div class="stat"><span>Активных</span><b>${stats.totals.active}</b></div>
      <div class="stat"><span>Завершённых</span><b>${stats.totals.finished}</b></div>
      <div class="stat"><span>Участников (уник.)</span><b>${stats.totals.uniqueParticipants}</b></div>
      <div class="stat"><span>Записей участия</span><b>${stats.totals.participantEntries}</b></div>
      <div class="stat"><span>Проектов / каналов</span><b>${stats.totals.projects} / ${stats.totals.channels}</b></div>
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
      <h2>Розыгрыши за 14 дней</h2>
      ${renderBarChart(stats.chartLabels, stats.chartDraws, "#3b82f6")}
    </section>

    <section class="panel">
      <h2>Участники по дням (сумма по розыгрышам)</h2>
      ${renderBarChart(stats.chartLabels, stats.chartParticipants, "#22c55e")}
    </section>

    <section class="panel">
      <h2>Организаторы</h2>
      <table>
        <thead><tr><th>Организатор</th><th>Розыгрышей</th><th>Участников</th><th></th></tr></thead>
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
    const selectedOwner = String(req.query.ownerId || "").trim();
    const data = deps.readData();
    const profiles = deps.readUserProjectProfiles();
    const delegated = deps.readDelegatedAdmins().admins || [];
    const organizers = collectOrganizerOptions(
      data.draws,
      deps.adminIds,
      delegated,
      profiles,
    );
    const stats = buildStats(deps, selectedOwner);
    res.type("html").send(renderDashboardPage(deps, stats, organizers, selectedOwner, profiles));
  });
}

module.exports = { registerAdminDashboard, hashPassword };
