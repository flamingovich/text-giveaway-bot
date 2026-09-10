// Anonymous participation: a person can join a draw without their name and
// photo being shown to everyone else when they win.
//
// The mask is built on the server and the real name is never sent to a public
// page. The mini app blurs what it receives, but a blur is only CSS - on a
// desktop it comes off in two clicks - so it decorates the mask rather than
// standing in for it.

const MASK_BODY = "***";

// Everything the public sees comes from here, so the flag has to live with the
// draw and not with the person: someone can want to be invisible in one draw
// and named in the next.
function isParticipantAnonymous(draw, userId) {
  return Boolean(draw?.participantMeta?.[String(userId)]?.anonymous);
}

function setParticipantAnonymous(draw, userId, anonymous) {
  if (!draw) {
    return false;
  }
  if (!draw.participantMeta) {
    draw.participantMeta = {};
  }
  const key = String(userId);
  const current = draw.participantMeta[key] || {};
  const next = Boolean(anonymous);
  if (Boolean(current.anonymous) === next) {
    return false;
  }
  draw.participantMeta[key] = {
    ...current,
    anonymous: next,
    anonymousUpdatedAt: new Date().toISOString(),
  };
  return true;
}

// A fixed three stars, not one per hidden letter: the length of a name is
// itself a hint, and "Н*****а" next to a list of participants narrows it down
// far more than the two letters we already agreed to show.
function maskDisplayName(rawName) {
  const name = String(rawName || "").trim();
  if (!name) {
    return "Аноним";
  }
  // getWinnerDisplayName falls back to "ID 123" when Telegram gave us nothing;
  // masking that would print the id back out one digit at a time.
  if (/^ID\s+\d+$/i.test(name)) {
    return "Аноним";
  }
  const at = name.startsWith("@") ? "@" : "";
  const body = at ? name.slice(1) : name;
  const letters = [...body];
  if (letters.length === 0) {
    return "Аноним";
  }
  if (letters.length < 3) {
    return `${at}${letters[0]}${MASK_BODY}`;
  }
  return `${at}${letters[0]}${MASK_BODY}${letters[letters.length - 1]}`;
}

// One place decides what a public list may show, so the winners page, the
// participants tab and the channel post cannot drift apart.
function buildPublicIdentity(user, anonymous) {
  if (!anonymous) {
    return { ...user, anonymous: false };
  }
  const masked = maskDisplayName(user?.displayName);
  return {
    ...user,
    anonymous: true,
    displayName: masked,
    // The username is a direct link to the person - it cannot survive the mask.
    username: "",
    initial: (masked.replace(/^@/, "")[0] || "?").toUpperCase(),
    // A photo identifies someone as surely as a name does.
    avatarUrl: "",
  };
}

module.exports = {
  MASK_BODY,
  isParticipantAnonymous,
  setParticipantAnonymous,
  maskDisplayName,
  buildPublicIdentity,
};
