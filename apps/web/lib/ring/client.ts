"use client";
// UI-thread handle to ring.worker.ts. Lazily created; the SDK is never in the main bundle.
import type { RingRequest, RingResponse } from "./protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error & { code?: string }) => void };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./ring.worker.ts", import.meta.url), { type: "module", name: "crypsis-ring" });
  worker.onmessage = (ev: MessageEvent<RingResponse>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.ok) p.resolve(ev.data.result);
    else p.reject(Object.assign(new Error(ev.data.error.message), ev.data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(Object.assign(new Error(e.message || "Ring worker crashed"), { code: "WORKER" }));
    pending.clear();
  };
  return worker;
}

type Method = RingRequest["method"];
type ParamsOf<M extends Method> = Extract<RingRequest, { method: M }>["params"];

export function callRing<T, M extends Method = Method>(method: M, params: ParamsOf<M>, transfer: Transferable[] = []): Promise<T> {
  const id = ++seq;
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, method, params } as RingRequest, transfer);
  });
}

/** Lock: ask the worker to destroy (zero) its keys, then kill it. Never waits more than `ms`. */
export async function lockRing(ms = 300): Promise<void> {
  if (worker) {
    const w = worker;
    await Promise.race([callRing("lock", {}).catch(() => null), new Promise((r) => setTimeout(r, ms))]);
    if (worker === w) terminateRing();
  }
}

/** Fire-and-forget lock for pagehide: post "lock" (zeroes keys) and terminate right away. */
export function lockRingNow() {
  try { worker?.postMessage({ id: -1, method: "lock", params: {} }); } catch {}
  terminateRing();
}

/** Kill the worker: drops every key and decrypted state it held. */
export function terminateRing() {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(Object.assign(new Error("locked"), { code: "LOCKED" }));
  pending.clear();
}
