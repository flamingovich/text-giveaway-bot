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

// The bank publishes XML and writes its decimals with a comma. This was reading
// a community mirror instead, which stopped answering at all - three probes,
// three eight-second timeouts - and became the loudest line in the error log
// while the providers behind it quietly did the job. The bank itself answers
// in under half a second.
function parseCbrUsdRate(xml) {
  const block = String(xml || "").match(
    /<Valute[^>]*>(?:(?!<\/Valute>)[\s\S])*?<CharCode>USD<\/CharCode>[\s\S]*?<\/Valute>/,
  );
  if (!block) {
    return null;
  }
  const value = block[0].match(/<Value>([^<]+)<\/Value>/);
  const nominal = block[0].match(/<Nominal>([^<]+)<\/Nominal>/);
  if (!value) {
    return null;
  }
  const rate = Number(String(value[1]).trim().replace(",", "."));
  const per = Number(String(nominal?.[1] || "1").trim().replace(",", ".")) || 1;
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return rate / per;
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchFromCbr() {
  return normalizeRate(parseCbrUsdRate(await fetchText("https://www.cbr.ru/scripts/XML_daily.asp")));
}

async function fetchFromExchangeRateApi() {
  const data = await fetchJson("https://open.er-api.com/v6/latest/USD");
  return normalizeRate(data?.rates?.RUB);
}

async function fetchFromCurrencyApi() {
  const data = await fetchJson("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
  return normalizeRate(data?.usd?.rub);
}

// Order matters: the first provider that answers wins, so the steady ones go
// first. The CBR feed here is a community mirror, not the bank itself, and it
// was timing out often enough to be the loudest line in the error log while
// the providers behind it quietly did the job. It stays as a last resort
// because it is the rate people actually quote.
// Priced in RUB per USDT, which is literally what this module is for.
async function fetchFromCoinGecko() {
  const data = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub");
  return normalizeRate(data?.tether?.rub);
}

// The bank stays first: it is the rate people quote, and switching the leader
// would quietly change what winners are paid. The rest are there so a bad
// minute at one source is invisible rather than an error in the log.
const RATE_PROVIDERS = [
  { name: "ЦБ РФ", fetch: fetchFromCbr },
  { name: "ExchangeRate-API", fetch: fetchFromExchangeRateApi },
  { name: "Currency-API", fetch: fetchFromCurrencyApi },
  { name: "CoinGecko", fetch: fetchFromCoinGecko },
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
  parseCbrUsdRate,
  refreshRubUsdtRate,
  startRubUsdtRateRefresh,
  getRubPerUsdtRate,
  convertRubToUsdt,
  convertUsdToRub,
};
