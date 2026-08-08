const { ProxyAgent, fetch: undiciFetch } = require("undici");

let cachedProxyUrl = null;
let cachedDispatcher = undefined;

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

async function openRouterFetch(url, options = {}) {
  const dispatcher = getOpenRouterProxyDispatcher();
  if (dispatcher) {
    return undiciFetch(url, { ...options, dispatcher });
  }
  return fetch(url, options);
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
};
