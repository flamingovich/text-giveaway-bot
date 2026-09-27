// The account ID a winner gave for the draw's brand, shown on their card under
// the brand's logo: the owner checks it against the casino before paying.
//
// Someone who joined through another organiser of the same brand carries the
// ID they gave there (project-profile-bridge.js), and a draw without a wallet
// step does not copy it into this organiser's profile. So the brand's other
// profiles - brand_<slug>_<owner> - are looked through as well.
//
// What can be told without asking the casino is marked: an ID of another
// brand's shape, one that fails today's check, or one that spells the
// person's own name ("#SLAVA" from a Слава) was typed to get past the step.

const {
  validateProjectAccountIdFormat,
  isProjectAccountIdShapeMismatched,
  isProjectAccountIdOwnName,
} = require("./project-account-id");

function findWinnerAccountId(userNode, project) {
  const profiles = userNode?.projects || {};
  const own = String(profiles[project?.id]?.projectAccountId || "").trim();
  if (own) {
    return own;
  }
  const slug = project?.templateSlug;
  if (!slug) {
    return "";
  }
  const prefix = `brand_${slug}_`;
  for (const [projectId, data] of Object.entries(profiles)) {
    const id = String(data?.projectAccountId || "").trim();
    if (id && projectId !== project.id && projectId.startsWith(prefix)) {
      return id;
    }
  }
  return "";
}

function describeWinnerAccountId(userNode, project) {
  const id = findWinnerAccountId(userNode, project);
  if (!id) {
    return null;
  }
  let warning = "";
  if (isProjectAccountIdShapeMismatched(project, id)) {
    warning = `${project?.name || "Проект"} таких ID не выдаёт`;
  } else if (!validateProjectAccountIdFormat(id, project).ok) {
    warning = "ID не проходит проверку";
  } else if (isProjectAccountIdOwnName(id, userNode?.meta)) {
    warning = "ID похож на имя человека";
  }
  return { id, warning };
}

// A Pokerdom ID is 24 characters and took two lines of the card: it shows as
// "6a2e…443d" and opens in full on a tap. The short kinds, #XXXXX and a
// LuckyBear number, are shown whole.
const LONG_ID = 12;
function shortenAccountId(id) {
  const text = String(id || "");
  return text.length > LONG_ID ? `${text.slice(0, 4)}…${text.slice(-4)}` : "";
}

module.exports = { findWinnerAccountId, describeWinnerAccountId, shortenAccountId };
