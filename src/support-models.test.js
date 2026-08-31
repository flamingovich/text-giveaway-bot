const test = require("node:test");
const assert = require("node:assert");
const { parseModelChain, isWorthAnotherModel, DEFAULT_MODEL_CHAIN } = require("./support-models");

test("with nothing configured the whole default chain is used", () => {
  assert.deepEqual(parseModelChain(""), DEFAULT_MODEL_CHAIN);
  assert.deepEqual(parseModelChain(null), DEFAULT_MODEL_CHAIN);
});

// .env holds OPENROUTER_MODEL=google/gemini-2.5-flash. Reading that as the
// whole chain would leave the bot with no fallback - the very problem here.
test("one configured model keeps the fallbacks behind it", () => {
  const chain = parseModelChain("anthropic/claude-haiku-4.5");
  assert.equal(chain[0], "anthropic/claude-haiku-4.5", "заданная — первая");
  assert.ok(chain.length > 1, "запасные обязаны остаться");
  assert.ok(chain.includes("google/gemini-2.5-flash"));
});

test("the preferred model is not repeated further down the chain", () => {
  const chain = parseModelChain("google/gemini-2.5-flash");
  assert.equal(chain.filter((m) => m === "google/gemini-2.5-flash").length, 1);
});

test("an explicit list is taken exactly as written", () => {
  assert.deepEqual(parseModelChain("a/one, b/two"), ["a/one", "b/two"]);
});

test("a busy or silent provider is worth another model", () => {
  for (const message of [
    "429: Too Many Requests: retry after 435",
    "TimeoutError: Promise timed out after 90000 milliseconds",
    "The operation was aborted due to timeout",
    "502 Bad Gateway",
    "Provider returned error",
    "fetch failed",
  ]) {
    assert.equal(isWorthAnotherModel(new Error(message)), true, message);
  }
});

// Retrying these just spends another few seconds to fail the same way.
test("a broken key or request is not worth another model", () => {
  for (const message of [
    "Ключ OpenRouter недействителен. Создайте новый",
    "invalid api key",
    "user not found",
    "400: messages must not be empty",
  ]) {
    assert.equal(isWorthAnotherModel(new Error(message)), false, message);
  }
});

test("the chain crosses providers so one outage cannot take it all", () => {
  const providers = new Set(DEFAULT_MODEL_CHAIN.map((model) => model.split("/")[0]));
  assert.ok(providers.size >= 2, "иначе лимит одного провайдера убьёт всю цепочку");
});
