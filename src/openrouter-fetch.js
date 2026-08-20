const { ProxyAgent, fetch: undiciFetch } = require("undici");

// Measured on production: the proxy hangs on roughly four requests in ten and
// answers the rest in half a second. With a single 90 second attempt and no
// retry, each hang surfaced to the user as "Что-то подвисло" - 330 of them
// across half of all support conversations. OpenRouter answers this server
// directly in under two seconds, so a hung proxy attempt is worth abandoning
// early and repeating without it.
const ATTEMPT_TIMEOUT_MS = Number(process.env.OPENROUTER_ATTEMPT_TIMEOUT_MS || 15000);

// Waiting fifteen seconds for a proxy that is down half the time, on every
// single message, is still a bad conversation. After a few failures in a row,
// go straight out for a while and try the proxy again later.
const PROXY_TRIP_AFTER = Number(process.env.OPENROUTER_PROXY_TRIP_AFTER || 3);
const PROXY_COOLDOWN_MS = Number(process.env.OPENROUTER_PROXY_COOLDOWN_MS || 300000);

let cachedProxyUrl = null;
let cachedDispatcher = undefined;
let consecutiveProxyFailures = 0;
let proxySkippedUntil = 0;

function proxyIsTripped(now = Date.now()) {
  return now < proxySkippedUntil;
}

function noteProxyFailure(now = Date.now()) {
  consecutiveProxyFailures += 1;
  if (consecutiveProxyFailures >= PROXY_TRIP_AFTER) {
    proxySkippedUntil = now + PROXY_COOLDOWN_MS;
    consecutiveProxyFailures = 0;
    console.warn(
      `[openrouter] прокси отключён на ${Math.round(PROXY_COOLDOWN_MS / 1000)}с — запросы идут напрямую`,
    );
  }
}

function noteProxySuccess() {
  consecutiveProxyFailures = 0;
}

function resetProxyBreakerForTests() {
  consecutiveProxyFailures = 0;
  proxySkippedUntil = 0;
}

function normalizeOpenRouterProxyUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }
  const parts = value.split(":");
  if (parts.length >= 4) {
    const host = parts[0];
    const port = parts[1];
    const username = parts[2];
    const password = parts.slice(3).join(":");
    return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
  }
  if (parts.length === 2) {
    return `http://${parts[0]}:${parts[1]}`;
  }
  return value;
}

function getOpenRouterProxyDispatcher() {
  const proxyUrl = normalizeOpenRouterProxyUrl(process.env.OPENROUTER_PROXY_URL);
  if (!proxyUrl) {
    cachedProxyUrl = "";
    cachedDispatcher = undefined;
    return undefined;
  }
  if (proxyUrl === cachedProxyUrl) {
    return cachedDispatcher;
  }
  cachedProxyUrl = proxyUrl;
  cachedDispatcher = new ProxyAgent(proxyUrl);
  return cachedDispatcher;
}

// Caps one attempt without discarding the deadline the caller set.
function attemptSignal(callerSignal) {
  const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
  if (!callerSignal) {
    return timeout;
  }
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([callerSignal, timeout])
    : callerSignal;
}

async function openRouterFetch(url, options = {}, impl = {}) {
  const proxyFetch = impl.proxyFetch || undiciFetch;
  const directFetch = impl.directFetch || fetch;
  const dispatcher = impl.dispatcher !== undefined ? impl.dispatcher : getOpenRouterProxyDispatcher();

  if (!dispatcher || proxyIsTripped()) {
    return directFetch(url, { ...options, signal: attemptSignal(options.signal) });
  }

  try {
    const response = await proxyFetch(url, {
      ...options,
      dispatcher,
      signal: attemptSignal(options.signal),
    });
    noteProxySuccess();
    return response;
  } catch (error) {
    // The caller giving up is not a proxy failure, and repeating would ignore it.
    if (options.signal?.aborted) {
      throw error;
    }
    noteProxyFailure();
    console.warn(
      `[openrouter] прокси не ответил (${error?.message || error}) — повторяю напрямую`,
    );
    return directFetch(url, { ...options, signal: attemptSignal(options.signal) });
  }
}

function extractOpenRouterError(data, response) {
  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error.trim();
  }
  if (data?.error?.message) {
    return String(data.error.message);
  }
  if (data?.message) {
    return String(data.message);
  }
  return `HTTP ${response.status}`;
}

module.exports = {
  openRouterFetch,
  extractOpenRouterError,
  normalizeOpenRouterProxyUrl,
  ATTEMPT_TIMEOUT_MS,
  resetProxyBreakerForTests,
};
