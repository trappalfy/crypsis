// Fixed-window in-memory rate limit per key (per server instance). For multi-instance production,
// back it with a shared store (e.g. Vercel KV / Upstash) — TODO(OWNER) if abuse appears.
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  if (b.n >= limit) return false;
  b.n++;
  return true;
}
export function clientKey(req: Request): string {
  // used only as an in-memory bucket key; never logged or stored
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
}
