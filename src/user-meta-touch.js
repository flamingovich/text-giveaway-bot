// Whether upsertUserMeta has anything worth writing.
//
// It runs on every authenticated request of the join mini app - each /live
// poll of every open done screen included, every 2.5 seconds - and each write
// re-reads and re-serialises the whole user-project-profiles document, 3.3 MB
// by September. Writing on every request cost ~120 ms a poll and rewrote the
// document every couple of seconds, which on an evening peak kept the single
// core at 90% and every other request waiting behind it.
//
// So it writes only when there is news: someone new, a name Telegram now
// reports differently, or a last-seen stamp older than the touch interval.
// Nothing reads meta.updatedAt to the minute: the dashboard takes its day as a
// stand-in for "first seen" (a stamp that moves less is closer to that), and
// the profile page falls back to it only when firstSeenAt is missing - which a
// record never is after its first write here.

const USER_META_TOUCH_MS = 15 * 60 * 1000;

function userMetaNeedsWrite(prevMeta, user, now = Date.now(), touchMs = USER_META_TOUCH_MS) {
  if (!user?.id) {
    return false;
  }
  if (!prevMeta || !prevMeta.firstSeenAt || String(prevMeta.id ?? "") !== String(user.id)) {
    return true;
  }
  // Mirrors the merge in upsertUserMeta: an empty value from Telegram never
  // clears a stored one, so only a non-empty, different value is news.
  for (const field of ["username", "first_name", "last_name"]) {
    const incoming = user[field];
    if (incoming && incoming !== (prevMeta[field] || "")) {
      return true;
    }
  }
  const touchedAt = Date.parse(prevMeta.updatedAt || "");
  return !Number.isFinite(touchedAt) || now - touchedAt >= touchMs;
}

module.exports = { USER_META_TOUCH_MS, userMetaNeedsWrite };
