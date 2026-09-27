// Where people drop out of the join flow, for the admin's «Воронка» page.
//
// Every answer of the join API names the step the person is on next, so the
// funnel is kept from those answers: one row per person and draw, with a bit
// for each stage they were ever at. A row per event would have been simpler,
// but the whole base goes to Telegram as a backup and has to stay under the
// bot's 50 MB upload limit. One small row per person and draw does; a log of
// every answer would not. Rows older than RETENTION_DAYS are dropped.
//
// The stages, in the order the flow goes: opened the mini app, was asked to
// open the bot because it could not write to them, captcha, channel,
// registration, wallet, joined. Someone who joined without passing any step
// was let straight in as a returning participant of the project.

const JOIN_FUNNEL_STAGES = ["opened", "notify", "captcha", "channel", "registration", "trc20", "joined"];
const JOIN_FUNNEL_STEP_STAGES = ["notify", "captcha", "channel", "registration", "trc20"];
const STAGE_BIT = Object.fromEntries(JOIN_FUNNEL_STAGES.map((stage, index) => [stage, 1 << index]));

const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// The step a join session is on, as a funnel stage (session.step in join-miniapp.js).
const SESSION_STEP_STAGE = {
  captcha: "captcha",
  channel: "channel",
  registration: "registration",
  registration_confirm: "registration",
  await_trc20: "trc20",
  await_ref_nickname: "trc20",
};

// The stages one successful answer of the join API puts a person at.
//
// An answer carrying needsWriteAccess is held on the client behind «откройте
// бота»: the step it names is not shown yet, so only "notify" counts. When
// /notify-status later says the bot can write, the person moves on to whatever
// step their session is on. Someone who was already in the draw adds nothing.
function stagesFromJoinAnswer(action, body, { sessionStep = null } = {}) {
  if (!body || typeof body !== "object") {
    return [];
  }
  if (action === "notify-status") {
    const stage = body.canMessage === true ? SESSION_STEP_STAGE[sessionStep] : null;
    return stage ? [stage] : [];
  }
  if (body.step === "done") {
    if (body.alreadyJoined === true) {
      return [];
    }
    return action === "session" ? ["opened", "joined"] : ["joined"];
  }
  const stages = action === "session" ? ["opened"] : [];
  if (body.needsWriteAccess === true) {
    stages.push("notify");
  } else if (JOIN_FUNNEL_STEP_STAGES.includes(body.step)) {
    stages.push(body.step);
  }
  return stages;
}

function stagesToMask(stages) {
  return (stages || []).reduce((mask, stage) => mask | (STAGE_BIT[stage] || 0), 0);
}

function maskHas(mask, stage) {
  return (Number(mask) & STAGE_BIT[stage]) !== 0;
}

function furthestStage(mask) {
  for (let index = JOIN_FUNNEL_STAGES.length - 1; index >= 0; index -= 1) {
    if (maskHas(mask, JOIN_FUNNEL_STAGES[index])) {
      return JOIN_FUNNEL_STAGES[index];
    }
  }
  return null;
}

// people: rows; reached: how many were ever at each stage; stuck: of those who
// did not get in, how many stopped at each step (the furthest one they reached);
// instant: got in without a single step.
function summarizeJoinFunnel(rows) {
  const reached = Object.fromEntries(JOIN_FUNNEL_STAGES.map((stage) => [stage, 0]));
  const stuck = Object.fromEntries(JOIN_FUNNEL_STEP_STAGES.map((stage) => [stage, 0]));
  let people = 0;
  let joined = 0;
  let instant = 0;

  for (const row of rows || []) {
    const mask = Number(row?.stages) || 0;
    if (!mask) {
      continue;
    }
    people += 1;
    for (const stage of JOIN_FUNNEL_STAGES) {
      if (maskHas(mask, stage)) {
        reached[stage] += 1;
      }
    }
    if (maskHas(mask, "joined")) {
      joined += 1;
      if (!JOIN_FUNNEL_STEP_STAGES.some((stage) => maskHas(mask, stage))) {
        instant += 1;
      }
      continue;
    }
    const stage = furthestStage(mask);
    if (stage in stuck) {
      stuck[stage] += 1;
    }
  }

  return { people, joined, instant, reached, stuck };
}

// The join API's answers that move a person along. The done screen's polling,
// the referral link and the anonymity switch are not steps.
const JOIN_FUNNEL_ACTIONS = new Set([
  "session",
  "notify-status",
  "captcha",
  "channel-check",
  "project-id",
  "registration",
  "trc20",
]);

// For app.use("/api/join/:drawId/:action"): notes the stages each answer puts
// the person at, then sends it unchanged. The params are read here - by the
// time the answer goes out, the route has its own req.params - and a failure
// to write is logged, never passed on to the person joining.
function createJoinFunnelMiddleware({ store, getSessionStep = () => null, log = console } = {}) {
  return function joinFunnelMiddleware(req, res, next) {
    const { drawId, action } = req.params || {};
    if (!store || req.method !== "POST" || !JOIN_FUNNEL_ACTIONS.has(action)) {
      next();
      return;
    }
    const sendJson = res.json.bind(res);
    res.json = (body) => {
      const userId = req.telegramUser?.id;
      if (userId && res.statusCode < 400) {
        try {
          const sessionStep = action === "notify-status" ? getSessionStep(userId, drawId) : null;
          store.record(drawId, userId, stagesFromJoinAnswer(action, body, { sessionStep }));
        } catch (error) {
          log.warn(`[join] воронка не записана: ${error.message}`);
        }
      }
      return sendJson(body);
    };
    next();
  };
}

function createJoinFunnelStore(db, { now = () => Date.now(), retentionDays = RETENTION_DAYS } = {}) {
  // The design mode's JSON backend has no SQLite: nothing is kept there.
  if (!db) {
    return {
      record() {},
      list() {
        return [];
      },
      trackedSince() {
        return null;
      },
    };
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS join_funnel (
      draw_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      stages INTEGER NOT NULL,
      first_at INTEGER NOT NULL,
      last_at INTEGER NOT NULL,
      PRIMARY KEY (draw_id, user_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS join_funnel_first_at ON join_funnel (first_at);
  `);

  // Inside DO UPDATE a bare column name is the stored row.
  const upsert = db.prepare(`
    INSERT INTO join_funnel (draw_id, user_id, stages, first_at, last_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (draw_id, user_id) DO UPDATE SET
      stages = stages | excluded.stages,
      last_at = excluded.last_at
  `);
  const selectSince = db.prepare(
    "SELECT draw_id AS drawId, stages, first_at AS firstAt FROM join_funnel WHERE first_at >= ?",
  );
  const selectFirst = db.prepare("SELECT MIN(first_at) AS at FROM join_funnel");
  const pruneBefore = db.prepare("DELETE FROM join_funnel WHERE last_at < ?");
  let prunedAt = 0;

  function record(drawId, userId, stages) {
    const mask = stagesToMask(stages);
    if (!mask || !drawId || !userId) {
      return;
    }
    const at = now();
    upsert.run(String(drawId), String(userId), mask, at, at);
    if (at - prunedAt >= DAY_MS) {
      prunedAt = at;
      pruneBefore.run(at - retentionDays * DAY_MS);
    }
  }

  function list({ since = 0 } = {}) {
    return selectSince.all(Number(since) || 0);
  }

  function trackedSince() {
    return selectFirst.get()?.at || null;
  }

  return { record, list, trackedSince };
}

module.exports = {
  JOIN_FUNNEL_STAGES,
  JOIN_FUNNEL_STEP_STAGES,
  RETENTION_DAYS,
  stagesFromJoinAnswer,
  stagesToMask,
  furthestStage,
  summarizeJoinFunnel,
  createJoinFunnelMiddleware,
  createJoinFunnelStore,
};
