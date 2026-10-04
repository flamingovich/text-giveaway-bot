// The background half of wallet-kind.js: labels the payout queue's addresses
// and follows paid prizes, a few addresses a tick so the free explorers never
// see a burst. Runs on its own timer, never inside the scheduler's tick: a slow
// explorer must not hold up finishing draws.
const { judgePayoutOutcome } = require("./wallet-kind");

const DEFAULT_STALE_MS = 12 * 3600e3;
const ERROR_RETRY_MS = 30 * 60e3;
const PAYOUT_ERROR_RETRY_MS = 60 * 60e3;

/**
 * listQueue()   -> [{ address, network }] addresses the payout queue shows;
 * listPayouts() -> [{ drawId, userId, address, network, paidAt(ms) }] paid prizes.
 */
function createWalletChecker({
  store,
  inspector,
  listQueue,
  listPayouts,
  logger = console,
  now = () => Date.now(),
  perTick = 2,
  staleMs = DEFAULT_STALE_MS,
}) {
  let running = false;

  async function checkPayouts(budget) {
    if (budget <= 0) return 0;
    let used = 0;
    for (const row of store.duePayouts(budget)) {
      used += 1;
      try {
        const result = await inspector.inspect(row.address, row.network, { deadlineMs: 20000 });
        store.saveCheck(row.address, result.network, result.verdict);
        const { outcome, platform } = judgePayoutOutcome({
          address: row.address,
          transfers: result.transfers,
          complete: result.complete,
          selfTag: result.selfTag,
          paidAt: row.paidAt,
        });
        store.savePayoutOutcome(row, outcome, platform);
      } catch (error) {
        store.postponePayout(row, now() + PAYOUT_ERROR_RETRY_MS);
        logger.warn(`[wallet] выплата не проверена (${row.drawId}): ${error.message}`);
      }
    }
    return used;
  }

  async function labelQueue(budget) {
    if (budget <= 0) return 0;
    const seen = new Set();
    const queue = (listQueue() || []).filter((item) => item.address && !seen.has(item.address) && seen.add(item.address));
    const checks = store.getChecks(queue.map((item) => item.address));
    const due = queue.filter((item) => {
      const known = checks.get(item.address);
      if (!known) return true;
      const age = now() - known.checkedAt;
      return known.error && !known.kind ? age > ERROR_RETRY_MS : age > staleMs;
    });
    const batch = due.slice(0, budget);
    for (const item of batch) {
      try {
        const result = await inspector.inspect(item.address, item.network, { deadlineMs: 20000 });
        store.saveCheck(item.address, result.network, result.verdict);
      } catch (error) {
        store.saveCheck(item.address, item.network, null, error.message);
      }
    }
    return batch.length;
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      for (const payout of listPayouts() || []) {
        store.upsertPayout(payout);
      }
      // The queue first: its labels are what the owner looks at before paying;
      // the follow-up of old prizes takes what is left of the tick.
      const used = await labelQueue(perTick);
      await checkPayouts(perTick - used);
    } catch (error) {
      logger.error(`[wallet] проверка кошельков: ${error.message}`);
    } finally {
      running = false;
    }
  }

  return { tick };
}

module.exports = { createWalletChecker };
