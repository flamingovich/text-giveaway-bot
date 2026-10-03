const test = require("node:test");
const assert = require("node:assert");
const {
  normalizeShotBrand,
  parseShotAnswer,
  cleanShotAccountId,
  judgeShotAnswer,
  describeShotRefusal,
  askShotModel,
  SHOT_PROMPT,
} = require("./profile-shot-reader");

const BEEF = { templateSlug: "beef", name: "BEEF" };
const FUGU = { templateSlug: "fugu", name: "FUGU" };
const LUCKYBEAR = { templateSlug: "luckybear", name: "LuckyBear" };
const POKERDOM = { templateSlug: "pokerdom", name: "Pokerdom" };

const answer = (brand, accountId, isProfileScreen = true) => parseShotAnswer(JSON.stringify({ brand, accountId, isProfileScreen }));

// The owner's own screenshots, as gemini-2.5-flash answered them.
test("the five brands' answers give the IDs the projects issued", () => {
  assert.deepEqual(judgeShotAnswer(answer("BEEF", "#W3N5E"), BEEF), { ok: true, accountId: "#W3N5E" });
  assert.deepEqual(judgeShotAnswer(answer("FUGU", "#BHC29"), FUGU), { ok: true, accountId: "#BHC29" });
  assert.deepEqual(judgeShotAnswer(answer("LuckyBear", "1771050325"), LUCKYBEAR), { ok: true, accountId: "1771050325" });
  assert.deepEqual(judgeShotAnswer(answer("Pokerdom", "6a1213488e3aee5d27972fc9"), POKERDOM), {
    ok: true,
    accountId: "6a1213488e3aee5d27972fc9",
  });
});

test("LuckyBear's ID is the UID, with or without the word", () => {
  assert.equal(cleanShotAccountId("UID:1771050325"), "1771050325");
  assert.equal(cleanShotAccountId("uid 1771050325"), "1771050325");
  assert.equal(judgeShotAnswer(answer("LuckyBear", "UID: 1771050325"), LUCKYBEAR).accountId, "1771050325");
});

test("another brand's profile is turned down and named", () => {
  const verdict = judgeShotAnswer(answer("FUGU", "#BHC29"), BEEF);
  assert.deepEqual(verdict, { ok: false, reason: "wrong_brand", brandSeen: "fugu" });
  assert.match(describeShotRefusal(verdict.reason, BEEF, verdict.brandSeen), /скриншот FUGU, а нужен BEEF/);
});

test("a picture that is not a profile is turned down", () => {
  assert.equal(judgeShotAnswer(answer("unknown", ""), BEEF).reason, "not_profile");
  assert.equal(judgeShotAnswer(answer("BEEF", "#W3N5E", false), BEEF).reason, "not_profile");
  assert.equal(judgeShotAnswer(null, BEEF).reason, "unreadable");
});

test("a profile without a readable ID is turned down", () => {
  assert.equal(judgeShotAnswer(answer("BEEF", ""), BEEF).reason, "no_id");
  // The shape BEEF never issues: what the typed-ID step refuses, this refuses too.
  assert.equal(judgeShotAnswer(answer("BEEF", "6a1213488e3aee5d27972fc9"), BEEF).reason, "bad_id");
});

test("brand names come in any spelling", () => {
  assert.equal(normalizeShotBrand("Lucky Bear"), "luckybear");
  assert.equal(normalizeShotBrand("Покердом"), "pokerdom");
  assert.equal(normalizeShotBrand("unknown"), "");
});

test("an answer wrapped in a code fence still reads", () => {
  const parsed = parseShotAnswer('```json\n{"brand":"IRIS","accountId":"#IEKZ8","isProfileScreen":true}\n```');
  assert.deepEqual(parsed, { brand: "iris", accountId: "#IEKZ8", isProfileScreen: true });
  assert.equal(parseShotAnswer("не JSON"), null);
});

// Level names and badges change as a player grows; the owner asked for them
// not to decide the brand.
test("the prompt tells the brands apart without levels", () => {
  assert.match(SHOT_PROMPT, /НЕ используй названия уровней/);
  assert.doesNotMatch(SHOT_PROMPT, /SWEET START|SUGAR BOOST|REGULAR|STARTER/);
});

test("the model is asked once with the picture and its answer parsed", async () => {
  let sent = null;
  const fetchImpl = async (url, options) => {
    sent = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"brand":"BEEF","accountId":"#W3N5E","isProfileScreen":true}' } }] }),
    };
  };
  const parsed = await askShotModel({ apiKey: "k", imageDataUrl: "data:image/jpeg;base64,AAA", fetchImpl });
  assert.equal(parsed.brand, "beef");
  assert.match(sent.url, /openrouter\.ai/);
  assert.equal(sent.body.messages[0].content[1].image_url.url, "data:image/jpeg;base64,AAA");
});

test("no key or a provider error is 'try again', not a refusal", async () => {
  await assert.rejects(askShotModel({ apiKey: "", imageDataUrl: "x" }), /OPENROUTER_API_KEY/);
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate" } }) });
  await assert.rejects(askShotModel({ apiKey: "k", imageDataUrl: "x", fetchImpl }), /429/);
});
