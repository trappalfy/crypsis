import { describe, expect, it, vi } from "vitest";
import { retryingFetch } from "./retry-fetch";

const res = (status: number, headers: Record<string, string> = {}) => new Response(status === 204 ? null : "x", { status, headers });
const noSleep = () => {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => { waits.push(ms); } };
};

describe("retryingFetch (Helius 429 / transient failures)", () => {
  it("retries a rate-limited request and returns the eventual success", async () => {
    const base = vi.fn().mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const { waits, sleep } = noSleep();
    const r = await retryingFetch(base, { sleep, random: () => 0.5 })("https://rpc", { method: "POST", body: "{}" });
    expect(r.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0]); // exponential backoff
  });
  it("honours Retry-After (seconds), capped", async () => {
    const base = vi.fn().mockResolvedValueOnce(res(429, { "retry-after": "2" })).mockResolvedValueOnce(res(429, { "retry-after": "60" })).mockResolvedValueOnce(res(200));
    const { waits, sleep } = noSleep();
    await retryingFetch(base, { sleep, maxMs: 4000 })("https://rpc");
    expect(waits).toEqual([2000, 4000]);
  });
  it("gives up after the retry budget and returns the last response", async () => {
    const base = vi.fn().mockResolvedValue(res(429));
    const { sleep } = noSleep();
    const r = await retryingFetch(base, { sleep, retries: 3 })("https://rpc");
    expect(r.status).toBe(429);
    expect(base).toHaveBeenCalledTimes(4);
  });
  it("does not retry real refusals or client errors (403 domain rule, 400, 404, 500)", async () => {
    for (const s of [400, 403, 404, 500]) {
      const base = vi.fn().mockResolvedValue(res(s));
      const r = await retryingFetch(base, noSleep())("https://rpc");
      expect(r.status).toBe(s);
      expect(base).toHaveBeenCalledTimes(1);
    }
  });
  it("retries a network error but never an abort", async () => {
    const base = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(res(200));
    expect((await retryingFetch(base, noSleep())("https://rpc")).status).toBe(200);
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const base2 = vi.fn().mockRejectedValue(abort);
    await expect(retryingFetch(base2, noSleep())("https://rpc")).rejects.toBe(abort);
    expect(base2).toHaveBeenCalledTimes(1);
  });
  it("re-sends a Request body on every attempt", async () => {
    const bodies: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => { bodies.push(await (input as Request).text()); return bodies.length < 2 ? res(429) : res(200); });
    await retryingFetch(base as never, noSleep())(new Request("https://rpc", { method: "POST", body: '{"method":"getSlot"}' }));
    expect(bodies).toEqual(['{"method":"getSlot"}', '{"method":"getSlot"}']);
  });
});
