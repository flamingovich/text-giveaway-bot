const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  getEmojiDataUrl,
  sendEmojiData,
  getEmojiOpenButtonMarkup,
  getEmojiPanelMarkup,
  getEmojiPickerScript,
} = require("./emoji-picker");

function fakeResponse() {
  return {
    headers: {},
    body: null,
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    send(body) {
      this.body = body;
    },
  };
}

const version = new URL(getEmojiDataUrl(), "http://localhost").searchParams.get("v");

test("the page script is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(getEmojiPickerScript()));
});

test("the picker starts closed and out of the tab order", () => {
  assert.match(getEmojiPanelMarkup(), /data-emoji-panel inert aria-hidden="true"/);
  assert.match(getEmojiOpenButtonMarkup(), /aria-expanded="false"/);
});

test("every section has a tab, the recent one hidden until there is history", () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "emoji", "emoji-data.json"), "utf8"));
  const markup = getEmojiPanelMarkup();
  for (const id of ["recent", "giveaway", ...data.groups.map((group) => group.id)]) {
    assert.match(markup, new RegExp(`data-tab="${id}"`), `нет вкладки ${id}`);
  }
  assert.match(markup, /data-tab="recent"[^>]*hidden/);
});

test("the set goes out packed and is kept for good under its version", () => {
  const res = fakeResponse();
  sendEmojiData({ query: { v: version }, headers: { "accept-encoding": "gzip, deflate, br" } }, res);
  assert.equal(res.headers["content-encoding"], "gzip");
  assert.match(res.headers["cache-control"], /immutable/);
  assert.match(res.headers["content-type"], /application\/json/);
  const data = JSON.parse(zlib.gunzipSync(res.body).toString("utf8"));
  assert.ok(data.items.length > 1800);
});

// A page from before the file changed asks for the old version; it gets the
// new file, and nobody may keep that under the old address for a year.
test("a stale or missing version is not cached for good", () => {
  for (const query of [{ v: "stale" }, {}]) {
    const res = fakeResponse();
    sendEmojiData({ query, headers: {} }, res);
    assert.equal(res.headers["cache-control"], "no-cache");
    assert.equal(res.headers["content-encoding"], undefined);
    assert.ok(JSON.parse(res.body.toString("utf8")).items.length > 1800);
  }
});
