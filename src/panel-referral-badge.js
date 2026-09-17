const {
  getDrawOwnerId,
  listUserBrandProjectEntries,
  resolveReferralOwnerForBrand,
} = require("./project-profile-bridge");

// One panel page draws dozens of winner cards. Each card used to parse the
// profiles document (3.5 MB) and the draws document anew for its referral
// badge - about 50 ms a card, three seconds a page. The documents are read once
// per page instead: lazily, so a page with no winners reads nothing extra, and
// never reused by the next page, which must see what changed in between.
function createRenderReads(readers) {
  const reads = {};
  for (const [name, read] of Object.entries(readers)) {
    let loaded = false;
    let value;
    reads[name] = () => {
      if (!loaded) {
        value = read();
        loaded = true;
      }
      return value;
    };
  }
  return reads;
}

// Which referral badge a winner card shows: "unregistered", "foreign" (someone
// else's referral), "non-referral" or "referral".
//
// userProfiles is the profiles document the page was drawn from; the brand
// lookup reads it rather than parsing its own copy. reads carries the projects
// and draws documents for the page (createRenderReads). Nothing here writes, so
// sharing the documents between cards changes no answer.
function resolveWinnerReferralBadge({ winnerId, draw, project, projectData, userProfiles, reads, isUnregistered }) {
  // First, because it is the reason this particular prize is halved - "Реф"
  // beside a halved amount would read as a mistake.
  if (isUnregistered) {
    return { kind: "unregistered", referralOwnerId: null };
  }
  const profileData = projectData || {};
  const drawOwnerId = getDrawOwnerId(draw);

  let referralOwnerId = null;
  if (project?.name) {
    const brandEntries = listUserBrandProjectEntries(
      winnerId,
      project.name,
      () => userProfiles,
      reads.projects,
    );
    referralOwnerId = resolveReferralOwnerForBrand(winnerId, brandEntries, reads.data);
  }
  if (referralOwnerId == null && profileData.referralOwnerId != null) {
    referralOwnerId = Number(profileData.referralOwnerId);
  }

  if (referralOwnerId && drawOwnerId && referralOwnerId !== drawOwnerId) {
    return { kind: "foreign", referralOwnerId };
  }
  if (profileData.selfReportedNonReferral) {
    return { kind: "non-referral", referralOwnerId };
  }
  return { kind: "referral", referralOwnerId };
}

module.exports = { createRenderReads, resolveWinnerReferralBadge };
