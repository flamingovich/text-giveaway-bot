const test = require("node:test");
const assert = require("node:assert");
const { isValidTronAddress } = require("./tron-address");
const { validateDepositAddress } = require("./deposit-guide");

test("a real Tron address passes", () => {
  assert.equal(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"), true);
  assert.equal(isValidTronAddress("  TJho7Na756B51yEnm7XVR2qLqAeoPUkSvD "), true);
});

// One wrong letter keeps the shape but breaks the checksum: the prize would be lost.
test("an address with a typo is refused", () => {
  assert.equal(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u"), false);
  assert.equal(validateDepositAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u", "trc20"), false);
  assert.equal(validateDepositAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "trc20"), true);
});

test("not a Tron address at all", () => {
  assert.equal(isValidTronAddress(""), false);
  assert.equal(isValidTronAddress("0xdac17f958d2ee523a2206206994597c13d831ec7"), false);
  assert.equal(isValidTronAddress("T0000000000000000000000000000000000"), false);
});
