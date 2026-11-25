// fetch wrapper for the browser Ring client: Helius answers 429 when the account's per-second limit is hit
// (Free plan: 10 RPC req/s for the whole account) and occasionally 502/503/504. Helius asks clients to back off
// and retry, so one busy second becomes a short delay instead of an error on the user's screen.
// Not retried: 403 (domain rule), other 4xx, 500, aborts. Re-sending is safe for every call the SDK makes:
// reads are idempotent, and a re-sent signed transaction has the same signature (the cluster deduplicates it).

const RETRY_STATUS = new Set([429, 502, 503, 504]);

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isAbort = (e: unknown) => (e as { name?: string })?.name === "AbortError";

export function retryingFetch(base: typeof fetch, o: RetryOptions = {}): typeof fetch {
  const retries = o.retries ?? 5;
  const baseMs = o.baseMs ?? 300;
  const maxMs = o.maxMs ?? 4000;
  const sleep = o.sleep ?? defaultSleep;
  const random = o.random ?? Math.random;
  const backoff = (attempt: number) => {
    const ceil = Math.min(maxMs, baseMs * 2 ** attempt);
    return Math.round(ceil / 2 + (random() * ceil) / 2); // "equal jitter"
  };

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    for (let attempt = 0; ; attempt++) {
      const aborted = () => init?.signal?.aborted || (isRequest && (input as Request).signal?.aborted);
      let res: Response;
      try {
        res = await base(isRequest ? (input as Request).clone() : input, init);
      } catch (e) {
        if (isAbort(e) || aborted() || attempt >= retries) throw e;
        await sleep(backoff(attempt));
        continue;
      }
      if (!RETRY_STATUS.has(res.status) || attempt >= retries || aborted()) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(maxMs, retryAfter * 1000) : backoff(attempt);
      await res.body?.cancel().catch(() => {});
      await sleep(wait);
    }
  }) as typeof fetch;
}
