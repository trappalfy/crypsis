// Small JSON-RPC client for the indexer (server & scripts). Retries 429/5xx with backoff.
// Never logs the URL: it may carry the Helius key.
export type RpcFn = <T>(method: string, params?: unknown[]) => Promise<T>;

export function makeRpc(url: string, opts: { timeoutMs?: number; retries?: number; minIntervalMs?: number } = {}): RpcFn {
  const { timeoutMs = 15_000, retries = 8 } = opts;
  // public RPCs rate-limit hard; space requests out unless a dedicated (Helius) endpoint is used
  const minInterval = opts.minIntervalMs ?? (Number(process.env.RPC_MIN_INTERVAL_MS) || (/helius-rpc|api-key=/.test(url) ? 0 : 220));
  let nextAt = 0;
  const throttle = async () => {
    if (!minInterval) return;
    const now = Date.now(), at = Math.max(now, nextAt);
    nextAt = at + minInterval;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
  return async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await throttle();
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
        if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`rpc ${method} http ${res.status}`), { retry: true });
        const j = (await res.json()) as { result?: T; error?: { code: number; message: string } };
        if (j.error) {
          const retry = j.error.code === -32005 || /rate|too many|timeout/i.test(j.error.message);
          throw Object.assign(new Error(`rpc ${method}: ${j.error.message}`), { retry, code: j.error.code });
        }
        return j.result as T;
      } catch (e) {
        lastErr = e;
        const retry = (e as { retry?: boolean }).retry ?? (e as Error).name === "TimeoutError";
        if (!retry || attempt === retries) break;
        await new Promise((r) => setTimeout(r, Math.min(15_000, 500 * 2 ** attempt) + Math.random() * 200));
      }
    }
    throw lastErr;
  };
}

export interface RpcAccount { owner: string; lamports: number; data: Buffer }

export async function getMultipleAccounts(rpc: RpcFn, addresses: string[], chunk = 100): Promise<(RpcAccount | null)[]> {
  const out: (RpcAccount | null)[] = [];
  for (let i = 0; i < addresses.length; i += chunk) {
    const part = addresses.slice(i, i + chunk);
    const r = await rpc<{ value: ({ owner: string; lamports: number; data: [string, string] } | null)[] }>("getMultipleAccounts", [part, { encoding: "base64", commitment: "confirmed" }]);
    for (const v of r.value) out.push(v ? { owner: v.owner, lamports: v.lamports, data: Buffer.from(v.data[0], "base64") } : null);
  }
  return out;
}

/** v1 Ring transactions need maxSupportedTransactionVersion: 1. */
export function getTransaction(rpc: RpcFn, signature: string) {
  return rpc<RawTransaction | null>("getTransaction", [signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: { amount: string; decimals: number };
}
export interface RawTransaction {
  slot: number;
  blockTime: number | null;
  version?: number | "legacy";
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    loadedAddresses?: { writable: string[]; readonly: string[] };
    logMessages?: string[];
  } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: string[]; header?: { numRequiredSignatures: number }; instructions: { programIdIndex: number; accounts: number[]; data: string }[] };
  };
}
