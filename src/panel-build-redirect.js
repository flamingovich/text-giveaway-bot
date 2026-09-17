// The panel URL carries the page build (?v=) so Telegram's WebView cannot hand
// back a page it cached from an older build. The page checks this itself and
// reloads when the build is missing or stale - but by then the server has
// already drawn the page once, and the reload draws it again. Opening the panel
// from the menu button, whose URL has no build, cost two full renders.
//
// The server answers such a request with a redirect instead, before drawing
// anything. It decides exactly as the page script does - the first "v" must
// equal the build - so a URL it redirects to never makes the page reload again.
// The page script stays: it is what still catches a page served from cache.
function getPanelBuildRedirect({ originalUrl, build, publicUrl, basePath }) {
  if (!build || !/^https:\/\//.test(String(publicUrl || ""))) {
    return null;
  }
  const url = String(originalUrl || "");
  const queryStart = url.indexOf("?");
  // The raw query, not Express's parsed one: every parameter comes back exactly
  // as it was sent, including repeated and bracketed ones.
  const params = new URLSearchParams(queryStart === -1 ? "" : url.slice(queryStart + 1));
  if (params.get("v") === String(build)) {
    return null;
  }
  params.set("v", String(build));
  return `${basePath}?${params.toString()}`;
}

module.exports = { getPanelBuildRedirect };
