const fs = require("fs");
const path = require("path");

const ASSETS_ROOT = path.join(__dirname, "..", "assets", "trc20-guide");
const RP_GUIDE_DIR = path.join(ASSETS_ROOT, "rp_guide");

const DEPOSIT_NETWORKS = {
  trc20: {
    id: "trc20",
    label: "Tether TRC-20 (Tron)",
    shortLabel: "TRC-20",
    selectLabel: "Tether TRC-20",
    addressPrefix: "T",
    addressExample: "TWn.....8Nd",
    validate(address) {
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(address || "").trim());
    },
    rpStep3Image: "rp_step3_trc20.jpg",
  },
  erc20: {
    id: "erc20",
    label: "Tether ERC-20 (Ethereum)",
    shortLabel: "ERC-20",
    selectLabel: "Tether ERC-20",
    addressPrefix: "0x",
    addressExample: "0x12.....Ab3",
    validate(address) {
      return /^0x[a-fA-F0-9]{40}$/.test(String(address || "").trim());
    },
    rpStep3Image: "rp_step3_erc20.jpg",
  },
  bep20: {
    id: "bep20",
    label: "Tether BEP-20 (BSC)",
    shortLabel: "BEP-20",
    selectLabel: "Tether BEP-20",
    addressPrefix: "0x",
    addressExample: "0x12.....Ab3",
    validate(address) {
      return /^0x[a-fA-F0-9]{40}$/.test(String(address || "").trim());
    },
    rpStep3Image: "rp_step3_bep20.jpg",
  },
};

const POKERDOM_GUIDE_IMAGES = [
  path.join(ASSETS_ROOT, "step-1.png"),
  path.join(ASSETS_ROOT, "step-2.png"),
  path.join(ASSETS_ROOT, "step-3.png"),
];

const BRAND_PROJECT_TEMPLATES = [
  { templateSlug: "pokerdom", name: "Pokerdom" },
  { templateSlug: "beef", name: "BEEF" },
  { templateSlug: "fugu", name: "FUGU" },
  { templateSlug: "iris", name: "IRIS" },
];

function normalizeDepositNetwork(value) {
  const key = String(value || "").trim().toLowerCase();
  return DEPOSIT_NETWORKS[key] ? key : null;
}

function pickRandomDepositNetwork() {
  const keys = Object.keys(DEPOSIT_NETWORKS);
  return keys[Math.floor(Math.random() * keys.length)];
}

function isPokerdomProject(project) {
  const slug = String(project?.templateSlug || project?.brandSlug || "").trim().toLowerCase();
  const name = String(project?.name || "").trim().toLowerCase();
  return slug === "pokerdom" || name === "pokerdom";
}

function resolveDepositNetworkForProject(project, explicitNetwork = null) {
  const normalized = normalizeDepositNetwork(explicitNetwork);
  if (normalized) {
    return normalized;
  }
  if (isPokerdomProject(project)) {
    return "trc20";
  }
  return pickRandomDepositNetwork();
}

function getDepositNetworkMeta(networkId) {
  const key = normalizeDepositNetwork(networkId) || "trc20";
  return DEPOSIT_NETWORKS[key];
}

function getInvalidAddressError(networkId) {
  const network = getDepositNetworkMeta(networkId);
  return `Неверный формат ${network.shortLabel} адреса.\nПример: ${network.addressExample}`;
}

function validateDepositAddress(address, networkId) {
  const network = getDepositNetworkMeta(networkId);
  return network.validate(address);
}

function buildNetworkForfeitWarningHtml(networkId) {
  const network = getDepositNetworkMeta(networkId);
  return [
    `<b>⚠️ Очень важно:</b> отправьте адрес именно в сети <b>${network.shortLabel}</b> (${network.label}).`,
    "Если сеть будет неверной — <b>приз сгорит</b> без возможности восстановления!",
  ].join("\n");
}

function buildJoinWalletStepPayload(project, networkId) {
  const network = getDepositNetworkMeta(networkId);
  const pokerdom = isPokerdomProject(project);

  if (pokerdom) {
    return {
      kind: "pokerdom",
      networkId: "trc20",
      stepTitle: "TRC-20 адрес",
      fieldLabel: "TRC-20 адрес",
      placeholder: "T...",
      introText: "Отправьте TRC-20 адрес с проекта.",
      networkWarningHtml: "",
      guideSteps: [
        {
          num: 1,
          text: "Откройте депозит на проекте",
          imageUrl: "/assets/trc20-guide/step-1.png",
        },
        {
          num: 2,
          text: "Выберите Tether TRC-20",
          imageUrl: "/assets/trc20-guide/step-2.png",
        },
        {
          num: 3,
          text: "Скопируйте адрес",
          imageUrl: "/assets/trc20-guide/step-3.png",
        },
      ],
    };
  }

  return {
    kind: "generic",
    networkId: network.id,
    stepTitle: `${network.shortLabel} адрес`,
    fieldLabel: `${network.shortLabel} адрес`,
    placeholder: network.addressPrefix === "T" ? "T..." : "0x...",
    introText: `Отправьте ${network.shortLabel} адрес с проекта.`,
    networkWarningHtml: buildNetworkForfeitWarningHtml(network.id),
    guideSteps: [
      {
        num: 1,
        text: "Откройте депозит на проекте",
        imageUrl: "/assets/trc20-guide/rp_guide/rp_step1.jpg",
      },
      {
        num: 2,
        text: "Выберите криптовалюту Tether (USDT)",
        imageUrl: "/assets/trc20-guide/rp_guide/rp_step2.jpg",
      },
      {
        num: 3,
        text: `Выберите сеть ${network.selectLabel}`,
        imageUrl: `/assets/trc20-guide/rp_guide/${network.rpStep3Image}`,
      },
      {
        num: 4,
        text: "Скопируйте адрес кнопкой «Копировать»",
        imageUrl: "/assets/trc20-guide/rp_guide/rp_step4.jpg",
      },
    ],
  };
}

function buildWinnerDepositAddressRequestHtml(_draw, project, networkId, winnerDepositMinutes) {
  const network = getDepositNetworkMeta(networkId);
  const projectName = String(project?.name || "проекте").trim();
  return [
    "✅ Проверка пройдена!",
    "",
    `Отправьте <b>АКТУАЛЬНЫЙ</b> адрес депозита <b>${network.shortLabel}</b> (${network.label}) с проекта <b>${projectName}</b> одним сообщением.`,
    buildNetworkForfeitWarningHtml(networkId),
    "",
    `Пример: <code>${network.addressExample}</code>`,
    "",
    `У вас есть ${winnerDepositMinutes} минут — иначе приз сгорит.`,
  ].join("\n");
}

function buildBotGuideStepTexts(project, networkId, projectLinkHtml) {
  const network = getDepositNetworkMeta(networkId);
  const pokerdom = isPokerdomProject(project);

  if (pokerdom) {
    const step1 = projectLinkHtml
      ? `Шаг 1/3: откройте проект ${projectLinkHtml} и нажмите кнопку депозита.`
      : "Шаг 1/3: откройте проект и нажмите кнопку депозита.";
    return [
      step1,
      "Шаг 2/3: выберите криптовалюту и сеть Tether TRC-20.",
      "Шаг 3/3: скопируйте адрес кошелька кнопкой «Копировать».",
    ];
  }

  const step1 = projectLinkHtml
    ? `Шаг 1/4: откройте проект ${projectLinkHtml} и нажмите кнопку депозита.`
    : "Шаг 1/4: откройте проект и нажмите кнопку депозита.";
  return [
    step1,
    "Шаг 2/4: выберите криптовалюту Tether (USDT).",
    `Шаг 3/4: выберите сеть <b>${network.selectLabel}</b>.`,
    "Шаг 4/4: скопируйте адрес кнопкой «Копировать».",
  ];
}

function getBotGuideImagePaths(project, networkId) {
  const network = getDepositNetworkMeta(networkId);
  if (isPokerdomProject(project)) {
    return POKERDOM_GUIDE_IMAGES.filter((imagePath) => fs.existsSync(imagePath));
  }

  const candidates = [
    path.join(RP_GUIDE_DIR, "rp_step1.jpg"),
    path.join(RP_GUIDE_DIR, "rp_step2.jpg"),
    path.join(RP_GUIDE_DIR, network.rpStep3Image),
    path.join(RP_GUIDE_DIR, "rp_step4.jpg"),
  ];
  return candidates.filter((imagePath) => fs.existsSync(imagePath));
}

function buildBotGuideFooterNote(networkId, project) {
  const network = getDepositNetworkMeta(networkId);
  if (isPokerdomProject(project)) {
    return [
      "Важно:",
      "• принимается только TRC-20 адрес (обычно начинается с T);",
      "• отправьте адрес одним сообщением в этот чат.",
    ].join("\n");
  }

  return [
    "Важно:",
    `• принимается только ${network.shortLabel} адрес (${network.label});`,
    `• если отправите адрес в другой сети — приз сгорит;`,
    "• отправьте адрес одним сообщением в этот чат.",
  ].join("\n");
}

function buildBrandProjectId(templateSlug, ownerId) {
  return `brand_${templateSlug}_${ownerId}`;
}

function isBrandTemplateProject(project) {
  return Boolean(project?.isTemplate || project?.templateSlug);
}

module.exports = {
  DEPOSIT_NETWORKS,
  BRAND_PROJECT_TEMPLATES,
  normalizeDepositNetwork,
  pickRandomDepositNetwork,
  isPokerdomProject,
  isBrandTemplateProject,
  resolveDepositNetworkForProject,
  getDepositNetworkMeta,
  getInvalidAddressError,
  validateDepositAddress,
  buildNetworkForfeitWarningHtml,
  buildJoinWalletStepPayload,
  buildWinnerDepositAddressRequestHtml,
  buildBotGuideStepTexts,
  getBotGuideImagePaths,
  buildBotGuideFooterNote,
  buildBrandProjectId,
};
