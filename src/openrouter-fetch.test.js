const test = require("node:test");
const assert = require("node:assert/strict");
const { openRouterFetch, normalizeOpenRouterProxyUrl } = require("./openrouter-fetch");

const OK = { ok: true, status: 200 };

test("goes straight out when no proxy is configured", async () => {
  const calls = [];
  const response = await openRouterFetch(
    "https://openrouter.ai/x",
    { method: "POST" },
    {
      dispatcher: undefined,
      directFetch: (url, options) => {
        calls.push({ url, method: options.method });
        return Promise.resolve(OK);
      },
      proxyFetch: () => Promise.reject(new Error("proxy must not be used")),
    },
  );

  assert.equal(response, OK);
  assert.deepEqual(calls, [{ url: "https://openrouter.ai/x", method: "POST" }]);
});

test("uses the proxy when one is configured", async () => {
  let proxied = 0;
  await openRouterFetch(
    "https://openrouter.ai/x",
    {},
    {
      dispatcher: { proxy: true },
      proxyFetch: () => {
        proxied += 1;
        return Promise.resolve(OK);
      },
      directFetch: () => Promise.reject(new Error("direct must not be used")),
    },
  );

  assert.equal(proxied, 1);
});

test("repeats directly when the proxy hangs, instead of failing the user", async () => {
  let direct = 0;
  const response = await openRouterFetch(
    "https://openrouter.ai/x",
    { body: "payload" },
    {
      dispatcher: { proxy: true },
      proxyFetch: () => Promise.reject(new Error("The operation was aborted due to timeout")),
      directFetch: (_url, options) => {
        direct += 1;
        assert.equal(options.body, "payload", "the retry carries the same request");
        return Promise.resolve(OK);
      },
    },
  );

  assert.equal(response, OK);
  assert.equal(direct, 1);
});

test("does not repeat when the caller itself gave up", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    openRouterFetch(
      "https://openrouter.ai/x",
      { signal: controller.signal },
      {
        dispatcher: { proxy: true },
        proxyFetch: () => Promise.reject(new Error("aborted")),
        directFetch: () => Promise.reject(new Error("direct must not be used")),
      },
    ),
  );
});

test("normalises a host:port:user:pass proxy into a url", () => {
  assert.equal(
    normalizeOpenRouterProxyUrl("1.2.3.4:8000:bob:secret"),
    "http://bob:secret@1.2.3.4:8000",
  );
  assert.equal(normalizeOpenRouterProxyUrl("1.2.3.4:8000"), "http://1.2.3.4:8000");
  assert.equal(normalizeOpenRouterProxyUrl("socks5://host:1080"), "socks5://host:1080");
  assert.equal(normalizeOpenRouterProxyUrl(""), "");
});
