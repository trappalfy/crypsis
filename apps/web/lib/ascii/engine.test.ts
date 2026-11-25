// Golden test (brief §7.4): the TS port must reproduce kit/ascii/frames byte for byte. Tolerance: 0.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { butterflyField, chrysalisField, ringField, toLines, trimLines, RAMP } from "./engine";

const frames = (name: string) => JSON.parse(readFileSync(new URL(`./frames/${name}`, import.meta.url), "utf8")) as { cols: number; rows: number; ramp: string; frames: string[] };
const text = (name: string) => readFileSync(new URL(`./frames/${name}`, import.meta.url), "utf8");
// The kit originals, to prove the copies in lib/ascii/frames were not edited either. The brief kit is kept
// out of the public repository, so this check runs only where the kit is on disk.
const KIT = new URL("../../../../crypsis-brief/kit/ascii/frames/", import.meta.url);
const kit = (name: string) => readFileSync(new URL(name, KIT), "utf8");

const diffCount = (a: string, b: string) => { let d = Math.abs(a.length - b.length); for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++; return d; };

describe("ASCII engine golden frames (0 differences)", () => {
  it.skipIf(!existsSync(KIT))("frame copies equal kit originals (local only)", () => {
    for (const f of ["butterfly-md.json", "ring.json", "chrysalis.json", "butterfly-sm.json", "butterfly-hero.json", "butterfly-hero-close.json", "butterfly-hero-open.txt", "butterfly-md-open.txt", "butterfly-sm-open.txt", "chrysalis.txt"])
      expect(text(f)).toBe(kit(f));
  });

  for (const [name, cols, rows] of [["butterfly-md", 110, 46], ["butterfly-sm", 56, 24], ["butterfly-hero", 180, 76]] as const) {
    it(`${name}.json — 36 flap frames`, () => {
      const j = frames(`${name}.json`);
      expect(j.ramp).toBe(RAMP);
      expect(j.frames).toHaveLength(36);
      let total = 0;
      for (let i = 0; i < 36; i++) total += diffCount(toLines(butterflyField(i / 36, { cols, rows })).join("\n"), j.frames[i]);
      expect(total).toBe(0);
    });
    it(`${name}-open.txt — static open wings`, () => {
      expect(trimLines(toLines(butterflyField(0, { cols, rows, flap: 2 }))).join("\n") + "\n").toBe(text(`${name}-open.txt`));
    });
  }

  it("butterfly-hero-close.json — 13 closing frames", () => {
    const j = frames("butterfly-hero-close.json");
    let total = 0;
    for (let i = 0; i <= 12; i++) total += diffCount(toLines(butterflyField(0, { cols: 180, rows: 76, flap: 2 + (87 * i) / 12 })).join("\n"), j.frames[i]);
    expect(total).toBe(0);
  });

  it("ring.json — 72 frames", () => {
    const j = frames("ring.json");
    let total = 0;
    for (let i = 0; i < 72; i++) total += diffCount(toLines(ringField(i / 72, { cols: 96, rows: 44 })).join("\n"), j.frames[i]);
    expect(total).toBe(0);
  });

  it("chrysalis.json + chrysalis.txt", () => {
    const j = frames("chrysalis.json");
    expect(toLines(chrysalisField({ cols: 40, rows: 44 })).join("\n")).toBe(j.frames[0]);
    expect(trimLines(toLines(chrysalisField({ cols: 40, rows: 44 }))).join("\n") + "\n").toBe(text("chrysalis.txt"));
  });
});
