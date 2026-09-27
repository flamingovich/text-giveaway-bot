// The name the owner gives an admin: how the panel shows them and whose
// referral a person is ("Реф Депман"). Telegram names are whatever the person
// set, often not what the owner calls them.

const ADMIN_LABEL_MAX = 40;

function normalizeAdminLabel(label) {
  return String(label || "").replace(/\s+/g, " ").trim().slice(0, ADMIN_LABEL_MAX);
}

// The badge on someone else's referral: the given name first, else the
// Telegram name, else @username. The owner asked for the given name there:
// a handle says less about whose referral it is than what they call the admin.
function formatReferralOwnerLabel({ givenLabel, meta } = {}) {
  const given = normalizeAdminLabel(givenLabel);
  if (given) return `Реф ${given}`;
  const fullName = [meta?.first_name, meta?.last_name].filter(Boolean).join(" ").trim();
  if (fullName) return `Реф ${fullName}`;
  const username = String(meta?.username || "").replace(/^@/, "").trim();
  return username ? `Реф @${username}` : "Реф другого организатора";
}

module.exports = { ADMIN_LABEL_MAX, normalizeAdminLabel, formatReferralOwnerLabel };
