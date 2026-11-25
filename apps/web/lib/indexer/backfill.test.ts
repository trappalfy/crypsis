// catchUpHead cursor logic against a fake RPC + in-memory state (no network, no database).
import { describe, expect, it, vi } from "vitest";

const state = new Map<string, string>();
vi.mock("./store", () => ({
  getState: async (_db: unknown, k: string) => state.get(k) ?? null,
  setState: async (_db: unknown, k: string, v: string) => { state.set(k, v); },
  insertEvents: async () => 0,
}));
const { catchUpHead } = await import("./backfill");

// newest first, like getSignaturesForAddress
const chain = (n: number) => Array.from({ length: n }, (_, i) => ({ signature: `s${n - i}`, slot: n - i, blockTime: null, err: null }));
function fakeRpc(all: ReturnType<typeof chain>, onGetTx?: () => void) {
  return (async (method: string, params: unknown[]) => {
    if (method === "getTransaction") { onGetTx?.(); return null; }
    const o = params[1] as { limit: number; before?: string; until?: string };
    let list = all;
    if (o.before) list = list.slice(list.findIndex((x) => x.signature === o.before) + 1);
    if (o.until) { const u = list.findIndex((x) => x.signature === o.until); if (u >= 0) list = list.slice(0, u); }
    return list.slice(0, o.limit);
  }) as never;
}

describe("catchUpHead", () => {
  it("first run takes one page and sets head = newest", async () => {
    state.clear();
    await catchUpHead({} as never, fakeRpc(chain(5)));
    expect(state.get("events:head")).toBe("s5");
  });
  it("no new signatures: head unchanged, no pending window", async () => {
    await catchUpHead({} as never, fakeRpc(chain(5)));
    expect(state.get("events:head")).toBe("s5");
    expect(state.get("events:pending") ?? "").toBe("");
  });
  it("a burst larger than one run is resumed, head moves only when the window is done", async () => {
    const all = chain(2505); // 2500 new since s5
    const r1 = await catchUpHead({} as never, fakeRpc(all), { maxPages: 1 });
    expect(r1.windowDone).toBe(false);
    expect(state.get("events:head")).toBe("s5"); // not moved yet: no gap
    expect(JSON.parse(state.get("events:pending")!).top).toBe("s2505");
    await catchUpHead({} as never, fakeRpc(all), { maxPages: 1 });
    const r3 = await catchUpHead({} as never, fakeRpc(all), { maxPages: 1 });
    expect(r3.windowDone).toBe(true);
    expect(state.get("events:head")).toBe("s2505");
    expect(state.get("events:pending")).toBe("");
  });
  it("running out of time mid-page keeps the window for the next run", async () => {
    state.set("events:head", "s10");
    state.set("events:pending", "");
    let calls = 0;
    const r = await catchUpHead({} as never, fakeRpc(chain(40), () => { calls++; }), { budgetMs: -1 });
    expect(r.windowDone).toBe(false);
    expect(calls).toBe(0);
    expect(state.get("events:head")).toBe("s10");
  });
});
