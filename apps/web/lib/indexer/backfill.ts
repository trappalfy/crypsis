// Event ingestion from signatures (backfill since Ring launch + head catch-up as a webhook fallback).
import type { Db } from "@crypsis/db";
import { RING_MAINNET_START, RING_PROGRAM } from "./constants";
import { parseRingTransaction } from "./parse";
import { getTransaction, type RpcFn } from "./rpc";
import { getState, insertEvents, setState } from "./store";

interface SigInfo { signature: string; slot: number; blockTime: number | null; err: unknown }

async function processSignatures(db: Db, rpc: RpcFn, sigs: SigInfo[], concurrency: number, deadline = Infinity): Promise<{ txs: number; events: number; complete: boolean }> {
  let events = 0, i = 0;
  const ok = sigs.filter((s) => !s.err);
  const worker = async () => {
    while (i < ok.length && Date.now() < deadline) {
      const s = ok[i++];
      const tx = await getTransaction(rpc, s.signature);
      if (tx) events += await insertEvents(db, parseRingTransaction(tx));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { txs: Math.min(i, ok.length), events, complete: i >= ok.length };
}

/**
 * New transactions since the last fully ingested head (cron fallback when the webhook is not configured).
 * A window [head .. newest] is walked newest -> older page by page; progress is kept in "events:pending",
 * and the head only moves once the whole window is ingested — so a long burst or a timeout leaves no gap.
 */
export async function catchUpHead(db: Db, rpc: RpcFn, opts: { maxPages?: number; concurrency?: number; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 40_000);
  const head = (await getState(db, "events:head")) || undefined;
  const raw = await getState(db, "events:pending");
  let pending: { top: string | null; before?: string } = raw ? JSON.parse(raw) : { top: null };
  let txs = 0, events = 0;
  for (let page = 0; page < (opts.maxPages ?? 5) && Date.now() < deadline; page++) {
    const sigs = await rpc<SigInfo[]>("getSignaturesForAddress", [RING_PROGRAM, { limit: 1000, ...(pending.before ? { before: pending.before } : {}), ...(head ? { until: head } : {}), commitment: "confirmed" }]);
    if (!sigs.length) { if (pending.top) pending.before = "__done__"; break; } // nothing new, or the window is fully walked
    pending.top ??= sigs[0].signature;
    const r = await processSignatures(db, rpc, sigs, opts.concurrency ?? 4, deadline);
    txs += r.txs; events += r.events;
    if (!r.complete) break; // out of time mid-page: the page is re-done next run (inserts are idempotent)
    pending.before = sigs.at(-1)!.signature;
    if (!head || sigs.length < 1000) { pending = { top: pending.top, before: "__done__" }; break; } // first run: one page; history comes from backfillHistory
    await setState(db, "events:pending", JSON.stringify(pending));
  }
  if (pending.before === "__done__") {
    if (pending.top) await setState(db, "events:head", pending.top);
    await setState(db, "events:pending", "");
    if (!(await getState(db, "events:tail")) && pending.top) await setState(db, "events:tail", pending.top);
  } else if (pending.top) {
    await setState(db, "events:pending", JSON.stringify(pending));
  }
  return { txs, events, windowDone: pending.before === "__done__" };
}

/** Walk back from the oldest processed signature to the Ring mainnet launch. Resumable. */
export async function backfillHistory(db: Db, rpc: RpcFn, opts: { maxTx?: number; concurrency?: number; onProgress?: (p: { txs: number; events: number; oldest: string }) => void } = {}) {
  if ((await getState(db, "events:tail")) === "done") return { txs: 0, events: 0, done: true };
  let before = (await getState(db, "events:tail")) ?? undefined;
  let txs = 0, events = 0;
  while (txs < (opts.maxTx ?? Infinity)) {
    const sigs = await rpc<SigInfo[]>("getSignaturesForAddress", [RING_PROGRAM, { limit: 1000, ...(before ? { before } : {}), commitment: "confirmed" }]);
    if (!before && sigs[0]) await setState(db, "events:head", (await getState(db, "events:head")) ?? sigs[0].signature);
    const inRange = sigs.filter((s) => !s.blockTime || s.blockTime * 1000 >= RING_MAINNET_START);
    const r = await processSignatures(db, rpc, inRange, opts.concurrency ?? 4);
    txs += r.txs; events += r.events;
    if (!sigs.length || inRange.length < sigs.length) { await setState(db, "events:tail", "done"); return { txs, events, done: true }; }
    before = sigs.at(-1)!.signature;
    await setState(db, "events:tail", before);
    opts.onProgress?.({ txs, events, oldest: before });
  }
  return { txs, events, done: false };
}
