import { describe, expect, it } from "vitest";
import { accessToken, gateMode, gatePage, isExempt, safeNext, sameToken } from "./access-gate";

describe("access gate", () => {
  it("is closed on Vercel without a key (fail-closed), open locally, keyed with a key, open when public", () => {
    expect(gateMode({ VERCEL: "1" })).toBe("closed");
    expect(gateMode({ VERCEL: "1", SITE_ACCESS_KEY: "short" })).toBe("closed");
    expect(gateMode({ VERCEL: "1", SITE_ACCESS_KEY: "a-long-enough-key-123" })).toBe("key");
    expect(gateMode({ VERCEL: "1", SITE_ACCESS_KEY: "a-long-enough-key-123", SITE_PUBLIC: "true" })).toBe("open");
    expect(gateMode({})).toBe("open");
    expect(gateMode({ SITE_ACCESS_KEY: "a-long-enough-key-123" })).toBe("key");
  });
  it("only exempts the machine endpoints that carry their own secrets", () => {
    expect(isExempt("/api/cron/snapshot")).toBe(true);
    expect(isExempt("/api/webhooks/helius")).toBe(true);
    for (const p of ["/", "/tracker", "/api/coins", "/api/slot", "/_next/static/x.js", "/robots.txt", "/opengraph-image", "/api/cron/snapshot/x"]) expect(isExempt(p)).toBe(false);
  });
  it("redirects only to same-site paths", () => {
    expect(safeNext("/tracker?sort=share")).toBe("/tracker?sort=share");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, 42]) expect(safeNext(bad)).toBe("/");
  });
  it("derives a stable token per key and compares exactly", async () => {
    const a = await accessToken("a-long-enough-key-123");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await accessToken("a-long-enough-key-123")).toBe(a);
    expect(sameToken(a, await accessToken("a-long-enough-key-124"))).toBe(false);
    expect(sameToken(a, a)).toBe(true);
    expect(sameToken(a, a.slice(1))).toBe(false);
  });
  it("gate page names nothing about the site and escapes the next path", () => {
    const html = gatePage({ mode: "key", next: '/x"><script>alert(1)</script>' });
    expect(html.toLowerCase()).not.toMatch(/crypsis|pump|helius|ring|solana|privacy/);
    expect(html).not.toContain("<script>");
    expect(gatePage({ mode: "closed", next: "/" })).not.toContain("<form");
  });
});
