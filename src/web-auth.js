const crypto = require("crypto");
const { getMiniAppViewportMeta, getTelegramPanelAuthRedirectScript } = require("./miniapp-ui");

const AUTH_MAX_AGE_SEC = 86400 * 7;
const COOKIE_NAME = "tg_sess";

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq);
    if (key === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return null;
}

function validateInitData(initData, botToken) {
  if (!initData || !botToken) {
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      return null;
    }

    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (calculatedHash !== hash) {
      return null;
    }

    const authDate = Number(params.get("auth_date") || 0);
    if (authDate && Date.now() / 1000 - authDate > AUTH_MAX_AGE_SEC) {
      return null;
    }

    const userRaw = params.get("user");
    if (!userRaw) {
      return null;
    }

    const user = JSON.parse(userRaw);
    if (!user?.id) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

function createSessionToken(userId, botToken) {
  const payload = String(userId);
  const sig = crypto.createHmac("sha256", botToken).update(`tg_sess:${payload}`).digest("hex");
  return `${payload}.${sig}`;
}

function parseSessionToken(token, botToken) {
  if (!token || !botToken) {
    return null;
  }

  const dot = token.lastIndexOf(".");
  if (dot === -1) {
    return null;
  }

  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", botToken).update(`tg_sess:${userId}`).digest("hex");
  if (sig !== expected) {
    return null;
  }

  const id = Number(userId);
  return Number.isFinite(id) ? { id } : null;
}

function renderLoginPage(botUsername, publicUrl, panelPath = "/panel") {
  const botLink = botUsername ? `https://t.me/${botUsername}?start=panel` : "https://t.me";
  const enterPath = `${panelPath.replace(/\/$/, "")}/enter`;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${getMiniAppViewportMeta()}
  <title>Roller Bot — вход</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script>${getTelegramPanelAuthRedirectScript(panelPath)}</script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #eef3ff;
      color: #151a2d;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      max-width: 360px;
      width: 100%;
      background: #fff;
      border-radius: 20px;
      padding: 28px 22px;
      text-align: center;
      box-shadow: 0 16px 40px rgba(27, 45, 94, 0.12);
    }
    h1 { font-size: 22px; margin: 0 0 10px; }
    p { color: #65708a; line-height: 1.5; margin: 0 0 18px; }
    a {
      display: block;
      background: #325fff;
      color: #fff;
      text-decoration: none;
      padding: 14px 16px;
      border-radius: 14px;
      font-weight: 700;
    }
    .loading { display: block; color: #65708a; font-size: 15px; }
    .fallback { display: none; }
    body.show-fallback .loading { display: none; }
    body.show-fallback .fallback { display: block; }
  </style>
</head>
<body>
  <form id="panelEnterForm" method="POST" action="${enterPath}" style="display:none">
    <input type="hidden" name="initData" id="panelEnterInitData" value="" />
  </form>
  <div class="card">
    <h1>🎁 Панель розыгрышей</h1>
    <p class="loading">Загрузка…</p>
    <div class="fallback">
      <p>Откройте бота в Telegram и нажмите кнопку «📱 Панель» под полем ввода или отправьте /panel.</p>
      <a href="${botLink}">Открыть @${botUsername || "bot"}</a>
    </div>
  </div>
  <script>
    window.setTimeout(function () {
      document.body.classList.add("show-fallback");
    }, 5000);
  </script>
</body>
</html>`;
}

function createWebAuth({ botToken, disabled, cookieSecure, defaultUserId, botUsername, publicUrl, panelPath = "/panel" }) {
  function resolveUser(req) {
    if (disabled) {
      return { id: defaultUserId, dev: true };
    }

    const fromCookie = parseSessionToken(getCookie(req, COOKIE_NAME), botToken);
    if (fromCookie) {
      return { id: fromCookie.id };
    }

    const initData =
      req.headers["x-telegram-init-data"] ||
      req.body?.initData ||
      req.body?.telegramInitData ||
      req.query?.telegramInitData;
    const user = validateInitData(initData, botToken);
    if (user) {
      return { id: user.id, user };
    }

    return null;
  }

  function attachUser(req, _res, next) {
    req.webUser = resolveUser(req);
    next();
  }

  function requireAuth(req, res, next) {
    const user = resolveUser(req);
    if (!user?.id) {
      if (req.method === "GET") {
        res.status(200).type("html").send(renderLoginPage(botUsername, publicUrl, panelPath));
        return;
      }
      res.status(401).send("Unauthorized");
      return;
    }

    const initData =
      req.headers["x-telegram-init-data"] ||
      req.body?.initData ||
      req.body?.telegramInitData ||
      req.query?.telegramInitData;
    if (initData && validateInitData(initData, botToken)) {
      setSessionCookie(res, user.id);
    }

    req.webUser = user;
    next();
  }

  function setSessionCookie(res, userId) {
    const token = createSessionToken(userId, botToken);
    const parts = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      `Max-Age=${AUTH_MAX_AGE_SEC}`,
    ];
    if (cookieSecure) {
      parts.push("Secure");
      parts.push("SameSite=None");
    } else {
      parts.push("SameSite=Lax");
    }
    res.setHeader("Set-Cookie", parts.join("; "));
  }

  return { attachUser, requireAuth, resolveUser, setSessionCookie };
}

module.exports = { createWebAuth, validateInitData, renderLoginPage };
