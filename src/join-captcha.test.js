const test = require("node:test");
const assert = require("node:assert/strict");

const { isJoinCaptchaPassed } = require("./join-captcha");

const neverCalled = async () => {
  throw new Error("must not be asked");
};

// The hole: with a key configured, { verified: true } and no token was accepted.
test("with a key configured, a request without a token does not pass", async () => {
  assert.equal(await isJoinCaptchaPassed({ secretConfigured: true, token: "", verified: true, verifyToken: neverCalled }), false);
});

test("with a key configured, the token Google confirms is what passes", async () => {
  assert.equal(await isJoinCaptchaPassed({ secretConfigured: true, token: "t", verifyToken: async () => true }), true);
  assert.equal(await isJoinCaptchaPassed({ secretConfigured: true, token: "t", verified: true, verifyToken: async () => false }), false);
});

test("without a key the stand-in checkbox is all there is to check", async () => {
  assert.equal(await isJoinCaptchaPassed({ secretConfigured: false, verified: true, verifyToken: neverCalled }), true);
  assert.equal(await isJoinCaptchaPassed({ secretConfigured: false, verified: false, verifyToken: neverCalled }), false);
});
