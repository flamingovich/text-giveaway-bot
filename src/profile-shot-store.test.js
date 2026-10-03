const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  decodeShotDataUrl,
  hashShot,
  findShotHashOwner,
  saveShotFile,
  resolveShotFile,
  MAX_SHOT_BYTES,
} = require("./profile-shot-store");

const jpeg = (bytes) => `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;

test("a picture sent as a data URL is decoded", () => {
  const decoded = decodeShotDataUrl(jpeg([1, 2, 3]));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.ext, "jpg");
  assert.deepEqual([...decoded.buffer], [1, 2, 3]);
});

test("anything but a picture is refused", () => {
  assert.equal(decodeShotDataUrl("hello").ok, false);
  assert.equal(decodeShotDataUrl("data:text/html;base64,PGI+").ok, false);
  assert.equal(decodeShotDataUrl("data:image/jpeg;base64,").ok, false);
});

test("an oversized picture is refused", () => {
  const big = jpeg(Buffer.alloc(MAX_SHOT_BYTES + 1));
  assert.match(decodeShotDataUrl(big).error, /слишком большой/);
});

test("the same picture from someone else is found, one's own is not", () => {
  const sha = hashShot(Buffer.from([9, 9, 9]));
  const profiles = {
    users: {
      100: { projects: { brand_beef_1: { profileShot: { sha256: sha } } } },
      200: { projects: { brand_beef_1: { profileShot: { sha256: "other" } } } },
    },
  };
  assert.equal(findShotHashOwner(profiles, sha, 200), "100");
  assert.equal(findShotHashOwner(profiles, sha, 100), null);
  assert.equal(findShotHashOwner(profiles, "", 200), null);
});

test("a picture is stored under the shots folder and can be found again", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shots-"));
  try {
    const decoded = decodeShotDataUrl(jpeg([1, 2, 3]));
    const sha = hashShot(decoded.buffer);
    const relative = saveShotFile(dir, 42, "brand_beef_7", decoded, sha);
    assert.match(relative, /^profile-shots[\\/]42[\\/]brand_beef_7-[0-9a-f]{12}\.jpg$/);
    const absolute = resolveShotFile(dir, relative);
    assert.deepEqual([...fs.readFileSync(absolute)], [1, 2, 3]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a stored path cannot point outside the shots folder", () => {
  assert.equal(resolveShotFile("/data", "../etc/passwd"), null);
  assert.equal(resolveShotFile("/data", "giveaway.db"), null);
  assert.equal(resolveShotFile("/data", "profile-shots/../giveaway.db"), null);
});
