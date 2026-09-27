// A Mini App opened at the site's root.
//
// The join button in a post is a Direct Link, t.me/<bot>/join?startapp=<draw>,
// and Telegram opens whatever address BotFather holds for "join". With the bare
// domain there instead of /join/app, a participant got the "site coming soon"
// page and no way into the draw - and nothing in any log said why, because the
// root page is not the join app and logs nothing.
//
// Telegram puts the startapp value into the address as tgWebAppStartParam, so a
// root request carrying it can only be a Mini App launch. It is sent on to the
// join app with the query as it came; the #tgWebAppData fragment rides along,
// since a redirect without a fragment of its own keeps the one it came with.

function getRootMiniAppRedirect(originalUrl) {
  const url = String(originalUrl || "");
  const queryStart = url.indexOf("?");
  if (queryStart === -1) {
    return null;
  }
  const query = url.slice(queryStart + 1);
  const params = new URLSearchParams(query);
  if (!params.get("tgWebAppStartParam")) {
    return null;
  }
  return `/join/app?${params.toString()}`;
}

module.exports = { getRootMiniAppRedirect };
