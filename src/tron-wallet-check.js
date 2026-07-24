function extractTransactionCount(payload) {
  const candidates = [
    payload?.totalTransactionCount,
    payload?.totaltransactioncount,
    payload?.transactionCount,
    payload?.total,
    payload?.count,
    payload?.data?.totalTransactionCount,
    payload?.data?.totaltransactioncount,
    payload?.data?.transactionCount,
    payload?.data?.total,
    payload?.meta?.total,
    payload?.rangeTotal,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }
  return null;
}

async function fetchTronAddressTransactionCount(address) {
  const accountUrl = `https://apilist.tronscanapi.com/api/account?address=${encodeURIComponent(address)}`;
  const accountRes = await fetch(accountUrl, { signal: AbortSignal.timeout(10_000) });
  if (accountRes.ok) {
    const payload = await accountRes.json().catch(() => ({}));
    const count = extractTransactionCount(payload);
    if (count !== null) {
      return count;
    }
  }

  const txUrl = `https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=1&start=0&address=${encodeURIComponent(address)}`;
  const txRes = await fetch(txUrl, { signal: AbortSignal.timeout(10_000) });
  if (!txRes.ok) {
    throw new Error(`HTTP ${txRes.status}`);
  }
  const payload = await txRes.json().catch(() => ({}));
  const count = extractTransactionCount(payload);
  if (count === null) {
    throw new Error("Не удалось прочитать количество транзакций");
  }
  return count;
}

async function checkWalletHasTransactions(address) {
  try {
    const txCount = await fetchTronAddressTransactionCount(address);
    return { ok: true, txCount, hasTransactions: txCount > 0 };
  } catch (error) {
    return { ok: false, txCount: null, hasTransactions: false, error: error.message };
  }
}

module.exports = {
  extractTransactionCount,
  fetchTronAddressTransactionCount,
  checkWalletHasTransactions,
};
