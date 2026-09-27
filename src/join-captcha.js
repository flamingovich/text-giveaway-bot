// Whether the captcha step of a join is passed.
//
// With a reCAPTCHA secret configured, only a token Google confirms counts. A
// bare { verified: true } used to be accepted in its place whenever no token
// came with it - so a script got past the captcha simply by not sending one.
// Without a secret the page shows its own stand-in checkbox, and the flag it
// sends is all there is to check.

async function isJoinCaptchaPassed({ secretConfigured, token, verified, verifyToken }) {
  if (secretConfigured) {
    const value = String(token || "").trim();
    if (!value) {
      return false;
    }
    return (await verifyToken(value)) === true;
  }
  return verified === true;
}

module.exports = { isJoinCaptchaPassed };
