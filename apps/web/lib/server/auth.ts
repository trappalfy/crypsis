import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison of a presented secret with the expected one (brief §10). */
export function secretMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  return h.startsWith("Bearer ") ? h.slice(7) : h;
}
