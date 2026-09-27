const test = require("node:test");
const assert = require("node:assert/strict");

const { isSameOriginPost } = require("./same-origin-post");

const HOSTS = ["rollerbot.pro"];

test("a post from the panel's own page goes through", () => {
  assert.equal(isSameOriginPost({ origin: "https://rollerbot.pro" }, HOSTS), true);
  assert.equal(isSameOriginPost({ referer: "https://rollerbot.pro/panel?v=1" }, HOSTS), true);
});

// The hole: a form on any page could post to the panel with the cookie.
test("a post from another site is refused", () => {
  assert.equal(isSameOriginPost({ origin: "https://evil.example" }, HOSTS), false);
  assert.equal(isSameOriginPost({ referer: "https://evil.example/page" }, HOSTS), false);
});

test("a hidden origin counts as foreign unless the referer is ours", () => {
  assert.equal(isSameOriginPost({ origin: "null" }, HOSTS), false);
  assert.equal(isSameOriginPost({ origin: "null", referer: "https://rollerbot.pro/panel" }, HOSTS), true);
});

test("a post that names no page at all is let through, as old WebViews send neither", () => {
  assert.equal(isSameOriginPost({}, HOSTS), true);
});

test("a look-alike host is not ours", () => {
  assert.equal(isSameOriginPost({ origin: "https://rollerbot.pro.evil.example" }, HOSTS), false);
});
