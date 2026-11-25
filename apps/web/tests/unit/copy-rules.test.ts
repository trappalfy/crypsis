// Brief §0/§1/§10: no "audited" claims, no project token, no airdrops/points, no "build in public", no invented tickers.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SCAN = ["app", "components", "lib"];
const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) { if (!["frames", "node_modules"].includes(f)) walk(p); }
  else if (/\.(tsx?|css|md)$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p);
});
SCAN.forEach((d) => walk(join(ROOT, d)));

describe("copy rules", () => {
  it("scans files", () => expect(files.length).toBeGreaterThan(20));
  it("never claims an audit (only the honest FAQ line)", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8").replace(/Is Crypsis audited\?/g, "").replace(/Crypsis has not been audited/g, "").replace(/never claim 'audited'/g, "");
      expect(s, f).not.toMatch(/\baudited\b|secure by audit/i);
    }
  });
  it("no project token, airdrop, points, build-in-public", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/\$CRYPSIS|airdrop|\bpoints program\b|build in public/i);
    }
  });
});
