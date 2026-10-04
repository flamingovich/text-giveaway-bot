const test = require("node:test");
const assert = require("node:assert");
const { createWalletInspector, TRON_USDT, HOST_GAP_MS } = require("./wallet-inspect");

const ME = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRONSCAN = "apilist.tronscanapi.com";

function setup(answers) {
  let clock = 0;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push({ url, at: clock });
    const status = answers.length ? answers.shift() : 200;
    return { ok: status === 200, status, json: async () => ({ token_transfers: [] }) };
  };
  const inspector = createWalletInspector({ fetchImpl, now: () => clock, sleep: async (ms) => (clock += ms) });
  return { inspector, calls };
}

// The production server got 429 on 56 of 94 addresses when requests came in
// bursts: two inspections must not hit the explorer at once.
test("requests to one explorer keep a pace, whoever makes them", async () => {
  const { inspector, calls } = setup([]);
  await inspector.inspect(ME, "trc20");
  await inspector.inspect(ME, "trc20");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= HOST_GAP_MS[TRONSCAN]);
});

test("a 429 is retried once, after backing off", async () => {
  const { inspector, calls } = setup([429, 200]);
  const result = await inspector.inspect(ME, "trc20");
  assert.equal(result.verdict.kind, "new");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= HOST_GAP_MS[TRONSCAN]);
});

test("two 429s give up, so the step lets the address through", async () => {
  const { inspector } = setup([429, 429]);
  await assert.rejects(inspector.inspect(ME, "trc20"), /429/);
});

test("a turn after the deadline is not waited for", async () => {
  const { inspector } = setup([]);
  await inspector.inspect(ME, "trc20", { deadlineMs: 100000 });
  await assert.rejects(inspector.inspect(ME, "trc20", { deadlineMs: 10 }), /очередь/);
});

test("only the address's own transfers count, not Tronscan's filler", async () => {
  let clock = 0;
  const other = { from_address: "TOther", to_address: "TOther2", quant: "5000000", block_ts: 1, contract_address: TRON_USDT };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ token_transfers: [other] }) });
  const inspector = createWalletInspector({ fetchImpl, now: () => clock, sleep: async (ms) => (clock += ms) });
  const result = await inspector.inspect(ME, "trc20");
  assert.equal(result.transfers.length, 0);
  assert.equal(result.verdict.kind, "new");
});
