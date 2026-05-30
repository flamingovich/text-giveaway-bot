const express = require("express");
const { getMiniAppStyles, getMiniAppInitScript } = require("./miniapp-ui");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDesignBanner() {
  return "";
}

function renderDesignBannerStyles() {
  return `
    .design-banner {
      background: #fff8e6;
      border: 1px solid #ffe2a8;
      color: #6a4f00;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 14px;
      border-radius: 12px;
      margin-bottom: 14px;
      text-align: center;
    }
  `;
}

function renderOrganizerGatePage(botUsername) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Панель организатора</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      min-height: 100vh;
      background: #eef3ff;
      color: #151a2d;
      padding: max(20px, env(safe-area-inset-top)) 16px 24px;
      box-sizing: border-box;
      max-width: 480px;
      margin-inline: auto;
    }
    .card {
      background: #fff;
      border-radius: 18px;
      padding: 22px 18px;
      box-shadow: 0 12px 32px rgba(27, 45, 94, 0.1);
    }
    h1 { font-size: 22px; margin: 0 0 10px; }
    p { color: #65708a; line-height: 1.55; margin: 0 0 12px; }
    ol { margin: 0; padding-left: 20px; color: #334; line-height: 1.6; }
    .note {
      margin-top: 16px;
      padding: 12px;
      background: #fff8e6;
      border: 1px solid #ffe2a8;
      border-radius: 12px;
      font-size: 14px;
      color: #6a4f00;
    }
    ${renderDesignBannerStyles()}
    ${getMiniAppStyles()}
  </style>
</head>
<body>
  ${renderDesignBanner()}
  <div class="card">
    <h1>🎯 Панель организатора</h1>
    <p>Эта панель только для владельцев каналов, которые проводят розыgрыши.</p>
    <ol>
      <li>Добавьте @${escapeHtml(botUsername)} админом в канал</li>
      <li>Перешлите пост из канала боту (<code>/link_channel</code>)</li>
      <li>Откройте «Панель» снова</li>
    </ol>
    <div class="note">
      Если вы <strong>участник</strong> розыgрыша — нажимайте кнопку «Участвовать» в посте канала, не эту панель.
    </div>
  </div>
  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: process.env.WEB_ONLY === "true" })}
  </script>
</body>
</html>`;
}

function renderJoinPage(drawId, draw, project) {
  const prize = escapeHtml(draw?.prize || "Приз");
  const projectName = escapeHtml(project?.name || "Проект");
  const refLink = escapeHtml(project?.refLink || "");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Участие в розыgрыше</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      --bg: #f3f6ff;
      --card: #fff;
      --text: #151a2d;
      --sub: #65708a;
      --primary: #325fff;
      --line: #dfe5f4;
      --ok: #1f6a3c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0 auto;
      max-width: 480px;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #eef3ff 0%, var(--bg) 100%);
      color: var(--text);
      padding: max(12px, env(safe-area-inset-top)) 14px max(20px, env(safe-area-inset-bottom));
    }
    .hero {
      background: linear-gradient(135deg, #2a4ddd, #325fff);
      color: #fff;
      border-radius: 18px;
      padding: 18px;
      margin-bottom: 14px;
    }
    .hero h1 { margin: 0 0 6px; font-size: 22px; }
    .hero p { margin: 0; opacity: 0.92; font-size: 14px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .step-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sub);
      margin-bottom: 8px;
    }
    .captcha-q { font-size: 28px; font-weight: 800; text-align: center; margin: 12px 0; }
    .btn-grid { display: grid; gap: 8px; }
    button, .link-btn {
      width: 100%;
      border: none;
      border-radius: 12px;
      padding: 13px 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }
    button.primary { background: var(--primary); color: #fff; }
    button.secondary { background: #eef2ff; color: #2d49cc; }
    button.ghost { background: #f4f6fb; color: #556; }
    .link-btn {
      display: block;
      text-align: center;
      text-decoration: none;
      background: #eef2ff;
      color: #2d49cc;
    }
    input {
      width: 100%;
      border: 1px solid #cfd8ef;
      border-radius: 12px;
      padding: 12px;
      font-size: 15px;
      margin: 8px 0;
    }
    .guide img {
      width: 100%;
      border-radius: 10px;
      margin: 8px 0;
      border: 1px solid var(--line);
    }
    .guide p { font-size: 13px; color: var(--sub); margin: 4px 0 10px; }
    .msg { padding: 12px; border-radius: 12px; font-size: 14px; margin-bottom: 12px; }
    .msg.error { background: #fff0f0; color: #a12626; border: 1px solid #ffcaca; }
    .msg.ok { background: #ebfff1; color: var(--ok); border: 1px solid #a7e6bc; }
    .hidden { display: none !important; }
    .loading { text-align: center; color: var(--sub); padding: 24px; }
    ${renderDesignBannerStyles()}
    .preview-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .preview-nav button {
      width: auto;
      flex: 1 1 auto;
      min-width: 72px;
      padding: 8px 10px;
      font-size: 12px;
      background: #fff;
      border: 1px solid #cfd8ef;
      color: #334;
    }
    .preview-nav button.active {
      background: #eef2ff;
      border-color: #8fa8ff;
      color: #2d49cc;
    }
    ${renderDesignBannerStyles()}
    ${getMiniAppStyles()}
  </style>
</head>
<body>
  ${renderDesignBanner()}
  <div id="previewNav" class="preview-nav hidden"></div>
  <div class="hero">
    <h1>🎁 ${prize}</h1>
    <p>Проект: ${projectName}</p>
  </div>
  <div id="message" class="msg hidden"></div>
  <div id="loading" class="loading">Загрузка...</div>

  <div id="step-captcha" class="card hidden">
    <div class="step-label">Шаг 1 · Проверка</div>
    <div class="captcha-q" id="captchaQuestion"></div>
    <div class="btn-grid" id="captchaOptions"></div>
  </div>

  <div id="step-registration" class="card hidden">
    <div class="step-label">Шаг 2 · Регистрация</div>
    <p style="color:var(--sub);margin:0 0 12px;">Зарегистрируйтесь на проекте, затем вернитесь сюда.</p>
    <a class="link-btn" id="projectLink" href="${refLink}" target="_blank" rel="noopener">Перейти на проект</a>
    <div style="height:10px"></div>
    <button type="button" class="primary" id="registrationDoneBtn">Я зарегистрировался</button>
  </div>

  <div id="step-referral" class="card hidden">
    <div class="step-label">Шаг 3 · Реферал</div>
    <p style="color:var(--sub);margin:0 0 12px;">Вы зарегистрировались по реферальной ссылке проекта?</p>
    <div class="btn-grid">
      <button type="button" class="primary" id="referralYesBtn">Да, подтверждаю</button>
      <button type="button" class="ghost" id="referralNoBtn">Нет, я не реф</button>
    </div>
  </div>

  <div id="step-nickname" class="card hidden">
    <div class="step-label">Шаг 3 · Никнейм</div>
    <p style="color:var(--sub);margin:0 0 8px;">Введите никнейм на проекте (минимум 3 символа).</p>
    <input id="nicknameInput" placeholder="Ваш никнейм" autocomplete="off" />
    <button type="button" class="primary" id="nicknameSubmitBtn">Проверить</button>
  </div>

  <div id="step-trc20" class="card hidden">
    <div class="step-label">Шаг 4 · TRC-20 адрес</div>
    <p style="color:var(--sub);margin:0 0 8px;">Отправьте TRC-20 адрес с проекта. Инструкция:</p>
    <div class="guide">
      <p>1. Откройте депозит на проекте</p>
      <img src="/assets/trc20-guide/step-1.png" alt="step 1" />
      <p>2. Выберите Tether TRC-20</p>
      <img src="/assets/trc20-guide/step-2.png" alt="step 2" />
      <p>3. Скопируйте адрес</p>
      <img src="/assets/trc20-guide/step-3.png" alt="step 3" />
    </div>
    <input id="trc20Input" placeholder="T..." autocomplete="off" />
    <button type="button" class="primary" id="trc20SubmitBtn">Участвовать</button>
  </div>

  <div id="step-done" class="card hidden">
    <div class="step-label">Готово</div>
    <p id="doneText" style="margin:0;font-size:16px;line-height:1.5;color:var(--ok);font-weight:700;"></p>
  </div>

  <script>
    ${getMiniAppInitScript({ authSession: false, previewShell: process.env.WEB_ONLY === "true" })}
    const DRAW_ID = ${JSON.stringify(drawId)};
    const tg = window.Telegram?.WebApp;

    function initData() {
      return tg?.initData || "";
    }

    function showMessage(text, type) {
      const el = document.getElementById("message");
      el.textContent = text;
      el.className = "msg " + (type || "error");
      el.classList.remove("hidden");
    }

    function hideMessage() {
      document.getElementById("message").classList.add("hidden");
    }

    function showStep(name) {
      ["captcha", "registration", "referral", "nickname", "trc20", "done"].forEach((step) => {
        document.getElementById("step-" + step).classList.toggle("hidden", step !== name);
      });
      document.getElementById("loading").classList.add("hidden");
    }

    async function api(path, body) {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData(),
        },
        body: JSON.stringify({ ...body, initData: initData() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Ошибка запроса");
      }
      return data;
    }

    function renderCaptcha(task) {
      document.getElementById("captchaQuestion").textContent = task.a + " + " + task.b + " = ?";
      const wrap = document.getElementById("captchaOptions");
      wrap.innerHTML = "";
      task.options.forEach((value) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "secondary";
        btn.textContent = String(value);
        btn.addEventListener("click", async () => {
          try {
            const data = await api("/api/join/" + encodeURIComponent(DRAW_ID) + "/captcha", { answer: value });
            hideMessage();
            handleStep(data.step, data);
          } catch (error) {
            showMessage(error.message);
          }
        });
        wrap.appendChild(btn);
      });
      showStep("captcha");
    }

    function handleStep(step, payload) {
      if (step === "captcha") {
        renderCaptcha(payload.captcha);
        return;
      }
      if (step === "registration") {
        showStep("registration");
        return;
      }
      if (step === "referral") {
        showStep("referral");
        return;
      }
      if (step === "nickname") {
        showStep("nickname");
        return;
      }
      if (step === "trc20") {
        showStep("trc20");
        return;
      }
      if (step === "done") {
        document.getElementById("doneText").textContent = payload.message || "Вы участвуете ✅";
        showStep("done");
        if (tg?.close) {
          setTimeout(() => tg.close(), 2500);
        }
      }
    }

    document.getElementById("registrationDoneBtn").addEventListener("click", async () => {
      try {
        const data = await api("/api/join/" + encodeURIComponent(DRAW_ID) + "/registration", { action: "opened" });
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      }
    });

    document.getElementById("referralYesBtn").addEventListener("click", () => {
      showStep("nickname");
    });

    document.getElementById("referralNoBtn").addEventListener("click", async () => {
      try {
        const data = await api("/api/join/" + encodeURIComponent(DRAW_ID) + "/referral", { action: "non_referral" });
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      }
    });

    document.getElementById("nicknameSubmitBtn").addEventListener("click", async () => {
      const nickname = document.getElementById("nicknameInput").value.trim();
      if (nickname.length < 3) {
        showMessage("Никнейм слишком короткий (минимум 3 символа).");
        return;
      }
      const btn = document.getElementById("nicknameSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Проверяю...";
      try {
        await new Promise((r) => setTimeout(r, (Math.floor(Math.random() * 8) + 8) * 1000));
        const data = await api("/api/join/" + encodeURIComponent(DRAW_ID) + "/referral", {
          action: "confirm",
          nickname,
        });
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Проверить";
      }
    });

    document.getElementById("trc20SubmitBtn").addEventListener("click", async () => {
      const address = document.getElementById("trc20Input").value.trim();
      try {
        const data = await api("/api/join/" + encodeURIComponent(DRAW_ID) + "/trc20", { address });
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        showMessage(error.message);
      }
    });

    (async () => {
      if (DRAW_ID === "preview") {
        document.getElementById("loading").classList.add("hidden");
        const nav = document.getElementById("previewNav");
        nav.classList.remove("hidden");
        const steps = [
          { id: "captcha", label: "Капча" },
          { id: "registration", label: "Рег." },
          { id: "referral", label: "Реф" },
          { id: "nickname", label: "Ник" },
          { id: "trc20", label: "TRC-20" },
          { id: "done", label: "Готово" },
        ];
        steps.forEach(({ id, label }) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = label;
          btn.addEventListener("click", () => {
            nav.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            if (id === "captcha") {
              renderCaptcha({ a: 4, b: 7, options: [10, 11, 12] });
            }
            if (id === "done") {
              document.getElementById("doneText").textContent = "Вы участвуете ✅";
            }
            showStep(id);
          });
          nav.appendChild(btn);
        });
        nav.querySelector("button")?.click();
        return;
      }

      if (!initData()) {
        document.getElementById("loading").classList.add("hidden");
        showMessage("Откройте участие через кнопку в Telegram.");
        return;
      }
      try {
        const data = await api("/api/join/" + encodeURIComponent(DRAW_ID) + "/session", {});
        hideMessage();
        handleStep(data.step, data);
      } catch (error) {
        document.getElementById("loading").classList.add("hidden");
        showMessage(error.message);
      }
    })();
  </script>
</body>
</html>`;
}

function registerJoinMiniApp(app, deps) {
  const {
    validateInitData,
    BOT_TOKEN,
    readData,
    readProjects,
    getProjectById,
    DRAW_STATUS,
    buildCaptchaTask,
    joinSessions,
    getUserProjectProfile,
    setUserProjectProfile,
    upsertUserMeta,
    addUserToDraw,
  } = deps;

  function joinSessionKey(userId, drawId) {
    return `${userId}:${drawId}`;
  }

  function getJoinApiSession(userId, drawId) {
    return joinSessions.get(joinSessionKey(userId, drawId));
  }

  function setJoinApiSession(userId, drawId, session) {
    joinSessions.set(joinSessionKey(userId, drawId), session);
  }

  function clearJoinApiSession(userId, drawId) {
    joinSessions.delete(joinSessionKey(userId, drawId));
  }

  function resolveTelegramUser(req) {
    const initData =
      req.headers["x-telegram-init-data"] || req.body?.initData || req.query?.initData;
    const user = validateInitData(initData, BOT_TOKEN);
    if (!user?.id) {
      return null;
    }
    upsertUserMeta(user);
    return user;
  }

  function requireJoinUser(req, res, next) {
    const user = resolveTelegramUser(req);
    if (!user) {
      res.status(401).json({ error: "Откройте через Telegram." });
      return;
    }
    req.telegramUser = user;
    next();
  }

  function getActiveDraw(drawId) {
    const data = readData();
    const draw = data.draws.find((item) => item.id === drawId);
    if (!draw || draw.status !== DRAW_STATUS.ACTIVE) {
      return null;
    }
    return draw;
  }

  function buildJoinStepResponse(step, extra = {}) {
    return { step, ...extra };
  }

  app.use("/assets", express.static(deps.ASSETS_DIR));

  app.get("/join/:drawId", (req, res) => {
    const draw = getActiveDraw(req.params.drawId);
    if (!draw) {
      res.status(404).type("html").send("<h1>Розыgрыш недоступен</h1>");
      return;
    }
    const project = draw.projectId ? getProjectById(draw.projectId) : null;
    res.type("html").send(renderJoinPage(req.params.drawId, draw, project));
  });

  app.post("/api/join/:drawId/session", requireJoinUser, async (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыgрыш недоступен." });
      return;
    }

    if (draw.participantIds.includes(userId)) {
      res.json(buildJoinStepResponse("done", { message: "Вы уже участвуете ✅" }));
      return;
    }

    if (!draw.projectId) {
      const result = await addUserToDraw(drawId, userId);
      res.json(
        buildJoinStepResponse("done", {
          message: result.already ? "Вы уже участвуете ✅" : "Вы участвуете ✅",
        }),
      );
      return;
    }

    const profile = getUserProjectProfile(userId, draw.projectId);
    const canSkip = (profile?.referralVerified || profile?.selfReportedNonReferral) && profile?.trc20Address;
    if (canSkip) {
      const result = await addUserToDraw(drawId, userId);
      res.json(
        buildJoinStepResponse("done", {
          message: result.already ? "Вы уже участвуете ✅" : "Вы участвуете ✅",
        }),
      );
      return;
    }

    let session = getJoinApiSession(userId, drawId);
    if (!session) {
      const captcha = buildCaptchaTask();
      session = {
        userId,
        drawId,
        projectId: draw.projectId,
        step: "captcha",
        captchaCorrect: captcha.correct,
        captcha,
      };
      setJoinApiSession(userId, drawId, session);
    }

    if (session.step === "captcha") {
      res.json(buildJoinStepResponse("captcha", { captcha: session.captcha }));
      return;
    }
    if (session.step === "registration" || session.step === "registration_confirm") {
      res.json(buildJoinStepResponse("registration"));
      return;
    }
    if (session.step === "await_ref_nickname") {
      res.json(buildJoinStepResponse("nickname"));
      return;
    }
    if (session.step === "await_trc20") {
      res.json(buildJoinStepResponse("trc20"));
      return;
    }

    res.json(buildJoinStepResponse("captcha", { captcha: session.captcha || buildCaptchaTask() }));
  });

  app.post("/api/join/:drawId/captcha", requireJoinUser, (req, res) => {
    const drawId = req.params.drawId;
    const userId = req.telegramUser.id;
    const draw = getActiveDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: "Розыgрыш недоступен." });
      return;
    }

    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела. Обновите страницу." });
      return;
    }

    const answer = Number(req.body?.answer);
    if (answer !== session.captchaCorrect) {
      const captcha = buildCaptchaTask();
      session.captcha = captcha;
      session.captchaCorrect = captcha.correct;
      setJoinApiSession(userId, drawId, session);
      res.status(400).json({ error: "Неверный ответ. Попробуйте ещё раз.", step: "captcha", captcha });
      return;
    }

    session.step = "registration";
    setJoinApiSession(userId, drawId, session);
    res.json(buildJoinStepResponse("registration"));
  });

  app.post("/api/join/:drawId/registration", requireJoinUser, (req, res) => {
    const userId = req.telegramUser.id;
    const drawId = req.params.drawId;
    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела." });
      return;
    }
    session.step = "registration_confirm";
    setJoinApiSession(userId, drawId, session);
    res.json(buildJoinStepResponse("referral"));
  });

  app.post("/api/join/:drawId/referral", requireJoinUser, async (req, res) => {
    const userId = req.telegramUser.id;
    const drawId = req.params.drawId;
    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела." });
      return;
    }

    const action = req.body?.action;
    if (action === "non_referral") {
      setUserProjectProfile(userId, session.projectId, {
        referralVerified: false,
        selfReportedNonReferral: true,
        nonReferralMarkedAt: new Date().toISOString(),
      });
      session.skipReferralCheck = true;
      session.step = "await_trc20";
      setJoinApiSession(userId, drawId, session);
      res.json(buildJoinStepResponse("trc20"));
      return;
    }

    if (action === "confirm") {
      const nickname = String(req.body?.nickname || "").trim();
      if (nickname.length < 3) {
        res.status(400).json({ error: "Никнейм слишком короткий." });
        return;
      }
      setUserProjectProfile(userId, session.projectId, {
        referralVerified: true,
        selfReportedNonReferral: false,
        referralNickname: nickname,
        referralCheckedAt: new Date().toISOString(),
      });
      session.step = "await_trc20";
      setJoinApiSession(userId, drawId, session);
      res.json(buildJoinStepResponse("trc20"));
      return;
    }

    res.status(400).json({ error: "Некорректное действие." });
  });

  app.post("/api/join/:drawId/trc20", requireJoinUser, async (req, res) => {
    const userId = req.telegramUser.id;
    const drawId = req.params.drawId;
    const session = getJoinApiSession(userId, drawId);
    if (!session) {
      res.status(400).json({ error: "Сессия устарела." });
      return;
    }

    const address = String(req.body?.address || "").trim();
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      res.status(400).json({ error: "Неверный формат TRC-20 адреса." });
      return;
    }

    setUserProjectProfile(userId, session.projectId, {
      referralVerified: session.skipReferralCheck ? false : true,
      selfReportedNonReferral: Boolean(session.skipReferralCheck),
      trc20Address: address,
      verifiedBy: "miniapp",
    });

    const result = await addUserToDraw(drawId, userId);
    clearJoinApiSession(userId, drawId);

    res.json(
      buildJoinStepResponse("done", {
        message: result.already ? "Вы уже участвуете ✅" : "Вы участвуете ✅",
      }),
    );
  });

  if (deps.designPreview) {
    const mockDraw = {
      id: "preview",
      prize: "50 000 ₽",
      status: DRAW_STATUS.ACTIVE,
      projectId: "demo",
    };
    const mockProject = {
      name: "Demo Project",
      refLink: "https://example.com/ref",
    };

    app.get("/dev/preview/join", (_req, res) => {
      res.type("html").send(renderJoinPage("preview", mockDraw, mockProject));
    });

    app.get("/dev/preview/gate", (_req, res) => {
      res.type("html").send(renderOrganizerGatePage(deps.BOT_USERNAME || "bot"));
    });
  }
}

module.exports = { renderOrganizerGatePage, registerJoinMiniApp };
