const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveWebHost } = require("./web-host");

// Port 30009 answered from the internet, past nginx, and a direct caller could
// then write any X-Real-IP it liked.
test("the app listens on the loopback unless told otherwise", () => {
  assert.equal(resolveWebHost({}), "127.0.0.1");
  assert.equal(resolveWebHost({ WEB_HOST: "  " }), "127.0.0.1");
});

test("WEB_HOST opens it up on purpose", () => {
  assert.equal(resolveWebHost({ WEB_HOST: "0.0.0.0" }), "0.0.0.0");
});
