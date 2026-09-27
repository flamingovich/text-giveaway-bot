#!/usr/bin/env node
// A made-up but lifelike base for designing the admin pages: about nine hundred
// people, five months of draws, payouts in every state, support chats and join
// funnel rows. Nobody in it is real - names, ids and wallets are invented, and
// no one has an avatar, so the admin never asks Telegram about them.
//
//   GIVEAWAY_DATA_DIR=data-design node scripts/seed-admin-design.js
//
// It refuses to run without GIVEAWAY_DATA_DIR, never writes into data/, and
// starts that folder's base from scratch every time. The same seed gives the
// same base, so screenshots stay comparable between runs.

const fs = require("fs");
const path = require("path");

const target = String(process.env.GIVEAWAY_DATA_DIR || "").trim();
if (!target) {
  console.error("Задайте GIVEAWAY_DATA_DIR, например: GIVEAWAY_DATA_DIR=data-design node scripts/seed-admin-design.js");
  process.exit(1);
}
const dataDir = path.resolve(target);
if (dataDir === path.resolve(__dirname, "..", "data") || dataDir.startsWith("/opt/")) {
  console.error(`Отказ: ${dataDir} — не папка для выдуманных данных.`);
  process.exit(1);
}
fs.mkdirSync(dataDir, { recursive: true });
for (const name of ["giveaway.db", "giveaway.db-wal", "giveaway.db-shm"]) {
  fs.rmSync(path.join(dataDir, name), { force: true });
}

const { DateTime } = require("luxon");
const { writeDocument, getSqliteDb, STORE_KEYS } = require("../src/storage");
const { createJoinFunnelStore, stagesToMask } = require("../src/join-funnel");
const { findBrandHomes, brandHomeKey, buildCrossOrganizerNonReferralPatch } = require("../src/project-profile-bridge");

const TZ = "Europe/Moscow";
const NOW = DateTime.now().setZone(TZ);
const DAYS = 150;

// ---- deterministic randomness ------------------------------------------

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260926);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
function weighted(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
function sample(list, count) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}
const hex = (length) => Array.from({ length }, () => "0123456789abcdef"[between(0, 15)]).join("");
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const tronWallet = () => `T${Array.from({ length: 33 }, () => BASE58[between(0, BASE58.length - 1)]).join("")}`;
const iso = (dt) => dt.toUTC().toISO();

// ---- people ---------------------------------------------------------------

const MALE = ["Алексей", "Дмитрий", "Максим", "Иван", "Артём", "Никита", "Егор", "Кирилл", "Михаил", "Андрей", "Роман", "Сергей", "Тимофей", "Данил", "Владислав", "Илья", "Павел", "Глеб", "Руслан", "Олег", "Вадим", "Денис", "Марат", "Арсений"];
const FEMALE = ["Анна", "Мария", "Екатерина", "Дарья", "Полина", "Алина", "Виктория", "Софья", "Ксения", "Юлия", "Вероника", "Елена", "Кристина", "Ольга", "Анастасия", "Милана"];
const LAST = ["Иванов", "Смирнов", "Кузнецов", "Попов", "Соколов", "Лебедев", "Козлов", "Новиков", "Морозов", "Волков", "Зайцев", "Павлов", "Семёнов", "Голубев", "Виноградов", "Богданов", "Воробьёв", "Фёдоров", "Михайлов", "Беляев", "Тарасов", "Белов", "Комаров", "Орлов"];
const HANDLE_PARTS = ["lucky", "dep", "bet", "win", "rich", "max", "kot", "wolf", "neo", "ace", "spin", "gold", "flash", "moon", "zero", "king"];

function makePerson(index) {
  const female = chance(0.28);
  const first = female ? pick(FEMALE) : pick(MALE);
  const lastBase = pick(LAST);
  const last = chance(0.55) ? (female ? `${lastBase}а` : lastBase) : "";
  const username = chance(0.72) ? `${pick(HANDLE_PARTS)}_${pick(HANDLE_PARTS)}${between(1, 999)}` : "";
  // More people arrived lately: the curve bends toward today.
  const daysAgo = Math.floor(DAYS * Math.pow(rand(), 1.7));
  const seenAt = NOW.minus({ days: daysAgo, minutes: between(0, 1440) });
  return {
    id: String(6100000000 + index * 7 + between(0, 6)),
    meta: {
      first_name: first,
      ...(last ? { last_name: last } : {}),
      ...(username ? { username } : {}),
      firstSeenAt: iso(seenAt),
      updatedAt: iso(seenAt.plus({ days: between(0, Math.max(0, daysAgo)) })),
    },
    seenAt,
    wallet: tronWallet(),
  };
}

const people = Array.from({ length: 900 }, (_, index) => makePerson(index));

const ORGANIZERS = [
  { id: "7100000001", meta: { first_name: "Тимур", username: "timur_demo" }, weight: 5 },
  { id: "7100000002", meta: { first_name: "Депман", username: "depman_demo" }, weight: 3 },
  { id: "7100000003", meta: { first_name: "Ника", last_name: "Орлова", username: "nika_draws" }, weight: 2 },
];
const CHANNELS = {
  7100000001: { id: "-1001000000001", title: "Тимур | Розыгрыши" },
  7100000002: { id: "-1001000000002", title: "Депман VIP" },
  7100000003: { id: "-1001000000003", title: "Ника — бонусы" },
};
const BRANDS = [
  { slug: "pokerdom", name: "Pokerdom", weight: 4 },
  { slug: "beef", name: "BEEF", weight: 3 },
  { slug: "fugu", name: "FUGU", weight: 2 },
  { slug: "iris", name: "IRIS", weight: 1 },
  { slug: "luckybear", name: "LuckyBear", weight: 1 },
];

const projects = [];
for (const organizer of ORGANIZERS) {
  for (const brand of BRANDS) {
    projects.push({
      id: `brand_${brand.slug}_${organizer.id}`,
      name: brand.name,
      templateSlug: brand.slug,
      isTemplate: true,
      ownerId: Number(organizer.id),
      refLink: `https://example.com/${brand.slug}`,
      createdAt: iso(NOW.minus({ days: DAYS + 5 })),
    });
  }
}

function accountIdFor(slug, joinedAt) {
  if (slug === "pokerdom") {
    const created = joinedAt.minus({ days: chance(0.45) ? 0 : between(1, 700) });
    return Math.floor(created.toSeconds()).toString(16).padStart(8, "0") + hex(16);
  }
  if (slug === "luckybear") {
    return String(between(1600000000, 1799999999));
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  return `#${Array.from({ length: 5 }, () => alphabet[between(0, alphabet.length - 1)]).join("")}`;
}

// ---- draws ----------------------------------------------------------------

const RUB_PRIZES = [1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000];
const USD_PRIZES = [20, 30, 50, 100, 150, 200, 300];
const formatRub = (value) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}₽`;

const profiles = { users: {} };
function profileNode(person) {
  if (!profiles.users[person.id]) {
    profiles.users[person.id] = { meta: { ...person.meta }, projects: {} };
  }
  return profiles.users[person.id];
}
for (const organizer of ORGANIZERS) {
  profiles.users[organizer.id] = { meta: { ...organizer.meta, updatedAt: iso(NOW) }, projects: {} };
}

// A handful of wallets shared between accounts: the multi-account flags need
// something to find.
const sharedWallets = Array.from({ length: 6 }, () => tronWallet());

const active = [];
const archive = [];
const generated = [];
const drawCount = 74;
for (let index = 0; index < drawCount; index += 1) {
  const organizer = weighted(ORGANIZERS.map((item) => [item, item.weight]));
  const brand = weighted(BRANDS.map((item) => [item, item.weight]));
  const projectId = `brand_${brand.slug}_${organizer.id}`;
  // Draws come more often lately too; a few are still running or yet to start.
  const startDaysAgo = index < 4 ? between(0, 1) : Math.floor((DAYS - 2) * Math.pow(rand(), 1.3)) + 2;
  const publishAt = NOW.minus({ days: startDaysAgo, hours: between(0, 20) });
  const endAt = publishAt.plus({ hours: weighted([[24, 3], [48, 3], [72, 2], [12, 1]]) });
  const scheduled = index >= 4 && index < 6;
  const status = scheduled ? "scheduled" : endAt > NOW ? "active" : "finished";
  const usd = chance(0.3);
  const amount = usd ? pick(USD_PRIZES) : pick(RUB_PRIZES);
  const winnersCount = weighted([[1, 5], [2, 3], [3, 3], [5, 1]]);

  const eligible = people.filter((person) => person.seenAt <= endAt);
  const growth = 0.55 + 0.9 * (1 - startDaysAgo / DAYS);
  const size = scheduled ? 0 : Math.round(between(35, 360) * growth);
  const joined = sample(eligible, size);

  const draw = {
    id: `draw_design_${String(index + 1).padStart(3, "0")}`,
    ownerId: Number(organizer.id),
    createdBy: Number(organizer.id),
    projectId,
    channelId: CHANNELS[organizer.id].id,
    messageId: 1000 + index,
    prize: usd ? `${amount}$` : formatRub(amount),
    prizeType: usd ? "money_usd" : "money_rub",
    ...(usd ? { prizeAmountUsd: amount } : { prizeAmountRub: amount }),
    winnersCount,
    askProjectIdOnJoin: brand.slug === "pokerdom" || brand.slug === "luckybear" || chance(0.4),
    askWalletOnJoin: chance(0.85),
    status,
    createdAt: iso(publishAt.minus({ hours: between(1, 30) })),
    publishAt: iso(scheduled ? NOW.plus({ days: between(1, 3) }) : publishAt),
    endAt: iso(scheduled ? NOW.plus({ days: between(4, 6) }) : endAt),
    participantIds: [],
    participantMeta: {},
    drawReferrals: {},
    winnerIds: [],
    winnerNotifications: {},
  };

  // A few addresses behind which several accounts sit.
  const clusterHashes = Array.from({ length: between(0, 2) }, () => hex(20));
  for (const person of joined) {
    const joinedAt = DateTime.fromMillis(
      publishAt.toMillis() + rand() * Math.max(1, Math.min(endAt.toMillis(), NOW.toMillis()) - publishAt.toMillis()),
    ).setZone(TZ);
    draw.participantIds.push(Number(person.id));
    draw.participantMeta[person.id] = {
      updatedAt: iso(joinedAt),
      ipHash: clusterHashes.length && chance(0.02) ? pick(clusterHashes) : hex(20),
    };

    const node = profileNode(person);
    const existing = node.projects[projectId];
    if (!existing) {
      const ref = chance(0.78);
      node.projects[projectId] = {
        trc20Address: chance(0.04) ? pick(sharedWallets) : chance(0.85) ? person.wallet : tronWallet(),
        referralVerified: ref,
        selfReportedNonReferral: !ref,
        ...(ref ? { referralOwnerId: Number(organizer.id) } : { nonReferralMarkedAt: iso(joinedAt) }),
        ...(draw.askProjectIdOnJoin
          ? { projectAccountId: accountIdFor(brand.slug, joinedAt), projectIdStepCompletedAt: iso(joinedAt) }
          : {}),
        firstTouchOwnerId: Number(organizer.id),
        firstTouchAt: iso(joinedAt),
        firstTouchSource: "join",
        updatedAt: iso(joinedAt),
      };
    } else {
      existing.updatedAt = iso(joinedAt);
    }
  }

  // Invitations: a few people bring friends who are also in the draw.
  const inviters = sample(draw.participantIds, Math.round(draw.participantIds.length * 0.07));
  const invitable = new Set(draw.participantIds);
  for (const inviter of inviters) {
    invitable.delete(inviter);
    const invited = sample([...invitable], weighted([[1, 5], [2, 3], [3, 2], [5, 1], [9, 1]]));
    invited.forEach((id) => invitable.delete(id));
    if (invited.length) {
      draw.drawReferrals[String(inviter)] = invited.map(String);
    }
  }

  generated.push({ draw, amount, usd, winnersCount, endAt, projectId });
}


// The brand's first organiser keeps the person; with every other organiser of
// that brand they are not a referral - the join flow's rule (findBrandHomes).
const homes = findBrandHomes(generated.map((item) => item.draw), projects);
for (const [userId, node] of Object.entries(profiles.users)) {
  for (const [projectId, data] of Object.entries(node.projects || {})) {
    const project = projects.find((item) => item.id === projectId);
    const home = project ? homes.get(brandHomeKey(userId, project.name)) : null;
    if (home && Number(home.ownerId) !== Number(project.ownerId)) {
      Object.assign(data, buildCrossOrganizerNonReferralPatch({ brandHomeOwnerId: home.ownerId }, new Date(data.updatedAt)));
    }
  }
}

for (const { draw, amount, usd, winnersCount, endAt, projectId } of generated) {
  if (draw.status === "finished") {
    draw.finishedAt = draw.endAt;
    const ageDays = NOW.diff(endAt, "days").days;
    for (const winnerId of sample(draw.participantIds, winnersCount)) {
      const key = String(winnerId);
      const sentAt = endAt.plus({ minutes: between(1, 4) });
      const perWinner = Math.floor(amount / winnersCount);
      const halved = profiles.users[key]?.projects?.[projectId]?.selfReportedNonReferral;
      const payout = halved ? Math.floor(perWinner / 2) : perWinner;
      const payoutPrize = usd ? `${payout}$` : formatRub(payout);
      const wallet = profiles.users[key]?.projects?.[projectId]?.trc20Address || tronWallet();
      const fresh = ageDays < 4;
      const kind = weighted([
        ["paid", fresh ? 3 : 62],
        ["confirmed", fresh ? 5 : 1],
        ["awaiting_address", fresh ? 2 : 0],
        ["pending", ageDays < 0.4 ? 3 : 0],
        ["expired", 16],
        ["forfeited", 9],
        ["fraud", 5],
        ["denied", 1],
      ]);
      const base = { sentAt: iso(sentAt), payoutPrize, channelSubscribed: kind !== "forfeited" };
      const verified = { ...base, verifiedAt: iso(sentAt.plus({ minutes: between(1, 25) })), trc20Address: wallet };
      const notify = {
        paid: { ...verified, status: "confirmed", paidAt: iso(sentAt.plus({ hours: between(2, 40) })) },
        confirmed: { ...verified, status: "confirmed" },
        awaiting_address: { ...base, status: "awaiting_address", verifiedAt: iso(sentAt.plus({ minutes: 5 })) },
        pending: { ...base, status: "pending", expiresAt: iso(sentAt.plus({ minutes: 30 })) },
        expired: { ...base, status: "expired", expiresAt: iso(sentAt.plus({ minutes: 30 })) },
        forfeited: { ...base, status: "forfeited", forfeitureReason: pick(["not_subscribed", "address_timeout"]) },
        fraud: { ...base, status: "forfeited", antiFraudFlag: true, forfeitureReason: "anti_fraud" },
        denied: { ...verified, status: "confirmed", paymentDeniedAt: iso(sentAt.plus({ hours: 3 })) },
      }[kind];
      draw.winnerIds.push(winnerId);
      draw.winnerNotifications[key] = notify;
    }
    if (ageDays > 14) {
      archive.push(draw);
      continue;
    }
  }
  active.push(draw);
}

// ---- support ----------------------------------------------------------------

const QUESTIONS = [
  ["Когда придёт выплата? Я выиграл вчера", "Выплаты приходят в течение суток после подтверждения. Проверьте, что адрес кошелька указан верно."],
  ["Где найти свой ID на Pokerdom?", "Откройте профиль на Pokerdom — ID под аватаркой, 24 символа. Скопируйте его целиком."],
  ["Бот пишет что я не подписан, но я подписан", "Проверил — подписка на месте. Нажмите «Я подписался» ещё раз, пожалуйста."],
  ["Почему приз уменьшился в два раза?", "Если аккаунт на проекте зарегистрирован не по нашей ссылке, приз выплачивается наполовину."],
  ["Можно поменять кошелёк?", "Да, пришлите новый адрес TRC-20, я передам организатору."],
  ["Не открывается мини-апп", "Обновите Telegram до последней версии и откройте пост заново."],
];

function supportChat(person, index, { store }) {
  const [question, answer] = QUESTIONS[index % QUESTIONS.length];
  const startedAt = NOW.minus({ days: Math.floor(40 * Math.pow(rand(), 1.4)), minutes: between(0, 1400) });
  const messages = [
    { at: iso(startedAt), role: "user", content: question, kind: "message" },
    { at: iso(startedAt.plus({ minutes: 1 })), role: "assistant", content: answer, kind: "message" },
  ];
  let cursor = startedAt.plus({ minutes: 2 });
  const turns = weighted([[0, 3], [1, 3], [2, 2], [5, 1]]);
  for (let turn = 0; turn < turns; turn += 1) {
    cursor = cursor.plus({ minutes: between(1, 90) });
    messages.push({ at: iso(cursor), role: "user", content: pick(["Спасибо", "А сколько ждать?", "Понял", "Всё равно не работает", "Скинул адрес"]), kind: "message" });
    cursor = cursor.plus({ minutes: 1 });
    const failure = chance(0.08);
    messages.push({
      at: iso(cursor),
      role: "assistant",
      content: failure ? "Не удалось получить ответ модели" : pick(["Пожалуйста!", "Обычно до суток.", "Передал оператору.", "Уже смотрю."]),
      kind: failure ? "error" : "message",
    });
  }
  const escalated = chance(0.18);
  if (escalated) {
    cursor = cursor.plus({ minutes: 2 });
    messages.push({ at: iso(cursor), role: "assistant", content: "Позвал живого оператора, он ответит здесь.", kind: "escalation" });
  }
  if (store === "main" && chance(0.25)) {
    cursor = cursor.plus({ minutes: between(5, 200) });
    messages.push({ at: iso(cursor), role: "assistant", content: "Выплату отправили, проверьте кошелёк.", kind: "admin" });
  }
  const awaiting = chance(0.12);
  if (awaiting) {
    cursor = cursor.plus({ minutes: between(1, 30) });
    messages.push({ at: iso(cursor), role: "user", content: "Ау, есть кто?", kind: "message" });
  }
  return {
    agentName: "Оператор",
    history: [],
    messages,
    lastMessageAt: messages[messages.length - 1].at,
    user: {
      id: Number(person.id),
      username: person.meta.username || "",
      firstName: person.meta.first_name || "",
      lastName: person.meta.last_name || "",
    },
    escalated,
    greeted: true,
    hasUserMessage: true,
    sessionClosed: !awaiting && chance(0.4),
    pendingTexts: [],
  };
}

const mainChats = {};
sample(people, 38).forEach((person, index) => {
  mainChats[person.id] = supportChat(person, index, { store: "main" });
});
const depmanChats = {};
sample(people, 9).forEach((person, index) => {
  depmanChats[person.id] = supportChat(person, index + 3, { store: "depman" });
});

// ---- write --------------------------------------------------------------------

writeDocument(STORE_KEYS.PROJECTS, { projects });
writeDocument(STORE_KEYS.DRAWS, { draws: active });
writeDocument(STORE_KEYS.DRAWS_ARCHIVE, { draws: archive });
writeDocument(STORE_KEYS.USER_PROJECT_PROFILES, profiles);
writeDocument(STORE_KEYS.KNOWN_CHANNELS, {
  channels: Object.values(CHANNELS).map((channel) => ({ id: channel.id, title: channel.title })),
});
writeDocument(STORE_KEYS.DELEGATED_ADMINS, {
  admins: ORGANIZERS.slice(1).map((organizer) => ({ userId: Number(organizer.id), username: organizer.meta.username })),
});
writeDocument(STORE_KEYS.SUPPORT_CHATS, mainChats);
writeDocument(STORE_KEYS.DEPMAN_SUPPORT_CHATS, depmanChats);

// The funnel: everyone who got into a recent draw, plus the people who gave up
// on the way, at the step where they stopped.
const db = getSqliteDb();
createJoinFunnelStore(db);
const insert = db.prepare(
  "INSERT OR REPLACE INTO join_funnel (draw_id, user_id, stages, first_at, last_at) VALUES (?, ?, ?, ?, ?)",
);
const since = NOW.minus({ days: 30 });
let funnelRows = 0;
db.transaction(() => {
  for (const draw of [...active, ...archive]) {
    if (!draw.participantIds.length || DateTime.fromISO(draw.publishAt) < since) continue;
    const steps = ["captcha", "channel", ...(draw.projectId ? ["registration"] : []), ...(draw.askWalletOnJoin ? ["trc20"] : [])];
    for (const id of draw.participantIds) {
      const at = DateTime.fromISO(draw.participantMeta[String(id)].updatedAt).toMillis();
      const stages = chance(0.22) ? ["opened", "joined"] : ["opened", ...steps, "joined"];
      insert.run(draw.id, String(id), stagesToMask(stages), at, at);
      funnelRows += 1;
    }
    const dropouts = Math.round(draw.participantIds.length * (0.3 + rand() * 0.35));
    for (let i = 0; i < dropouts; i += 1) {
      const at = DateTime.fromISO(draw.publishAt).toMillis() + between(0, 36) * 3600000;
      const stop = weighted([["notify", 2], ["captcha", 3], ["channel", 6], ["registration", 4], ["trc20", 3]]);
      const reached = stop === "notify" ? ["opened", "notify"] : ["opened", ...steps.slice(0, steps.indexOf(stop) + 1)];
      insert.run(draw.id, `99${String(i).padStart(6, "0")}${draw.id.slice(-3)}`, stagesToMask(reached), at, at);
      funnelRows += 1;
    }
  }
})();

// A live scheduler as far as the system page can tell.
fs.writeFileSync(
  path.join(dataDir, ".scheduler-heartbeat"),
  JSON.stringify({
    at: new Date().toISOString(),
    tick: 4312,
    calls: { total: 18840, perMinute: 3.2, top: ["getChatMember:9120", "editMessageReplyMarkup:4210", "sendMessage:2380"] },
  }),
);

const participations = [...active, ...archive].reduce((sum, draw) => sum + draw.participantIds.length, 0);
console.log(
  `Готово: ${dataDir}\n  людей ${people.length}, розыгрышей ${active.length + archive.length} (в архиве ${archive.length}), ` +
    `участий ${participations}, диалогов ${Object.keys(mainChats).length + Object.keys(depmanChats).length}, строк воронки ${funnelRows}`,
);
