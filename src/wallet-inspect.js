// Reading an address's USDT history for wallet-kind.js.
//
// Tron: Tronscan gives the transfers with both sides' public tags in one
// answer, so a verdict usually costs one or two requests and no key. BSC and
// Ethereum: Binplorer and Ethplorer (free key) - they give no tags, the known
// exchange wallets are listed in wallet-kind.js instead. An EVM address is
// read on both networks unless one is named: one owner holds it everywhere,
// and the participant may have named the wrong one.
//
// The whole inspection runs under one deadline: it sits inside the winner's
// message and the join step, which must answer in seconds.
const { judgeWallet, normalizeAddress } = require("./wallet-kind");

const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_PAGE = 50;
const TRON_PAGES = 2;
const EVM = {
  bep20: {
    api: "https://api.binplorer.com",
    tokens: { "0x55d398326f99059ff775485246999027b3197955": 18, "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": 18 },
  },
  erc20: {
    api: "https://api.ethplorer.io",
    tokens: { "0xdac17f958d2ee523a2206206994597c13d831ec7": 6, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6 },
  },
};
const EVM_LIMIT = 100;
const DEFAULT_DEADLINE_MS = 8000;

function createWalletInspector({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  async function getJson(url, deadline) {
    const left = deadline - now();
    if (left <= 0) {
      throw new Error("время проверки вышло");
    }
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(left) });
    if (!res.ok) {
      throw new Error(`${new URL(url).host}: ${res.status}`);
    }
    return res.json();
  }

  async function tronHistory(address, deadline) {
    const rows = [];
    let complete = false;
    for (let page = 0; page < TRON_PAGES; page++) {
      const r = await getJson(
        `https://apilist.tronscanapi.com/api/token_trc20/transfers?limit=${TRON_PAGE}&start=${page * TRON_PAGE}&relatedAddress=${address}&contract_address=${TRON_USDT}`,
        deadline,
      );
      const list = Array.isArray(r?.token_transfers) ? r.token_transfers : null;
      if (!list) {
        throw new Error("Tronscan: непонятный ответ");
      }
      // With nothing to show for the address, Tronscan answers with other
      // people's transfers: only the address's own rows count.
      const own = list.filter((t) => t.from_address === address || t.to_address === address);
      for (const t of own) {
        if (t.finalResult && t.finalResult !== "SUCCESS") continue;
        rows.push({
          from: t.from_address,
          to: t.to_address,
          amount: Number(t.quant) / 1e6,
          ts: Number(t.block_ts),
          fromTag: t.from_address_tag?.from_address_tag || null,
          toTag: t.to_address_tag?.to_address_tag || null,
        });
      }
      if (own.length < TRON_PAGE) {
        complete = true;
        break;
      }
    }
    return { transfers: rows, complete };
  }

  async function tronTag(address, deadline) {
    try {
      const r = await getJson(`https://apilist.tronscanapi.com/api/account/tag?address=${address}`, deadline);
      return r?.publicTag || r?.blueTag || r?.greyTag || null;
    } catch {
      return null;
    }
  }

  async function evmHistory(network, address, deadline) {
    const cfg = EVM[network];
    const me = normalizeAddress(address);
    const r = await getJson(`${cfg.api}/getAddressHistory/${me}?apiKey=freekey&type=transfer&limit=${EVM_LIMIT}`, deadline);
    if (!Array.isArray(r?.operations)) {
      throw new Error(`${new URL(cfg.api).host}: ${r?.error?.message || "непонятный ответ"}`);
    }
    const transfers = r.operations
      .filter((o) => cfg.tokens[String(o.tokenInfo?.address || "").toLowerCase()] != null)
      .map((o) => ({
        from: normalizeAddress(o.from),
        to: normalizeAddress(o.to),
        amount: Number(o.value) / 10 ** cfg.tokens[String(o.tokenInfo.address).toLowerCase()],
        ts: Number(o.timestamp) * 1000,
      }));
    return { transfers, complete: r.operations.length < EVM_LIMIT };
  }

  /**
   * → { verdict, transfers, complete, network } ; throws when no source answered.
   * network: "trc20" | "bep20" | "erc20" | null (an EVM address with no network named)
   */
  async function inspect(address, network = null, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
    const deadline = now() + deadlineMs;
    const me = normalizeAddress(address);
    if (/^T/.test(me)) {
      const [history, selfTag] = await Promise.all([tronHistory(me, deadline), tronTag(me, deadline)]);
      return { ...history, network: "trc20", selfTag, verdict: judgeWallet({ address: me, ...history, selfTag }) };
    }
    const networks = network === "bep20" || network === "erc20" ? [network, network === "bep20" ? "erc20" : "bep20"] : ["bep20", "erc20"];
    const answers = await Promise.allSettled(networks.map((net) => evmHistory(net, me, deadline)));
    const read = answers
      .map((a, i) => (a.status === "fulfilled" ? { ...a.value, network: networks[i] } : null))
      .filter(Boolean);
    if (!read.length) {
      throw answers[0].reason || new Error("сервисы EVM не ответили");
    }
    // The network with more history says more about the owner.
    const main = read.sort((a, b) => b.transfers.length - a.transfers.length)[0];
    // A network that did not answer may hold history: never a whole picture then.
    const complete = main.complete && read.length === networks.length;
    return { ...main, complete, selfTag: null, verdict: judgeWallet({ address: me, transfers: main.transfers, complete }) };
  }

  return { inspect };
}

module.exports = { createWalletInspector, TRON_USDT };
