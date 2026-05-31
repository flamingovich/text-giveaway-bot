const TG_AVATAR_GRADIENTS = [
  { top: "#7BD3FF", bottom: "#2AABEE" },
  { top: "#90CAF9", bottom: "#42A5F5" },
  { top: "#FFAB91", bottom: "#E64A19" },
  { top: "#FFB74D", bottom: "#F57C00" },
  { top: "#A5D6A7", bottom: "#43A047" },
  { top: "#80CBC4", bottom: "#00897B" },
  { top: "#CE93D8", bottom: "#AB47BC" },
  { top: "#B39DDB", bottom: "#7E57C2" },
  { top: "#F48FB1", bottom: "#D81B60" },
  { top: "#EF9A9A", bottom: "#E53935" },
  { top: "#FFE082", bottom: "#FFB300" },
  { top: "#80DEEA", bottom: "#00ACC1" },
  { top: "#9FA8DA", bottom: "#5C6BC0" },
  { top: "#FFCC80", bottom: "#FB8C00" },
  { top: "#C5E1A5", bottom: "#7CB342" },
  { top: "#F06292", bottom: "#C2185B" },
];

function getAvatarFallbackStyle(userId) {
  const seed = String(userId || "0");
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette = TG_AVATAR_GRADIENTS[hash % TG_AVATAR_GRADIENTS.length];
  return `--avatar-grad-top:${palette.top};--avatar-grad-bottom:${palette.bottom};`;
}

module.exports = { TG_AVATAR_GRADIENTS, getAvatarFallbackStyle };
