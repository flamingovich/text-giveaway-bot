#!/usr/bin/env node
/**
 * Локальный демо-набор для панели: история розыгрышей + очередь выплат.
 * Usage: node scripts/seed-panel-demo.js
 */
require("dotenv").config();

const { DateTime } = require("luxon");
const {
  readData,
  writeData,
  readProjects,
  writeProjects,
  readUserProjectProfiles,
  writeUserProjectProfiles,
} = require("../src/storage");

const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";
const ownerId = Number(String(process.env.ADMIN_IDS || "").split(",")[0]) || 7946967720;
const otherOrganizerId = Number(String(process.env.SUPER_ADMIN_IDS || "").split(",")[0]) || 8233307353;
const DEMO_PREFIX = "demo_panel_";

const PROJECT_POKERDOM = `brand_pokerdom_${ownerId}`;
const PROJECT_BEEF = `brand_beef_${ownerId}`;
const PROJECT_BEEF_OTHER = `brand_beef_${otherOrganizerId}`;

const WINNERS = {
  pendingAlex: 910001001,
  pendingMaria: 910001002,
  paidIvan: 910001003,
  deniedOleg: 910001004,
  pendingKate: 910001005,
};

function isoDaysFromNow(days) {
  return DateTime.now().setZone(TIMEZONE).plus({ days }).toISO();
}

function isoDaysAgo(days) {
  return DateTime.now().setZone(TIMEZONE).minus({ days }).toISO();
}

function confirmedNotify(extra = {}) {
  const base = isoDaysAgo(2);
  return {
    status: "confirmed",
    sentAt: base,
    verifiedAt: base,
    channelSubscribed: true,
    channelCheckedAt: base,
    ...extra,
  };
}

const DEMO_PROJECT_LINKS = {
  pokerdom: { emoji: "🎰", refLink: "https://depman.vip/pokerdom" },
  beef: { emoji: "🔥", refLink: "https://depman.vip/beef" },
  fugu: { emoji: "💚", refLink: "https://depman.vip/fugu" },
  iris: { emoji: "🎯", refLink: "https://depman.vip/iris" },
};

function buildProjects() {
  const data = readProjects();
  let updated = 0;

  for (const project of data.projects || []) {
    if (Number(project.ownerId) !== ownerId) {
      continue;
    }
    const demo = DEMO_PROJECT_LINKS[project.templateSlug];
    if (!demo) {
      continue;
    }
    project.refLink = demo.refLink;
    project.emoji = demo.emoji;
    updated += 1;
  }

  writeProjects(data);
  return updated;
}

function buildProfiles() {
  const profiles = readUserProjectProfiles();
  if (!profiles.users) {
    profiles.users = {};
  }

  const entries = [
    [WINNERS.pendingAlex, { first_name: "Алексей", username: "demo_alex", trc20: "TXdemoAlex1234567890abcdef" }],
    [
      WINNERS.pendingMaria,
      {
        first_name: "Мария",
        username: "demo_maria",
        trc20: "TXdemoMaria1234567890abcdef",
        crossOrganizerRef: true,
      },
    ],
    [WINNERS.paidIvan, { first_name: "Иван", username: "demo_ivan", trc20: "TXdemoIvan1234567890abcdef" }],
    [WINNERS.deniedOleg, { first_name: "Олег", username: "demo_oleg", trc20: "TXdemoOleg1234567890abcdef" }],
    [WINNERS.pendingKate, { first_name: "Екатерина", username: "demo_kate", trc20: "TXdemoKate1234567890abcdef", nonRef: true }],
  ];

  profiles.users[String(otherOrganizerId)] = {
    meta: {
      first_name: "Тимур",
      last_name: "Организатор",
      username: "demo_org_other",
      user_id: otherOrganizerId,
    },
    projects: {},
  };

  for (const [userId, info] of entries) {
    const projects = {
      [PROJECT_POKERDOM]: {
        trc20Address: info.trc20,
        referralVerified: !info.nonRef && !info.crossOrganizerRef,
        selfReportedNonReferral: Boolean(info.nonRef),
      },
      [PROJECT_BEEF]: {
        trc20Address: info.trc20,
        referralVerified: !info.nonRef && !info.crossOrganizerRef,
        selfReportedNonReferral: Boolean(info.nonRef),
      },
    };

    if (info.crossOrganizerRef) {
      projects[PROJECT_BEEF_OTHER] = {
        trc20Address: info.trc20,
        referralVerified: true,
        referralOwnerId: otherOrganizerId,
      };
    }

    profiles.users[String(userId)] = {
      meta: {
        first_name: info.first_name,
        last_name: "Демо",
        username: info.username,
        user_id: userId,
      },
      projects: {
        ...projects,
      },
    };
  }

  writeUserProjectProfiles(profiles);
}

function buildDraws() {
  const data = readData();
  const kept = (data.draws || []).filter((draw) => !String(draw.id).startsWith(DEMO_PREFIX));
  const channelId = "-1009876543210";

  const demoDraws = [
    {
      id: `${DEMO_PREFIX}finished_pending_50k`,
      status: "finished",
      projectId: PROJECT_POKERDOM,
      channelId,
      postTitle: "Демо: один к выплате",
      prizeType: "money_rub",
      prize: "50 000 ₽",
      prizeAmountRub: 50000,
      prizeAmountUsd: null,
      imagePath: "",
      publishAt: isoDaysAgo(10),
      endAt: isoDaysAgo(9),
      winnersCount: 1,
      ownerId,
      createdBy: ownerId,
      createdAt: isoDaysAgo(11),
      finishedAt: isoDaysAgo(9),
      messageId: 1001,
      messageType: "text",
      participantIds: [WINNERS.pendingAlex, 910009001, 910009002],
      winnerIds: [WINNERS.pendingAlex],
      winnerNotifications: {
        [WINNERS.pendingAlex]: confirmedNotify(),
      },
      winnerConfirmValue: 30,
      winnerConfirmUnit: "minutes",
      askWalletOnJoin: true,
      askProjectIdOnJoin: false,
      showProjectInPost: true,
      publishTarget: "channel",
    },
    {
      id: `${DEMO_PREFIX}finished_pending_100k`,
      status: "finished",
      projectId: PROJECT_BEEF,
      channelId,
      postTitle: "Демо: двое в очереди",
      prizeType: "money_rub",
      prize: "100 000 ₽",
      prizeAmountRub: 100000,
      prizeAmountUsd: null,
      imagePath: "",
      publishAt: isoDaysAgo(7),
      endAt: isoDaysAgo(6),
      winnersCount: 2,
      ownerId,
      createdBy: ownerId,
      createdAt: isoDaysAgo(8),
      finishedAt: isoDaysAgo(6),
      messageId: 1002,
      messageType: "text",
      participantIds: [WINNERS.pendingMaria, WINNERS.pendingKate, 910009003, 910009004],
      winnerIds: [WINNERS.pendingMaria, WINNERS.pendingKate],
      winnerNotifications: {
        [WINNERS.pendingMaria]: confirmedNotify(),
        [WINNERS.pendingKate]: confirmedNotify(),
      },
      winnerConfirmValue: 30,
      winnerConfirmUnit: "minutes",
      askWalletOnJoin: true,
      askProjectIdOnJoin: false,
      showProjectInPost: true,
      publishTarget: "channel",
    },
    {
      id: `${DEMO_PREFIX}finished_paid_30k`,
      status: "finished",
      projectId: PROJECT_POKERDOM,
      channelId,
      postTitle: "Демо: уже выплачен",
      prizeType: "money_rub",
      prize: "30 000 ₽",
      prizeAmountRub: 30000,
      prizeAmountUsd: null,
      imagePath: "",
      publishAt: isoDaysAgo(20),
      endAt: isoDaysAgo(19),
      winnersCount: 1,
      ownerId,
      createdBy: ownerId,
      createdAt: isoDaysAgo(21),
      finishedAt: isoDaysAgo(19),
      messageId: 1003,
      messageType: "text",
      participantIds: [WINNERS.paidIvan, 910009005],
      winnerIds: [WINNERS.paidIvan],
      winnerNotifications: {
        [WINNERS.paidIvan]: confirmedNotify({
          paidAt: isoDaysAgo(18),
          paidBy: ownerId,
        }),
      },
      winnerConfirmValue: 30,
      winnerConfirmUnit: "minutes",
      askWalletOnJoin: true,
      askProjectIdOnJoin: false,
      showProjectInPost: true,
      publishTarget: "channel",
    },
    {
      id: `${DEMO_PREFIX}finished_denied_20k`,
      status: "finished",
      projectId: PROJECT_POKERDOM,
      channelId,
      postTitle: "Демо: отказ в выплате",
      prizeType: "money_rub",
      prize: "20 000 ₽",
      prizeAmountRub: 20000,
      prizeAmountUsd: null,
      imagePath: "",
      publishAt: isoDaysAgo(15),
      endAt: isoDaysAgo(14),
      winnersCount: 1,
      ownerId,
      createdBy: ownerId,
      createdAt: isoDaysAgo(16),
      finishedAt: isoDaysAgo(14),
      messageId: 1004,
      messageType: "text",
      participantIds: [WINNERS.deniedOleg, 910009006],
      winnerIds: [WINNERS.deniedOleg],
      winnerNotifications: {
        [WINNERS.deniedOleg]: confirmedNotify({
          paymentDeniedAt: isoDaysAgo(13),
          paymentDeniedBy: ownerId,
        }),
      },
      winnerConfirmValue: 30,
      winnerConfirmUnit: "minutes",
      askWalletOnJoin: true,
      askProjectIdOnJoin: false,
      showProjectInPost: true,
      publishTarget: "channel",
    },
    {
      id: `${DEMO_PREFIX}active_75k`,
      status: "active",
      projectId: PROJECT_BEEF,
      channelId,
      postTitle: "Демо: активный розыгрыш",
      prizeType: "money_rub",
      prize: "75 000 ₽",
      prizeAmountRub: 75000,
      prizeAmountUsd: null,
      imagePath: "",
      publishAt: isoDaysAgo(1),
      endAt: isoDaysFromNow(2),
      winnersCount: 1,
      ownerId,
      createdBy: ownerId,
      createdAt: isoDaysAgo(2),
      messageId: 1005,
      messageType: "text",
      participantIds: [910009007, 910009008, 910009009],
      winnerIds: [],
      winnerNotifications: {},
      winnerConfirmValue: 30,
      winnerConfirmUnit: "minutes",
      askWalletOnJoin: true,
      askProjectIdOnJoin: false,
      showProjectInPost: true,
      publishTarget: "channel",
    },
    {
      id: `${DEMO_PREFIX}scheduled_40k`,
      status: "scheduled",
      projectId: PROJECT_POKERDOM,
      channelId,
      postTitle: "Демо: запланированный",
      prizeType: "money_rub",
      prize: "40 000 ₽",
      prizeAmountRub: 40000,
      prizeAmountUsd: null,
      imagePath: "",
      publishAt: isoDaysFromNow(1),
      endAt: isoDaysFromNow(4),
      winnersCount: 1,
      ownerId,
      createdBy: ownerId,
      createdAt: isoDaysAgo(1),
      messageId: null,
      messageType: "text",
      participantIds: [],
      winnerIds: [],
      winnerNotifications: {},
      winnerConfirmValue: 30,
      winnerConfirmUnit: "minutes",
      askWalletOnJoin: true,
      askProjectIdOnJoin: false,
      showProjectInPost: true,
      publishTarget: "channel",
    },
  ];

  data.draws = [...demoDraws, ...kept];
  writeData(data);

  return {
    totalDemo: demoDraws.length,
    pendingPayouts: 3,
    ownerId,
  };
}

function main() {
  buildProfiles();
  const projectsUpdated = buildProjects();
  const result = buildDraws();
  console.log(`[seed-panel-demo] ownerId=${result.ownerId}`);
  console.log(`[seed-panel-demo] добавлено розыгрышей: ${result.totalDemo}`);
  console.log(`[seed-panel-demo] в очереди выплат: ${result.pendingPayouts} победителя`);
  console.log(`[seed-panel-demo] проектов с реф-ссылками: ${projectsUpdated}`);
  console.log("[seed-panel-demo] откройте http://localhost:30009/panel");
}

main();
