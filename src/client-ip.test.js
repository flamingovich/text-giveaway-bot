const test = require("node:test");
const assert = require("node:assert/strict");

const { extractClientIp } = require("./client-ip");

// The hole: nginx appends the real address to whatever X-Forwarded-For the
// client sent, and the first entry - the one the client wrote - was trusted.
test("a forged X-Forwarded-For does not replace the address nginx saw", () => {
  const req = { headers: { "x-forwarded-for": "10.9.8.7, 203.0.113.5", "x-real-ip": "203.0.113.5" } };
  assert.equal(extractClientIp(req), "203.0.113.5");
});

test("without X-Real-IP the entry nginx appended - the last one - is used", () => {
  assert.equal(extractClientIp({ headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }), "2.2.2.2");
});

test("with no proxy headers the socket address is used", () => {
  assert.equal(extractClientIp({ headers: {}, ip: "127.0.0.1" }), "127.0.0.1");
  assert.equal(extractClientIp({ headers: {}, socket: { remoteAddress: "::1" } }), "::1");
});

test("an empty request gives an empty address, not an error", () => {
  assert.equal(extractClientIp({}), "");
});
