// Which address the web server listens on.
//
// nginx reaches the app on 127.0.0.1:30009. Listening on every interface also
// let anyone on the internet reach it directly on port 30009, past nginx - and
// then X-Real-IP, which client-ip.js trusts because nginx sets it, was
// whatever the caller wrote: a fresh "address" per request for the join
// anti-fraud and for the admin sign-in limit alike. So the app listens on the
// loopback only. WEB_HOST=0.0.0.0 opens it up on purpose, for instance to look
// at the design server from a phone on the same network.

function resolveWebHost(env = process.env) {
  const host = String(env.WEB_HOST || "").trim();
  return host || "127.0.0.1";
}

module.exports = { resolveWebHost };
