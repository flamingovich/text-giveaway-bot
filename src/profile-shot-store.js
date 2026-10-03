// Keeping the screenshot a person proved their project account with.
//
// The phone shrinks the picture before sending it (the join page draws it on a
// canvas and sends a JPEG of at most 1400 px), so what arrives here is a few
// hundred kilobytes and the server needs no image library. It is written to
// disk only once the person has confirmed the ID read from it, and only the
// owner sees it again - in the web admin's person card.
//
// The same picture coming from two people is one person behind two accounts or
// a screenshot passed around; its hash is kept on the profile to catch that.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SHOT_DIR_NAME = "profile-shots";
const MAX_SHOT_BYTES = 3 * 1024 * 1024;
const SHOT_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// "data:image/jpeg;base64,...." -> the bytes, or why not.
function decodeShotDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || "").trim());
  if (!match) {
    return { ok: false, error: "Это не картинка. Пришлите скриншот." };
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) {
    return { ok: false, error: "Это не картинка. Пришлите скриншот." };
  }
  if (buffer.length > MAX_SHOT_BYTES) {
    return { ok: false, error: "Скриншот слишком большой. Пришлите обычный скриншот экрана." };
  }
  return { ok: true, buffer, mime: match[1], ext: SHOT_TYPES[match[1]] };
}

function hashShot(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Whose profile already holds this picture, if anyone else's.
function findShotHashOwner(userProfiles, sha256, userId) {
  if (!sha256) {
    return null;
  }
  for (const [ownerId, node] of Object.entries(userProfiles?.users || {})) {
    if (String(ownerId) === String(userId)) {
      continue;
    }
    for (const data of Object.values(node?.projects || {})) {
      if (data?.profileShot?.sha256 === sha256) {
        return ownerId;
      }
    }
  }
  return null;
}

// data/profile-shots/<user>/<project>-<hash>.<ext>; the profile keeps the part
// after data/, so a moved data directory moves its pictures with it.
function saveShotFile(dataDir, userId, projectId, decoded, sha256) {
  const safeProject = String(projectId || "project").replace(/[^A-Za-z0-9_-]/g, "_");
  const relative = path.join(SHOT_DIR_NAME, String(Number(userId)), `${safeProject}-${sha256.slice(0, 12)}.${decoded.ext}`);
  const absolute = path.join(dataDir, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, decoded.buffer);
  return relative;
}

// The absolute path of a stored picture, never outside the shots folder.
function resolveShotFile(dataDir, relative) {
  const base = path.resolve(dataDir, SHOT_DIR_NAME);
  const absolute = path.resolve(dataDir, String(relative || ""));
  return absolute.startsWith(base + path.sep) ? absolute : null;
}

module.exports = {
  SHOT_DIR_NAME,
  MAX_SHOT_BYTES,
  decodeShotDataUrl,
  hashShot,
  findShotHashOwner,
  saveShotFile,
  resolveShotFile,
};
