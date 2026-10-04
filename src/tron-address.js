// A Tron address carries its own checksum (base58check). The shape alone -
// "T and 33 letters" - let through addresses with a typo: four of them were
// stored in the base, and a prize sent there would be lost for good.
const crypto = require("crypto");

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SHAPE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest();

function isValidTronAddress(address) {
  const text = String(address || "").trim();
  if (!SHAPE.test(text)) {
    return false;
  }
  let n = 0n;
  for (const ch of text) {
    n = n * 58n + BigInt(ALPHABET.indexOf(ch));
  }
  let hex = n.toString(16);
  if (hex.length % 2) {
    hex = `0${hex}`;
  }
  const bytes = Buffer.from(hex, "hex");
  if (bytes.length !== 25 || bytes[0] !== 0x41) {
    return false;
  }
  const payload = bytes.subarray(0, 21);
  return sha256(sha256(payload)).subarray(0, 4).equals(bytes.subarray(21));
}

module.exports = { isValidTronAddress };
