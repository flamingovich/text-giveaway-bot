const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createSignalHasher, readClientSignals, networkOf, classifyNetwork, rdapText, createNetworkTypes } = require("./device-signals");

test("only hashes are kept, and the same value gives the same hash", () => {
  const hash = createSignalHasher("secret");
  assert.equal(hash("ABC-123"), hash(" abc-123 "));
  assert.notEqual(hash("abc-123"), createSignalHasher("other")("abc-123"));
  assert.equal(hash(""), "");
  assert.equal(hash("abc-123").length, 24);
});

test("a device id and fingerprint are taken only when they look right", () => {
  const fp = "a".repeat(64);
  assert.deepEqual(readClientSignals({ dev: "123e4567-e89b-12d3-a456-426614174000", fp }), {
    deviceId: "123e4567-e89b-12d3-a456-426614174000",
    fingerprint: fp,
  });
  assert.deepEqual(readClientSignals({ dev: "<script>", fp: "short" }), { deviceId: "", fingerprint: "" });
  assert.deepEqual(readClientSignals(undefined), { deviceId: "", fingerprint: "" });
});

// The registry is asked about the network, never about the person's address.
test("the network of an address", () => {
  assert.equal(networkOf("203.0.113.57"), "203.0.113.0");
  assert.equal(networkOf("::ffff:203.0.113.57"), "203.0.113.0");
  assert.equal(networkOf("2a00:1fa0:4a2:1:2:3:4:5"), "2a00:1fa0:4a2::");
  assert.equal(networkOf(""), "");
});

test("mobile carriers and hosting are told from home networks", () => {
  assert.equal(classifyNetwork({ text: "MTS PJSC Mobile TeleSystems", country: "RU" }), "mobile");
  assert.equal(classifyNetwork({ text: "Beeline GPRS", country: "RU" }), "mobile");
  assert.equal(classifyNetwork({ text: "Hetzner Online GmbH", country: "DE" }), "hosting");
  assert.equal(classifyNetwork({ text: "Some VPN provider", country: "RU" }), "hosting");
  assert.equal(classifyNetwork({ text: "Rostelecom broadband", country: "RU" }), "home");
  // Outside the CIS an unknown network is almost always a VPN.
  assert.equal(classifyNetwork({ text: "Comcast Cable", country: "US" }), "hosting");
});

test("names, remarks and contacts are all read from an RDAP answer", () => {
  const text = rdapText({
    name: "NET-1",
    remarks: [{ description: ["Mobile subscribers"] }],
    entities: [{ vcardArray: ["vcard", [["fn", {}, "text", "Tele2 Russia"]]] }],
  });
  assert.match(text, /Mobile subscribers/);
  assert.match(text, /Tele2 Russia/);
});

test("a network is asked about once, in the background", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return { ok: true, json: async () => ({ name: "MTS-MOBILE", country: "RU" }) };
  };
  const types = createNetworkTypes(new Database(":memory:"), { hash: createSignalHasher("s"), fetchImpl, logger: { warn() {} } });
  types.note("203.0.113.5");
  types.note("203.0.113.9");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(asked, ["https://rdap.org/ip/203.0.113.0"]);
  assert.equal(types.typeOf(types.keyOf("203.0.113.77")), "mobile");
});
