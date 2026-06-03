const DEFAULT_RUB_PER_USDT = Math.max(1, Number(process.env.RUB_TO_USDT_RATE) || 71.02);
const CACHE_TTL_MS = Number(process.env.RUB_USDT_RATE_TTL_MS || 5 * 60 * 1000);
const REFRESH_INTERVAL_MS = Number(process.env.RUB_USDT_RATE_REFRESH_MS || 10 * 60 * 1000);
const FETCH_TIMEOUT_MS = Number(process.env.RUB_USDT_RATE_TIMEOUT_MS || 8000);

let cachedRate = DEFAULT_RUB_PER_USDT;
let lastFetchedAt = 0;
let refreshPromise = null;

function normalizeRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return rate;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchFromCbr() {
  const data = await fetchJson("https://www.cbr-xml-daily.ru/daily_json.js");
  const usd = data?.Valute?.USD;
  if (!usd) {
    return null;
  }
  const nominal = Number(usd.Nominal) || 1;
  return normalizeRate(Number(usd.Value) / nominal);
}

async function fetchFromExchangeRateApi() {
  const data = await fetchJson("https://open.er-api.com/v6/latest/USD");
  return normalizeRate(data?.rates?.RUB);
}

async function fetchFromCurrencyApi() {
  const data = await fetchJson("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
  return normalizeRate(data?.usd?.rub);
}

const RATE_PROVIDERS = [
  { name: "ЦБ РФ", fetch: fetchFromCbr },
  { name: "ExchangeRate-API", fetch: fetchFromExchangeRateApi },
  { name: "Currency-API", fetch: fetchFromCurrencyApi },
];

async function refreshRubUsdtRate(force = false) {
  if (!force && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
    return cachedRate;
  }
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    for (const provider of RATE_PROVIDERS) {
      try {
        const rate = await provider.fetch();
        if (rate) {
          cachedRate = rate;
          lastFetchedAt = Date.now();
          return rate;
        }
      } catch (error) {
        console.warn(`Курс USD/RUB (${provider.name}): ${error.message}`);
      }
    }

    if (lastFetchedAt > 0) {
      console.warn("Не удалось обновить курс USD/RUB, используем последний успешный.");
      return cachedRate;
    }

    console.warn(`Не удалось получить курс USD/RUB, используем резерв ${DEFAULT_RUB_PER_USDT}.`);
    cachedRate = DEFAULT_RUB_PER_USDT;
    return cachedRate;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function getRubPerUsdtRate() {
  return cachedRate;
}

function convertRubToUsdt(rubAmount, rate = getRubPerUsdtRate()) {
  const rub = Number(rubAmount) || 0;
  const rubPerUsdt = Number(rate) || DEFAULT_RUB_PER_USDT;
  if (rub <= 0 || rubPerUsdt <= 0) {
    return 0;
  }
  return rub / rubPerUsdt;
}

function convertUsdToRub(usdAmount, rate = getRubPerUsdtRate()) {
  const usd = Number(usdAmount) || 0;
  const rubPerUsdt = Number(rate) || DEFAULT_RUB_PER_USDT;
  if (usd <= 0 || rubPerUsdt <= 0) {
    return 0;
  }
  return Math.floor(usd * rubPerUsdt);
}

function startRubUsdtRateRefresh() {
  refreshRubUsdtRate(true).catch(() => {});
  setInterval(() => {
    refreshRubUsdtRate(true).catch(() => {});
  }, REFRESH_INTERVAL_MS);
}

module.exports = {
  refreshRubUsdtRate,
  startRubUsdtRateRefresh,
  getRubPerUsdtRate,
  convertRubToUsdt,
  convertUsdToRub,
};
