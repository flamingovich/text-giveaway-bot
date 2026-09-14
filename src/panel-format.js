// Formatting for the organizer panel's cards and figures.
//
// Pure functions, no storage and no Telegram. formatUsdStat and
// formatCountdownClock are also sent to the browser as source text (see
// panel-look.js), so the numbers the page counts up to and the timers it ticks
// read exactly as the server first drew them. That is why they reference
// nothing outside their own bodies.

const { DateTime } = require("luxon");

// Genitive forms without the dot, as they read in "14 сент, 03:28".
const RU_MONTHS_SHORT = ["янв", "февр", "мар", "апр", "мая", "июн", "июл", "авг", "сент", "окт", "нояб", "дек"];

const PANEL_HISTORY_FILTERS = ["all", "active", "due"];
const PANEL_DEPOSIT_NETWORKS = ["trc20", "erc20", "bep20"];

// "$9 916.54", "$428": cents only when there are any. Rounded to the cent
// first, so 9916.999 becomes "$9 917" rather than "$9 916.100".
function formatUsdStat(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "$0";
  }
  const totalCents = Math.round(amount * 100);
  const whole = String(Math.floor(totalCents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const cents = totalCents % 100;
  return "$" + whole + (cents ? "." + String(cents).padStart(2, "0") : "");
}

// Time left as "HH:MM:SS"; hours run past 24 for draws that last days.
// Nothing left gives null, and the caller says what that means for its chip.
function formatCountdownClock(msLeft) {
  const ms = Number(msLeft);
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const seconds = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return pad(Math.floor(seconds / 3600)) + ":" + pad(Math.floor((seconds % 3600) / 60)) + ":" + pad(seconds % 60);
}

function formatCardDateShort(isoString, zone) {
  if (!isoString) {
    return "вручную";
  }
  const dt = DateTime.fromISO(String(isoString), { zone });
  if (!dt.isValid) {
    return "не задано";
  }
  return `${dt.day} ${RU_MONTHS_SHORT[dt.month - 1]}, ${dt.toFormat("HH:mm")}`;
}

function normalizePanelHistoryFilter(value) {
  const filter = String(value || "").trim().toLowerCase();
  return PANEL_HISTORY_FILTERS.includes(filter) ? filter : "all";
}

// "Активные" is the draws running right now; "К выплате" is decided by the
// caller, who knows which winners still wait for money.
function filterPanelHistoryDraws(draws, filter, { isDue }) {
  const list = Array.isArray(draws) ? draws : [];
  if (filter === "active") {
    return list.filter((draw) => draw.status === "active");
  }
  if (filter === "due") {
    return list.filter((draw) => isDue(draw));
  }
  return list;
}

function countDepositNetworks(networkIds) {
  const counts = { all: 0, trc20: 0, erc20: 0, bep20: 0 };
  for (const id of networkIds || []) {
    counts.all += 1;
    if (PANEL_DEPOSIT_NETWORKS.includes(id)) {
      counts[id] += 1;
    }
  }
  return counts;
}

module.exports = {
  PANEL_HISTORY_FILTERS,
  PANEL_DEPOSIT_NETWORKS,
  formatUsdStat,
  formatCountdownClock,
  formatCardDateShort,
  normalizePanelHistoryFilter,
  filterPanelHistoryDraws,
  countDepositNetworks,
};
