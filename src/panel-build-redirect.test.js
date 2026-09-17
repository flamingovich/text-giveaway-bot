const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getPanelBuildRedirect } = require("./panel-build-redirect");

const BUILD = "1789000000000";
const HTTPS = "https://rollerbot.pro";

function redirectFor(originalUrl, overrides = {}) {
  return getPanelBuildRedirect({
    originalUrl,
    build: BUILD,
    publicUrl: HTTPS,
    basePath: "/panel",
    ...overrides,
  });
}

// What the page's own head script decides for a URL: reload unless the first
// "v" is the build.
function pageWouldReload(url, build = BUILD) {
  const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return new URLSearchParams(search).get("v") !== String(build);
}

test("a URL that already carries the build is drawn as is", () => {
  assert.equal(redirectFor(`/panel?v=${BUILD}`), null);
  assert.equal(redirectFor(`/panel/?v=${BUILD}`), null);
  assert.equal(redirectFor(`/panel?msg=ok&v=${BUILD}&openBot=1`), null);
});

test("the menu button's bare URL gets the build", () => {
  assert.equal(redirectFor("/panel"), `/panel?v=${BUILD}`);
  assert.equal(redirectFor("/panel/"), `/panel?v=${BUILD}`);
  assert.equal(redirectFor("/panel?"), `/panel?v=${BUILD}`);
});

test("a stale build is replaced in place and the rest is kept in order", () => {
  assert.equal(
    redirectFor("/panel?openBot=1&v=1700000000000&panel=payoutQueue"),
    `/panel?openBot=1&v=${BUILD}&panel=payoutQueue`,
  );
  assert.equal(redirectFor("/panel?v="), `/panel?v=${BUILD}`);
  assert.equal(redirectFor("/panel?v"), `/panel?v=${BUILD}`);
});

test("every other parameter survives exactly", () => {
  const target = redirectFor(
    "/panel?msg=%D0%A0%D0%BE%D0%B7%D1%8B%D0%B3%D1%80%D1%8B%D1%88+%D1%81%D0%BE%D0%B7%D0%B4%D0%B0%D0%BD&tgWebAppStartParam=abc&a%5Bb%5D=c&empty=&plus=1%2B1",
  );
  const params = new URLSearchParams(target.slice(target.indexOf("?")));
  assert.equal(params.get("msg"), "Розыгрыш создан");
  assert.equal(params.get("tgWebAppStartParam"), "abc");
  assert.equal(params.get("a[b]"), "c");
  assert.equal(params.get("empty"), "");
  assert.equal(params.get("plus"), "1+1");
  assert.equal(params.get("v"), BUILD);
  assert.deepEqual([...params.keys()], ["msg", "tgWebAppStartParam", "a[b]", "empty", "plus", "v"]);
});

test("a repeated build parameter is decided by its first value, as the page does", () => {
  assert.equal(redirectFor(`/panel?v=${BUILD}&v=old`), null);
  const target = redirectFor(`/panel?v=old&x=1&v=${BUILD}`);
  assert.equal(target, `/panel?v=${BUILD}&x=1`);
  assert.deepEqual(new URLSearchParams(target.slice(target.indexOf("?"))).getAll("v"), [BUILD]);
});

test("no redirect where the page would not reload either", () => {
  for (const publicUrl of ["http://localhost:30009", "", undefined, null, "rollerbot.pro", " https://rollerbot.pro"]) {
    assert.equal(redirectFor("/panel", { publicUrl }), null, `publicUrl ${publicUrl}`);
  }
});

test("no redirect without a build to point at", () => {
  assert.equal(redirectFor("/panel", { build: "" }), null);
  assert.equal(redirectFor("/panel", { build: undefined }), null);
});

test("a redirect never leads to another redirect or to a reload", () => {
  const urls = [
    "/panel",
    "/panel/",
    "/panel?",
    "/panel?v=old",
    "/panel?v=old&v=older",
    "/panel?msg=%D0%93%D0%BE%D1%82%D0%BE%D0%B2%D0%BE",
    "/panel?openBot=1&msg=a%26b%3Dc",
    "/panel?v=%20" + BUILD,
    "/panel?V=" + BUILD,
  ];
  for (const url of urls) {
    const target = redirectFor(url);
    assert.ok(target, `${url} should redirect`);
    assert.equal(redirectFor(target), null, `${url} -> ${target} redirects again`);
    assert.equal(pageWouldReload(target), false, `${url} -> ${target} reloads the page`);
  }
});

test("the server redirects exactly when the page would reload", () => {
  const urls = ["/panel", `/panel?v=${BUILD}`, "/panel?v=x", `/panel?v=${BUILD}&v=x`, `/panel?v=x&v=${BUILD}`, "/panel?msg=1"];
  for (const url of urls) {
    assert.equal(Boolean(redirectFor(url)), pageWouldReload(url), url);
  }
});

test("a build with awkward characters still settles after one redirect", () => {
  for (const build of ["2026-09-17 12:00", "a&b=c", "сборка#1", "100%", 1789000000000]) {
    const target = redirectFor("/panel?msg=hi", { build });
    assert.ok(target);
    assert.equal(redirectFor(target, { build }), null, `build ${build}`);
    assert.equal(pageWouldReload(target, build), false, `build ${build}`);
  }
});

test("the redirect stays on the panel whatever path was asked for", () => {
  for (const url of ["//evil.example/?v=1", "/panel/../../x?v=1", "https://evil.example/panel", "/panel?next=https://evil.example"]) {
    const target = redirectFor(url);
    assert.ok(target.startsWith("/panel?"), `${url} -> ${target}`);
    assert.ok(!target.startsWith("//"));
  }
});

test("the page script still decides the same way the server does", () => {
  // The server copies the page's rule; if the page's rule changes, this has to follow.
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.ok(source.includes('if (params.get("v") === build) return;'), "page compares the first v with the build");
  assert.ok(source.includes("if (!/^https:\\\\/\\\\//.test("), "page reloads only on https");
  assert.ok(source.includes("params.set(\"v\", build);"), "page sets the build the same way");
});
