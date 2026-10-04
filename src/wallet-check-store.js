// What is known about payout addresses (wallet-kind.js), in its own tables.
//
// A table, not a document: the background checker writes a row per address
// every few minutes, and rewriting the draws or profiles document for that
// would rewrite megabytes each time (see CLAUDE.md on documents).
//
// wallet_checks  - the latest verdict per address, for the payout queue's label;
// wallet_payouts - one row per paid prize: where the money went afterwards,
//                  checked 1 h, 1 day, 4 and 8 days after the payment. A prize
//                  taken past the project marks the person for the next win.

const RECHECK_AFTER_PAY_MS = [60 * 60e3, 24 * 3600e3, 4 * 24 * 3600e3, 8 * 24 * 3600e3];
const FLAG_OUTCOMES = new Set(["exchange", "personal"]);

function createWalletCheckStore(db, { now = () => Date.now() } = {}) {
  // The design mode's JSON backend has no SQLite: nothing is kept there.
  if (!db) {
    return {
      saveCheck() {},
      getChecks: () => new Map(),
      getCheck: () => null,
      userFlag: () => null,
      checkedAt: () => null,
      upsertPayout() {},
      duePayouts: () => [],
      savePayoutOutcome() {},
      postponePayout() {},
      flaggedUsers: () => new Map(),
      revision: () => 0,
    };
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_checks (
      address TEXT PRIMARY KEY,
      network TEXT,
      kind TEXT,
      platform TEXT,
      reject INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      error TEXT,
      checked_at INTEGER NOT NULL,
      changed_at INTEGER
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS wallet_payouts (
      draw_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      address TEXT NOT NULL,
      network TEXT,
      paid_at INTEGER NOT NULL,
      outcome TEXT,
      outcome_platform TEXT,
      checks INTEGER NOT NULL DEFAULT 0,
      next_check_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (draw_id, user_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS wallet_payouts_due ON wallet_payouts (next_check_at);
    CREATE INDEX IF NOT EXISTS wallet_payouts_user ON wallet_payouts (user_id);
  `);

  // A failed check keeps the verdict it had: the label must not go blank
  // because a service did not answer once.
  const upsertCheck = db.prepare(`
    INSERT INTO wallet_checks (address, network, kind, platform, reject, reason, error, checked_at, changed_at)
    VALUES (@address, @network, @kind, @platform, @reject, @reason, @error, @checkedAt, @checkedAt)
    ON CONFLICT (address) DO UPDATE SET
      network = COALESCE(excluded.network, network),
      kind = COALESCE(excluded.kind, kind),
      platform = CASE WHEN excluded.kind IS NULL THEN platform ELSE excluded.platform END,
      reject = CASE WHEN excluded.kind IS NULL THEN reject ELSE excluded.reject END,
      reason = COALESCE(excluded.reason, reason),
      error = excluded.error,
      checked_at = excluded.checked_at,
      changed_at = CASE WHEN @changed THEN excluded.checked_at ELSE changed_at END
  `);
  const insertPayout = db.prepare(`
    INSERT INTO wallet_payouts (draw_id, user_id, address, network, paid_at, next_check_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (draw_id, user_id) DO NOTHING
  `);
  const selectDuePayouts = db.prepare(
    "SELECT draw_id AS drawId, user_id AS userId, address, network, paid_at AS paidAt, checks FROM wallet_payouts WHERE next_check_at IS NOT NULL AND next_check_at <= ? ORDER BY next_check_at LIMIT ?",
  );
  const updatePayout = db.prepare(
    "UPDATE wallet_payouts SET outcome = ?, outcome_platform = ?, checks = ?, next_check_at = ?, updated_at = CASE WHEN outcome IS ? THEN updated_at ELSE ? END WHERE draw_id = ? AND user_id = ?",
  );
  const selectCheck = db.prepare("SELECT * FROM wallet_checks WHERE address = ?");
  const selectUserFlag = db.prepare(
    "SELECT user_id AS userId, draw_id AS drawId, outcome, outcome_platform AS platform FROM wallet_payouts WHERE user_id = ? AND outcome IN ('exchange','personal') ORDER BY paid_at DESC LIMIT 1",
  );
  const postpone = db.prepare("UPDATE wallet_payouts SET next_check_at = ? WHERE draw_id = ? AND user_id = ?");
  const selectRevision = db.prepare(
    "SELECT MAX(at) AS at FROM (SELECT MAX(changed_at) AS at FROM wallet_checks UNION ALL SELECT MAX(updated_at) FROM wallet_payouts)",
  );

  // What the owner sees of a row: only a change in it moves the revision.
  const shown = (row) => (row ? JSON.stringify([row.kind, row.platform, Boolean(row.reject), row.kind ? null : Boolean(row.error)]) : "");

  function saveCheck(address, network, verdict, error = null) {
    const before = selectCheck.get(address);
    const after = before
      ? verdict
        ? { kind: verdict.kind, platform: verdict.platform || null, reject: verdict.reject, error }
        : { ...before, error }
      : { kind: verdict ? verdict.kind : null, platform: verdict ? verdict.platform || null : null, reject: Boolean(verdict && verdict.reject), error };
    upsertCheck.run({
      changed: shown(before) !== shown(after) ? 1 : 0,
      address,
      network: network || null,
      kind: verdict ? verdict.kind : null,
      platform: verdict ? verdict.platform || null : null,
      reject: verdict && verdict.reject ? 1 : 0,
      reason: verdict ? verdict.reason || null : null,
      error: error ? String(error).slice(0, 200) : null,
      checkedAt: now(),
    });
  }

  /** address -> { kind, platform, reject, reason, error, checkedAt } */
  function getChecks(addresses) {
    const list = [...new Set((addresses || []).filter(Boolean))];
    const result = new Map();
    // SQLite caps the number of bound values; a payout queue is far below it, but chunk anyway.
    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400);
      const rows = db
        .prepare(`SELECT * FROM wallet_checks WHERE address IN (${chunk.map(() => "?").join(",")})`)
        .all(...chunk);
      for (const row of rows) {
        result.set(row.address, {
          kind: row.kind,
          platform: row.platform,
          reject: Boolean(row.reject),
          reason: row.reason,
          error: row.error,
          checkedAt: row.checked_at,
        });
      }
    }
    return result;
  }

  // One card's lookups: a primary-key read each, cheap enough per card.
  function getCheck(address) {
    const row = address ? selectCheck.get(address) : null;
    return row
      ? { kind: row.kind, platform: row.platform, reject: Boolean(row.reject), reason: row.reason, error: row.error, checkedAt: row.checked_at }
      : null;
  }

  function userFlag(userId) {
    return selectUserFlag.get(String(userId)) || null;
  }

  function checkedAt(address) {
    return getChecks([address]).get(address)?.checkedAt || null;
  }

  function upsertPayout({ drawId, userId, address, network, paidAt }) {
    const at = Number(paidAt);
    if (!drawId || !userId || !address || !Number.isFinite(at)) {
      return;
    }
    // Long-paid prizes are looked at once, now; fresh ones on schedule.
    const next = RECHECK_AFTER_PAY_MS.map((d) => at + d).find((t) => t > now()) || now();
    insertPayout.run(String(drawId), String(userId), address, network || null, at, next, now());
  }

  function duePayouts(limit = 5) {
    return selectDuePayouts.all(now(), limit);
  }

  // The last check stops the schedule; "waiting" after it stays waiting.
  function savePayoutOutcome(row, outcome, platform) {
    const checks = (Number(row.checks) || 0) + 1;
    const final = FLAG_OUTCOMES.has(outcome) || outcome === "ok";
    const next = final ? null : RECHECK_AFTER_PAY_MS.map((d) => row.paidAt + d).find((t) => t > now()) || null;
    updatePayout.run(outcome, platform || null, checks, next, outcome, now(), String(row.drawId), String(row.userId));
  }

  // A service did not answer: the same check, later.
  function postponePayout(row, at) {
    postpone.run(at, String(row.drawId), String(row.userId));
  }

  /** userId -> { outcome, platform, drawId } for people whose past prize left the project. */
  function flaggedUsers(userIds) {
    const list = [...new Set((userIds || []).map(String))];
    const result = new Map();
    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400);
      const rows = db
        .prepare(
          `SELECT user_id AS userId, draw_id AS drawId, outcome, outcome_platform AS platform FROM wallet_payouts WHERE outcome IN ('exchange','personal') AND user_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .all(...chunk);
      for (const row of rows) {
        result.set(row.userId, row);
      }
    }
    return result;
  }

  // Changes whenever a label could: the live panel compares it to refresh.
  function revision() {
    return selectRevision.get()?.at || 0;
  }

  return { saveCheck, getChecks, getCheck, userFlag, checkedAt, upsertPayout, duePayouts, savePayoutOutcome, postponePayout, flaggedUsers, revision };
}

module.exports = { createWalletCheckStore, RECHECK_AFTER_PAY_MS };
