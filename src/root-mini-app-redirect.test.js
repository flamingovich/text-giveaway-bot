const test = require("node:test");
const assert = require("node:assert/strict");
const { getRootMiniAppRedirect } = require("./root-mini-app-redirect");

// The test bot's "join" link held the bare domain: tapping "Участвую" showed the
// "site coming soon" page instead of the draw.
test("a Mini App launch at the root goes on to the join app", () => {
  assert.equal(
    getRootMiniAppRedirect("/?tgWebAppStartParam=draw_123&tgWebAppVersion=8.0"),
    "/join/app?tgWebAppStartParam=draw_123&tgWebAppVersion=8.0",
  );
});

test("the site's own root page stays where it is", () => {
  assert.equal(getRootMiniAppRedirect("/"), null);
  assert.equal(getRootMiniAppRedirect("/?utm_source=x"), null);
  assert.equal(getRootMiniAppRedirect("/?tgWebAppStartParam="), null);
});

test("the target is always this site's join app", () => {
  const target = getRootMiniAppRedirect("/?tgWebAppStartParam=draw_1&next=//evil.example");
  assert.ok(target.startsWith("/join/app?"));
  assert.ok(!target.startsWith("//"));
});
