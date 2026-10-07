// The «Воронка» page: of those who opened the join mini app, how many got in,
// and at which step the rest stopped. The rows come from join-funnel.js.

const { summarizeJoinFunnel, JOIN_FUNNEL_STEP_STAGES } = require("./join-funnel");
const { drawTitle } = require("./admin-format");

const DAY_MS = 24 * 60 * 60 * 1000;
const FUNNEL_PERIODS = ["7", "30", "90"];
const DRAW_ROWS_LIMIT = 30;

const STEP_LABELS = {
  notify: "Доступ в личку",
  captcha: "Капча",
  channel: "Подписка на канал",
  registration: "Регистрация и ID",
  trc20: "Кошелёк",
};

const STEP_HINTS = {
  notify: "бот не мог написать — просили открыть его",
  captcha: "",
  channel: "",
  registration: "",
  trc20: "",
};

function normalizeFunnelPeriod(value) {
  const period = String(value || "").trim();
  return FUNNEL_PERIODS.includes(period) ? period : "30";
}

function percentOf(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function buildSteps(summary) {
  return JOIN_FUNNEL_STEP_STAGES.map((stage) => {
    const reached = summary.reached[stage] || 0;
    const stuck = summary.stuck[stage] || 0;
    return {
      stage,
      label: STEP_LABELS[stage],
      hint: STEP_HINTS[stage],
      reached,
      stuck,
      passed: reached - stuck,
      passRate: percentOf(reached - stuck, reached),
    };
  });
}

// The step that lost the most people, or null when it lost nobody.
function worstStep(summary) {
  let worst = null;
  for (const stage of JOIN_FUNNEL_STEP_STAGES) {
    const stuck = summary.stuck[stage] || 0;
    if (stuck > 0 && (!worst || stuck > worst.stuck)) {
      worst = { stage, label: STEP_LABELS[stage], stuck };
    }
  }
  return worst;
}

function buildFunnelStats({ store, draws = [], projects = [], timezone, period, now = Date.now() }) {
  const safePeriod = normalizeFunnelPeriod(period);
  const since = now - Number(safePeriod) * DAY_MS;
  const rows = store ? store.list({ since }) : [];
  const total = summarizeJoinFunnel(rows);

  const rowsByDraw = new Map();
  for (const row of rows) {
    const key = String(row.drawId);
    if (!rowsByDraw.has(key)) {
      rowsByDraw.set(key, []);
    }
    rowsByDraw.get(key).push(row);
  }

  const drawById = new Map(draws.map((draw) => [String(draw.id), draw]));
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const drawRows = [...rowsByDraw.entries()]
    .map(([drawId, drawRowsList]) => {
      const summary = summarizeJoinFunnel(drawRowsList);
      const draw = drawById.get(drawId);
      return {
        drawId,
        title: draw ? drawTitle(draw, projectNameById.get(draw.projectId) || "", timezone) : "Розыгрыш удалён",
        active: draw?.status === "active",
        people: summary.people,
        joined: summary.joined,
        conversion: percentOf(summary.joined, summary.people),
        worst: worstStep(summary),
      };
    })
    .sort((left, right) => right.people - left.people)
    .slice(0, DRAW_ROWS_LIMIT);

  return {
    period: safePeriod,
    total,
    conversion: percentOf(total.joined, total.people),
    dropped: total.people - total.joined,
    droppedPercent: percentOf(total.people - total.joined, total.people),
    steps: buildSteps(total),
    worst: worstStep(total),
    drawRows,
    drawsTotal: rowsByDraw.size,
    trackedSince: store ? store.trackedSince() : null,
  };
}

module.exports = {
  FUNNEL_PERIODS,
  STEP_LABELS,
  buildSteps,
  normalizeFunnelPeriod,
  buildFunnelStats,
};
