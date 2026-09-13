const test = require("node:test");
const assert = require("node:assert/strict");

const { getRetryAfterSeconds, withFloodRetry } = require("./telegram-flood-retry");

function floodError(seconds) {
  // The shape of Telegraf's TelegramError: the message, and a response with parameters.
  const response = {
    error_code: 429,
    description: `Too Many Requests: retry after ${seconds}`,
    parameters: { retry_after: seconds },
  };
  const error = new Error(`${response.error_code}: ${response.description}`);
  error.response = response;
  Object.defineProperty(error, "parameters", { get: () => response.parameters });
  return error;
}

function scripted(outcomes) {
  const state = { calls: 0 };
  const task = async () => {
    state.calls += 1;
    const next = outcomes.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return { task, state };
}

function run(task, extra = {}) {
  const waits = [];
  const promise = withFloodRetry(task, {
    sleep: async (ms) => {
      waits.push(ms);
    },
    log: () => {},
    ...extra,
  });
  return { promise, waits };
}

test("retry_after is read from the parameters, or from the text when that is all there is", () => {
  assert.equal(getRetryAfterSeconds(floodError(6)), 6);
  assert.equal(getRetryAfterSeconds(new Error("429: Too Many Requests: retry after 11")), 11);
  assert.equal(getRetryAfterSeconds(new Error("400: Bad Request: message to edit not found")), null);
  assert.equal(getRetryAfterSeconds(new Error("telegram_edit_timeout")), null);
  assert.equal(getRetryAfterSeconds(null), null);
});

test("told to wait, it waits as long as asked and runs the whole attempt again", async () => {
  const { task, state } = scripted([floodError(6), "edited"]);
  const { promise, waits } = run(task);
  assert.equal(await promise, "edited");
  assert.equal(state.calls, 2);
  assert.deepEqual(waits, [6250]);
});

test("it gives up after the retries and throws the 429 as before", async () => {
  const { task, state } = scripted([floodError(3), floodError(3), floodError(3), "never"]);
  const { promise, waits } = run(task, { maxRetries: 2 });
  await assert.rejects(promise, /Too Many Requests/);
  assert.equal(state.calls, 3);
  assert.equal(waits.length, 2);
});

test("a wait longer than the limit is not waited out", async () => {
  const { task, state } = scripted([floodError(120)]);
  const { promise, waits } = run(task, { maxWaitSeconds: 20 });
  await assert.rejects(promise, /retry after 120/);
  assert.equal(state.calls, 1);
  assert.deepEqual(waits, []);
});

test("errors that are not 429 are never retried", async () => {
  for (const error of [
    new Error("400: Bad Request: message to edit not found"),
    new Error("400: Bad Request: message is not modified"),
    new Error("telegram_edit_timeout"),
  ]) {
    const { task, state } = scripted([error, "never"]);
    const { promise, waits } = run(task);
    await assert.rejects(promise);
    assert.equal(state.calls, 1, error.message);
    assert.deepEqual(waits, []);
  }
});
