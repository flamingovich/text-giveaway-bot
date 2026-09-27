const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("./admin-pages");
const SYS = require("./admin-system");

// A page that throws while rendering passes every unit test around it and
// still shows a blank screen; only rendering it catches that.

const TZ = "Europe/Moscow";
const IDENTITY = { userId: "7", title: "Алексей", handle: "@alex", initials: "А", avatarUrl: "" };

function clean(html) {
  assert.ok(!html.includes("undefined"), "undefined на странице");
  assert.ok(!html.includes("NaN"), "NaN на странице");
}

test("the sign-in page has its form, and shows an error as text", () => {
  const html = P.renderLoginPage("<b>ошибка</b>");
  assert.match(html, /action="\/admin\/login"/);
  assert.match(html, /name="password"/);
  assert.ok(!html.includes("<b>ошибка</b>"));
  clean(html);
});

test("not found renders with a way back", () => {
  const html = P.renderAdminNotFound("Пользователь не найден.");
  assert.match(html, /Пользователь не найден/);
  assert.match(html, /href="\/admin\/users"/);
  clean(html);
});

test("the users page renders rows, filters and paging", () => {
  const html = P.renderUsersPage(
    {},
    {
      rows: [
        {
          userId: "7",
          identity: IDENTITY,
          projects: [{ projectId: "p", projectName: "BEEF", refStatus: "ref", referralOwnerLabel: "Тимур" }],
          hasFraud: true,
          fraudDetails: [{ kind: "ip", label: "Бот по IP", drawTitle: "<i>100$</i>" }],
          hasWallet: false,
          participations: 3,
          wins: 1,
          winningsText: "100$",
          payoutsText: "100$",
        },
      ],
      page: 1,
      totalPages: 2,
      totalFiltered: 150,
      filters: { brand: "", refOwnerId: "", ref: "", activity: "", q: "<x>", sort: "wins", dir: "desc" },
      brands: [{ key: "beef", label: "BEEF" }],
      refOwners: [{ id: "1", label: "Тимур" }],
      stats: { usersTotal: 150, bindingsTotal: 180, refsTotal: 120, nonRefsTotal: 30 },
      pageSize: 100,
    },
  );
  assert.match(html, /Бот по IP/);
  assert.match(html, /без кошелька/);
  assert.match(html, /data-href="\/admin\/users\/7"/);
  assert.ok(!html.includes("<i>100$</i>"), "название розыгрыша в подсказке экранировано");
  assert.ok(!html.includes('value="<x>"'));
  clean(html);
});

test("a person's page renders with and without a history", () => {
  const helpers = { money: () => "—", nameOf: (id) => `@org${id}` };
  const full = P.renderUserCardPage({ timezone: TZ }, {
    userId: "7",
    known: true,
    meta: { first_name: "Алексей", username: "alex" },
    totals: { participations: 2, wins: 1, winningsRub: 0, winningsUsd: 0, paidRub: 0, paidUsd: 0, awaitingPayout: 1 },
    projects: [{ projectId: "p", projectName: "Pokerdom", ownerId: 1, refStatus: "ref", accountId: "abc", firstTouchOwnerId: 1 }],
    draws: [
      { id: "d1", prize: "100$", projectName: "Pokerdom", at: "2026-09-20T10:00:00Z", outcome: { label: "Выплачено", tone: "ok", paidAt: "2026-09-21T10:00:00Z" } },
      { id: "d2", prize: "50$", projectName: "BEEF", at: "2026-09-10T10:00:00Z", outcome: null },
    ],
    wallets: [{ address: "TXYZ", source: "профиль" }],
    fraud: [{ label: "Мультиаккаунт", drawTitle: "100$", linkedUserIds: ["8"] }],
    supportChats: [{ chatId: "7", botLabel: "Основной", sessionClosed: false, messageCount: 3, lastMessageAt: "2026-09-20T10:00:00Z", preview: "Привет" }],
  }, helpers);
  assert.match(full, /Выплачено/);
  assert.match(full, /data-copy="TXYZ"/);
  assert.match(full, /href="\/admin\/users\/8"/);
  clean(full);

  const empty = P.renderUserCardPage({ timezone: TZ }, {
    userId: "9", known: false, meta: {},
    totals: { participations: 0, wins: 0, winningsRub: 0, winningsUsd: 0, paidRub: 0, paidUsd: 0, awaitingPayout: 0 },
    projects: [], draws: [], wallets: [], fraud: [], supportChats: [],
  }, helpers);
  assert.match(empty, /нет профиля/);
  clean(empty);
});

test("the system page renders a quiet scheduler and an empty log", () => {
  const html = P.renderSystemPage({
    generatedAt: "2026-09-26T12:00:00.000Z",
    timezone: TZ,
    scheduler: { alive: false, ageMs: 200000, tick: 5 },
    watchdog: { installed: false, healthy: false, checkedAgeMs: null },
    process: { uptimeMs: 5000, memoryMb: 90, node: "v20", buildId: "—", botUsername: "—", pid: 1 },
    telegramCalls: null,
    draws: { active: 0, overdue: [], finishedWithoutNotify: 0 },
    storage: { dbSize: 1024, docs: [] },
    backups: { count: 0, ageMs: null, newest: "" },
    logs: { errors: SYS.summariseLog(""), support: SYS.summariseLog("") },
  });
  assert.match(html, /молчит/);
  assert.match(html, /Скопировать/);
  clean(html);
});

test("support renders the list, a thread and its reply form", () => {
  const view = {
    rows: [{ chatId: "7", name: "Алексей", lastMessageAt: "2026-09-20T10:00:00Z", preview: "<b>Где выплата?</b>", messageCount: 2, flags: [{ label: "Без ответа", tone: "danger" }] }],
    summary: { attention: 1, open: 1, total: 1 },
    page: 1, totalPages: 1, totalFiltered: 1, query: "", metaById: {},
  };
  const list = P.renderSupportListPage({ ...view }, TZ);
  assert.match(list, /Выберите диалог/);
  assert.ok(!list.includes("<b>Где выплата?</b>"));
  clean(list);

  const state = {
    user: { firstName: "Алексей" },
    messages: [
      { at: "2026-09-20T10:00:00Z", role: "user", content: "Где выплата?", kind: "message" },
      { at: "2026-09-20T10:01:00Z", role: "assistant", content: "Уже отправили", kind: "admin" },
    ],
  };
  const chat = P.renderSupportChatPage({ ...view }, "7", state, TZ, { storeLabel: "Основной", canReply: true, meta: {} });
  assert.match(chat, /action="\/admin\/support\/7\/reply"/);
  assert.match(chat, /formaction="\/admin\/support\/7\/close"/);
  assert.match(chat, /b-admin/);
  clean(chat);

  const readOnly = P.renderSupportChatPage({ ...view }, "7", state, TZ, { canReply: false, meta: {} });
  assert.ok(!readOnly.includes("/reply"), "у второго бота нельзя отвечать");
});

test("the dashboard renders its tabs, charts and organisers", () => {
  const labels = ["2026-09-24", "2026-09-25", "2026-09-26"];
  const html = P.renderDashboardPage(
    {},
    {
      period: { id: "30", label: "30 дней", days: 30 },
      periods: [{ id: "7", label: "7 дней" }, { id: "30", label: "30 дней" }],
      totals: { users: 10, participants: 8, draws: 3, winners: 2, wins: 3, withWallet: 6, active: 1, finished: 2 },
      deltas: { users: { current: 4, percent: 33, direction: "up" }, participants: null, draws: null, joins: null },
      series: { labels, newUsers: [1, 2, 1], totalUsers: [8, 9, 10], newParticipants: [1, 1, 0], totalParticipants: [7, 8, 8], joins: [3, 4, 2], draws: [1, 1, 1] },
      breakdowns: { status: { finished: 2, active: 1 }, brands: [["BEEF", 2], ["Pokerdom", 1]], referrals: { refs: 5, nonRefs: 2, unknown: 3 } },
      organizerRows: [{ id: "1", draws: 3, referrals: 5 }],
    },
    [{ id: "1", label: "Тимур" }],
    "",
    { users: { 1: { meta: { first_name: "Тимур" } } } },
  );
  assert.match(html, /data-tab="users"/);
  assert.match(html, /data-panel="joins"/);
  assert.match(html, /brand-logos\/beef_light\.png/);
  assert.match(html, /Тимур/);
  clean(html);
});
