// Where a request to the join API really came from.
//
// nginx in front of the app sets X-Real-IP to the address the connection came
// from, and the client cannot touch it. X-Forwarded-For is different: nginx
// appends the real address to whatever the client already put there, so the
// first entry is the client's own claim. Taking that first entry let anyone
// send a different "IP" for every account and walk past every IP rule of the
// anti-fraud (draw-anti-fraud.js).
//
// So: X-Real-IP first, then the last X-Forwarded-For entry (the one nginx
// added), then the socket. If a CDN such as Cloudflare is ever put in front of
// nginx, both would become the CDN's address and this must change with it -
// today the site talks to clients directly (rollerbot.pro points at the server).

function extractClientIp(req) {
  const headers = req?.headers || {};
  const realIp = String(headers["x-real-ip"] || "").trim();
  if (realIp) {
    return realIp;
  }
  const forwarded = String(headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (forwarded.length > 0) {
    return forwarded[forwarded.length - 1];
  }
  return String(req?.ip || req?.socket?.remoteAddress || "").trim();
}

module.exports = { extractClientIp };
