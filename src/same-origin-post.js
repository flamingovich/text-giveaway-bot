// Is a form post to the panel coming from the panel itself?
//
// The panel's session cookie is SameSite=None - the panel has to work inside
// Telegram's web client, which counts as another site - so a form on any page
// can post to the panel with the organiser's cookie attached. Every panel
// action (mark paid, refuse payout, delete a draw, finish it now) is such a
// form post, and none of them checked where the post came from.
//
// The browser names the page a post comes from in Origin, or failing that in
// Referer. A post naming another site is refused. "null" is how a sandboxed
// frame or a redirect hides its origin - the usual way to dress up a forged
// post - so it counts as foreign unless Referer says otherwise. A post that
// names nothing at all is let through: some old WebViews send neither, while a
// cross-site form in any current browser always sends Origin.

function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch (_error) {
    return null;
  }
}

function isSameOriginPost(headers, allowedHosts) {
  const allowed = new Set(allowedHosts.filter(Boolean).map((host) => String(host).toLowerCase()));
  const origin = String(headers?.origin || "").trim();
  const referer = String(headers?.referer || "").trim();

  if (origin && origin !== "null") {
    return allowed.has(hostOf(origin));
  }
  if (referer) {
    return allowed.has(hostOf(referer));
  }
  return origin !== "null";
}

module.exports = { isSameOriginPost };
