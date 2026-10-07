// The web admin's «Розыгрыши»: every draw with its numbers - who ran it, how
// many came and how many of them were new, how it went against the same
// organiser's previous draw - and the links among the people who took part.
//
// The links are the evidence of «Связи» (link-graph.js) read inside one draw:
// what two of its participants share. A cluster on «Связи» spans every draw;
// here it is cut down to the draw's people and split again, so the graph shows
// who came into this draw more than once, not a twin who played somewhere
// else. Those are listed apart: participants linked only to people outside.
//
// One kind exists only here, "ipdraw": the same network inside this one draw.
// «Связи» wants two draws together before it links a network (a flat, a café),
// but several entries from one network into one draw is what a farm looks
// like. It is shown and nothing more: it zeroes no prize and makes nobody a
// multi-account in the numbers.

const { DateTime } = require("luxon");
const { buildClusters, STRONG, CLUSTERING, MAX_IP_PEOPLE } = require("./link-graph");
const { resolveProjectId } = require("./project-identity");
const { identityOf, computeDelta } = require("./admin-format");
const { maskHas, summarizeJoinFunnel } = require("./join-funnel");

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const dayText = (dt) => `${dt.day} ${MONTHS[dt.month - 1]}`;
const DRAW_CLUSTERING = new Set([...CLUSTERING, "ipdraw"]);
const WEEKS_SHOWN = 16;
const HISTORY_SHOWN = 12;

const startOf = (draw) => Date.parse(draw?.publishAt || draw?.createdAt || "") || 0;
const endOf = (draw) => Date.parse(draw?.finishedAt || draw?.endAt || "") || 0;
const uniqueIds = (ids) => [...new Set((ids || []).map(String))];

function statusOf(draw) {
  if (draw?.status === "finished") return "finished";
  if (draw?.status === "active") return "active";
  return "scheduled";
}

function organiserOf(draw, project) {
  return String(draw?.ownerId || draw?.createdBy || project?.ownerId || project?.createdBy || "");
}

/** What happened to a winner's prize, in a word for the list. */
function prizeStateOf(notify) {
  if (!notify) return { key: "none", label: "не уведомлён", tone: "gray" };
  if (notify.paidAt) return { key: "paid", label: "выплачено", tone: "green" };
  if (notify.antiFraudFlag || notify.forfeitureReason === "anti_fraud" || notify.antiFraudCancelledAt) {
    return { key: "fraud", label: "антифрод", tone: "red" };
  }
  if (notify.paymentDeniedAt) return { key: "denied", label: "отказано", tone: "red" };
  if (notify.status === "forfeited") return { key: "forfeited", label: "приз сгорел", tone: "orange" };
  if (notify.status === "expired") return { key: "expired", label: "не подтвердил", tone: "orange" };
  if (notify.status === "confirmed") return { key: "queue", label: "ждёт выплату", tone: "blue" };
  if (notify.status === "awaiting_address") return { key: "address", label: "ждём адрес", tone: "blue" };
  return { key: "pending", label: "ждём ответа", tone: "blue" };
}

/** userId -> the evidence entries naming them. */
function indexEvidence(evidence) {
  const byUser = new Map();
  for (const entry of evidence?.values?.() || []) {
    for (const userId of entry.users) {
      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId).push(entry);
    }
  }
  return byUser;
}

/**
 * The evidence among these people: every entry cut down to them, kept where
 * two or more of them remain. `outside` says how many it also names elsewhere.
 */
function evidenceAmong(people, byUser, kinds = null) {
  const out = new Map();
  const seen = new Set();
  for (const userId of people) {
    for (const entry of byUser.get(userId) || []) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      if (kinds && !kinds.has(entry.kind)) continue;
      const inside = [...entry.users].filter((id) => people.has(id));
      if (inside.length < 2) continue;
      out.set(entry.key, { ...entry, users: new Set(inside), outside: entry.users.size - inside.length });
    }
  }
  return out;
}

/**
 * The same network inside this draw: two to five people, not a carrier's or a
 * VPN's network (strangers share those), and not a pair «Связи» linked already.
 */
function sameNetworkInDraw(draw, people, networkTypes, already) {
  const byIp = new Map();
  for (const [userId, meta] of Object.entries(draw?.participantMeta || {})) {
    if (!meta?.ipHash || !people.has(String(userId))) continue;
    if (!byIp.has(meta.ipHash)) byIp.set(meta.ipHash, { users: new Set(), netKey: meta.netKey });
    byIp.get(meta.ipHash).users.add(String(userId));
  }
  const out = [];
  for (const [ipHash, { users, netKey }] of byIp) {
    if (users.size < 2 || users.size > MAX_IP_PEOPLE) continue;
    const type = networkTypes?.get?.(netKey);
    if (type === "mobile" || type === "hosting") continue;
    if (already.has(`ip:${ipHash}`)) continue;
    out.push({ key: `ipdraw:${ipHash}`, kind: "ipdraw", label: "одна сеть в розыгрыше", users, meta: { type: type || "" }, outside: 0 });
  }
  return out;
}

/** Entries that come from one person more than once: Σ(group - 1) over the strong groups. */
function repeatedEntries(people, byUser) {
  const strong = evidenceAmong(people, byUser, STRONG);
  const groups = buildClusters(strong, STRONG);
  return {
    groups: groups.length,
    people: groups.reduce((sum, group) => sum + group.users.length, 0),
    extra: groups.reduce((sum, group) => sum + group.users.length - 1, 0),
  };
}

/**
 * Every draw's row for the list, in the order they started.
 *   draws     - active and archived (admin-draw-source.js);
 *   evidence  - link-graph's evidence of every draw and profile.
 */
function buildDrawRows({ draws = [], projects = [], userProfiles = {}, evidence = new Map() }) {
  const users = userProfiles.users || {};
  const projectsById = new Map(projects.map((project) => [String(project.id), project]));
  const byUser = indexEvidence(evidence);
  const strongUsers = new Set();
  for (const entry of evidence.values()) {
    if (STRONG.has(entry.kind)) entry.users.forEach((id) => strongUsers.add(id));
  }

  const ordered = [...draws].filter((draw) => draw && draw.id != null).sort((a, b) => startOf(a) - startOf(b) || String(a.id).localeCompare(String(b.id)));
  const seenEver = new Set();
  const seenByOwner = new Map();
  const lastByOwner = new Map();
  const rows = [];

  for (const draw of ordered) {
    const project = projectsById.get(String(resolveProjectId(draw.projectId) || draw.projectId));
    const ownerId = organiserOf(draw, project);
    const people = uniqueIds(draw.participantIds);
    const peopleSet = new Set(people);
    if (!seenByOwner.has(ownerId)) seenByOwner.set(ownerId, new Set());
    const ownerSeen = seenByOwner.get(ownerId);

    let newcomers = 0;
    let newToOwner = 0;
    for (const userId of people) {
      if (!seenEver.has(userId)) newcomers += 1;
      else if (!ownerSeen.has(userId)) newToOwner += 1;
    }
    people.forEach((userId) => {
      seenEver.add(userId);
      ownerSeen.add(userId);
    });

    const winners = uniqueIds(draw.winnerIds);
    const states = winners.map((id) => prizeStateOf(draw.winnerNotifications?.[id]));
    const repeated = repeatedEntries(peopleSet, byUser);
    const previous = lastByOwner.get(ownerId) || null;
    const status = statusOf(draw);

    const row = {
      id: String(draw.id),
      title: String(draw.postTitle || "").trim() || String(draw.prize || "").trim() || "Без названия",
      prize: String(draw.prize || "").trim(),
      prizeUsd: Number(draw.prizeAmountUsd) || 0,
      prizeRub: Number(draw.prizeAmountRub) || 0,
      status,
      brand: project?.name || "Без проекта",
      ownerId,
      owner: identityOf(ownerId, users[ownerId]?.meta || {}),
      startAt: startOf(draw),
      endAt: endOf(draw),
      participants: people.length,
      newcomers,
      newToOwner,
      returning: people.length - newcomers - newToOwner,
      winnersCount: Number(draw.winnersCount) || winners.length,
      winners: winners.length,
      paid: states.filter((state) => state.key === "paid").length,
      fraud: states.filter((state) => state.key === "fraud").length,
      invited: Object.keys(draw.participantReferrals || {}).filter((id) => peopleSet.has(String(id))).length,
      unregistered: people.filter((id) => draw.participantMeta?.[id]?.unregistered === true).length,
      multi: people.filter((id) => strongUsers.has(id)).length,
      repeated,
      winnersLinked: winners.filter((id) => strongUsers.has(id)).length,
      previousId: previous?.id || null,
      previousParticipants: previous ? previous.participants : null,
      // An active draw is still filling up: against a finished one it would
      // always look like a fall.
      delta: previous && status === "finished" ? computeDelta(people.length, previous.participants) : null,
      flags: {
        refOnly: draw.refOnly === true,
        askWallet: draw.askWalletOnJoin === true,
        askId: draw.askProjectIdOnJoin === true,
      },
    };
    rows.push(row);
    if (status === "finished") lastByOwner.set(ownerId, row);
  }
  return { rows, byUser, strongUsers };
}

const sum = (list, pick) => list.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
const average = (list, pick) => (list.length ? sum(list, pick) / list.length : 0);

/** The list page: totals, weeks, organisers and every row, newest first. */
function buildDrawsView({ draws = [], projects = [], userProfiles = {}, evidence = new Map(), timezone = "Europe/Moscow", now = Date.now() }) {
  const { rows } = buildDrawRows({ draws, projects, userProfiles, evidence });
  const finished = rows.filter((row) => row.status === "finished");
  const people = new Set();
  for (const draw of draws) uniqueIds(draw?.participantIds).forEach((id) => people.add(id));

  // Last 30 days against the 30 before, by the day a draw started.
  const window = (from, to) => rows.filter((row) => row.startAt >= from && row.startAt < to);
  const recent = window(now - 30 * DAY_MS, now + DAY_MS);
  const before = window(now - 60 * DAY_MS, now - 30 * DAY_MS);
  const recentDone = recent.filter((row) => row.status === "finished");
  const beforeDone = before.filter((row) => row.status === "finished");

  const entries = sum(rows, (row) => row.participants);
  const totals = {
    draws: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    scheduled: rows.filter((row) => row.status === "scheduled").length,
    entries,
    people: people.size,
    average: Math.round(average(finished, (row) => row.participants)),
    recentDraws: recent.length,
    recentDrawsDelta: computeDelta(recent.length, before.length),
    recentAverage: Math.round(average(recentDone, (row) => row.participants)),
    recentAverageDelta: computeDelta(average(recentDone, (row) => row.participants), average(beforeDone, (row) => row.participants)),
    recentNewcomers: sum(recent, (row) => row.newcomers),
    recentNewcomersDelta: computeDelta(sum(recent, (row) => row.newcomers), sum(before, (row) => row.newcomers)),
    multiEntries: sum(rows, (row) => row.multi),
    extraEntries: sum(rows, (row) => row.repeated.extra),
  };

  // Weeks: draws started, entries, newcomers.
  const weekKey = (ms) => DateTime.fromMillis(ms, { zone: timezone }).startOf("week");
  const lastWeek = weekKey(now);
  const weeks = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) weeks.push(lastWeek.minus({ weeks: i }));
  const weekIndex = new Map(weeks.map((week, index) => [week.toMillis(), index]));
  const weekly = weeks.map((week) => ({ label: dayText(week), draws: 0, entries: 0, newcomers: 0 }));
  for (const row of rows) {
    if (!row.startAt) continue;
    const index = weekIndex.get(weekKey(row.startAt).toMillis());
    if (index === undefined) continue;
    weekly[index].draws += 1;
    weekly[index].entries += row.participants;
    weekly[index].newcomers += row.newcomers;
  }

  // Organisers: their draws, how many come on average and where it is going.
  const byOwner = new Map();
  for (const row of rows) {
    if (!byOwner.has(row.ownerId)) byOwner.set(row.ownerId, []);
    byOwner.get(row.ownerId).push(row);
  }
  const owners = [...byOwner.entries()]
    .map(([ownerId, list]) => {
      const done = list.filter((row) => row.status === "finished");
      const ownerPeople = new Set();
      for (const draw of draws) {
        if (list.some((row) => row.id === String(draw.id))) uniqueIds(draw.participantIds).forEach((id) => ownerPeople.add(id));
      }
      const lastThree = done.slice(-3);
      const threeBefore = done.slice(-6, -3);
      return {
        ownerId,
        owner: list[0].owner,
        draws: list.length,
        active: list.filter((row) => row.status === "active").length,
        entries: sum(list, (row) => row.participants),
        people: ownerPeople.size,
        average: Math.round(average(done, (row) => row.participants)),
        trend: computeDelta(average(lastThree, (row) => row.participants), average(threeBefore, (row) => row.participants)),
        series: done.slice(-HISTORY_SHOWN).map((row) => row.participants),
        multiShare: sum(list, (row) => row.participants) ? Math.round((sum(list, (row) => row.multi) / sum(list, (row) => row.participants)) * 100) : 0,
        brands: [...new Set(list.map((row) => row.brand))],
        lastAt: Math.max(...list.map((row) => row.startAt)),
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);

  return { totals, weekly, owners, rows: rows.slice().reverse() };
}

/** Wins and paid prizes per person over every draw. */
function countPrizes(draws) {
  const wins = new Map();
  const paid = new Map();
  for (const draw of draws) {
    for (const winnerId of uniqueIds(draw?.winnerIds)) {
      wins.set(winnerId, (wins.get(winnerId) || 0) + 1);
      if (draw.winnerNotifications?.[winnerId]?.paidAt) paid.set(winnerId, (paid.get(winnerId) || 0) + 1);
    }
  }
  return { wins, paid };
}

/** How people came in over time: joins binned by the hour, or the day for a long draw. */
function joinTimeline(funnelRows, { timezone, startAt = 0, endAt = 0 }) {
  const times = (funnelRows || [])
    .filter((row) => maskHas(Number(row.stages) || 0, "joined"))
    .map((row) => Number(row.firstAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!times.length) return null;
  const from = Math.min(times[0], startAt || times[0]);
  const to = Math.max(times[times.length - 1], endAt && endAt < from + 60 * DAY_MS ? endAt : 0);
  const span = Math.max(1, to - from);
  const unit = span > 3 * DAY_MS ? "day" : "hour";
  const step = unit === "day" ? DAY_MS : 60 * 60 * 1000;
  const first = DateTime.fromMillis(from, { zone: timezone }).startOf(unit).toMillis();
  const count = Math.min(240, Math.floor((to - first) / step) + 1);
  const bins = Array.from({ length: count }, () => 0);
  for (const at of times) bins[Math.min(count - 1, Math.max(0, Math.floor((at - first) / step)))] += 1;
  let running = 0;
  const labels = bins.map((_, index) => {
    const dt = DateTime.fromMillis(first + index * step, { zone: timezone });
    return unit === "day" ? dayText(dt) : `${dayText(dt)}, ${dt.toFormat("HH:mm")}`;
  });
  return {
    unit,
    labels,
    perStep: bins,
    total: bins.map((value) => (running += value)),
    peak: Math.max(...bins),
    peakLabel: labels[bins.indexOf(Math.max(...bins))],
  };
}

/** A participant linked to people outside the draw only: what with, and to how many. */
function outsideLinks(people, inDrawLinked, byUser, users) {
  const out = [];
  for (const userId of people) {
    if (inDrawLinked.has(userId)) continue;
    const entries = (byUser.get(userId) || []).filter((entry) => STRONG.has(entry.kind));
    if (!entries.length) continue;
    const others = new Set();
    entries.forEach((entry) => entry.users.forEach((id) => id !== userId && others.add(id)));
    out.push({
      identity: identityOf(userId, users[userId]?.meta || {}),
      kinds: [...new Set(entries.map((entry) => entry.kind))],
      others: others.size,
    });
  }
  return out.sort((a, b) => b.others - a.others);
}

/**
 * One draw's page.
 *   funnelRows   - join_funnel rows of this draw (kept 90 days);
 *   networkTypes - netKey -> mobile | hosting | home.
 */
function buildDrawDetail(drawId, { draws = [], projects = [], userProfiles = {}, evidence = new Map(), networkTypes = new Map(), funnelRows = [], timezone = "Europe/Moscow" }) {
  const draw = draws.find((item) => String(item?.id) === String(drawId));
  if (!draw) return null;
  const { rows, byUser } = buildDrawRows({ draws, projects, userProfiles, evidence });
  const row = rows.find((item) => item.id === String(drawId));
  const users = userProfiles.users || {};
  const people = new Set(uniqueIds(draw.participantIds));
  const winners = new Set(uniqueIds(draw.winnerIds));
  const { wins, paid } = countPrizes(draws);

  // The links inside the draw, the network inside it, and the groups they make.
  const inside = evidenceAmong(people, byUser);
  for (const entry of sameNetworkInDraw(draw, people, networkTypes, inside)) inside.set(entry.key, entry);
  const clusters = buildClusters(inside, DRAW_CLUSTERING).map((cluster) => {
    const members = cluster.users.map((userId) => {
      const winner = winners.has(userId);
      const state = winner ? prizeStateOf(draw.winnerNotifications?.[userId]) : null;
      return {
        identity: identityOf(userId, users[userId]?.meta || {}),
        wins: wins.get(userId) || 0,
        paid: paid.get(userId) || 0,
        winner,
        sub: winner ? `победитель · ${state.label}` : "",
      };
    });
    const kinds = {};
    for (const entry of cluster.evidence) kinds[entry.kind] = (kinds[entry.kind] || 0) + 1;
    return {
      id: cluster.id,
      strong: cluster.strong,
      members,
      evidence: cluster.evidence,
      kinds,
      winners: members.filter((member) => member.winner).length,
      wins: members.reduce((total, member) => total + member.wins, 0),
      paid: members.reduce((total, member) => total + member.paid, 0),
    };
  });
  clusters.sort((a, b) => Number(b.strong) - Number(a.strong) || b.winners - a.winners || b.members.length - a.members.length);
  const inDrawLinked = new Set(clusters.filter((c) => c.strong).flatMap((c) => c.members.map((m) => m.identity.userId)));

  // The organiser's draws up to this one, for the columns.
  const ownerRows = rows.filter((item) => item.ownerId === row.ownerId && item.startAt <= row.startAt);
  const history = ownerRows.slice(-HISTORY_SHOWN).map((item) => ({ id: item.id, title: item.title, startAt: item.startAt, participants: item.participants, current: item.id === row.id, status: item.status }));

  const funnel = (funnelRows || []).length ? summarizeJoinFunnel(funnelRows) : null;

  const winnerList = [...winners].map((userId) => {
    const notify = draw.winnerNotifications?.[userId];
    return {
      identity: identityOf(userId, users[userId]?.meta || {}),
      state: prizeStateOf(notify),
      address: String(notify?.trc20Address || "").trim(),
      linked: (byUser.get(userId) || []).some((entry) => STRONG.has(entry.kind)),
      inDrawLinked: inDrawLinked.has(userId),
    };
  });

  return {
    row,
    draw: {
      id: String(draw.id),
      publishAt: draw.publishAt || null,
      endAt: draw.endAt || null,
      finishedAt: draw.finishedAt || null,
      createdAt: draw.createdAt || null,
      channelId: draw.channelId || null,
    },
    clusters,
    links: {
      groups: clusters.length,
      strongGroups: clusters.filter((c) => c.strong).length,
      linkedPeople: clusters.reduce((total, c) => total + c.members.length, 0),
      strongPeople: inDrawLinked.size,
      networkOnly: clusters.filter((c) => !c.strong).reduce((total, c) => total + c.members.length, 0),
      extra: row.repeated.extra,
      winnersInGroups: clusters.filter((c) => c.strong).reduce((total, c) => total + c.winners, 0),
    },
    outside: outsideLinks(people, inDrawLinked, byUser, users),
    timeline: joinTimeline(funnelRows, { timezone, startAt: row.startAt, endAt: row.endAt }),
    funnel,
    history,
    winners: winnerList,
  };
}

module.exports = {
  DRAW_CLUSTERING,
  prizeStateOf,
  indexEvidence,
  evidenceAmong,
  sameNetworkInDraw,
  repeatedEntries,
  buildDrawRows,
  buildDrawsView,
  buildDrawDetail,
  joinTimeline,
};
