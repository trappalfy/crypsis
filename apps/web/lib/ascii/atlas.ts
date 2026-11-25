// Glyph atlas for canvas ASCII rendering (as in kit/hero-prototype): every glyph is drawn once per
// colour into an offscreen canvas, then cells are blitted with drawImage.
import { CAMO_RAMP, CIPHER_GLYPHS, RAMP } from "./engine";

export const ALL_GLYPHS = Array.from(new Set((RAMP + CAMO_RAMP + CIPHER_GLYPHS).split(""))).filter((g) => g !== " ");

export interface Atlas {
  canvas: HTMLCanvasElement;
  cw: number;
  ch: number;
  fs: number;
  dpr: number;
  index: Map<string, number>;
  colors: number;
}

/** Resolve the real family name behind a next/font CSS variable (canvas can't read CSS vars). */
export function monoFamily(): string {
  if (typeof document === "undefined") return "monospace";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim();
  return v || '"Geist Mono", ui-monospace, monospace';
}

export function buildAtlas(fs: number, colors: readonly string[], dpr: number, glyphs: readonly string[] = ALL_GLYPHS): Atlas {
  const family = monoFamily();
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `500 ${fs}px ${family}`;
  const cw = probe.measureText("M").width;
  const ch = fs;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(glyphs.length * cw * dpr) + 4;
  canvas.height = Math.ceil(colors.length * ch * dpr) + 4;
  const a = canvas.getContext("2d")!;
  a.scale(dpr, dpr);
  a.font = `500 ${fs}px ${family}`;
  a.textBaseline = "top";
  colors.forEach((col, row) => {
    a.fillStyle = col;
    glyphs.forEach((g, i) => a.fillText(g, i * cw, row * ch + fs * 0.08));
  });
  return { canvas, cw, ch, fs, dpr, index: new Map(glyphs.map((g, i) => [g, i])), colors: colors.length };
}

export function blit(ctx: CanvasRenderingContext2D, at: Atlas, g: string, colorRow: number, c: number, r: number) {
  const i = at.index.get(g);
  if (i === undefined) return;
  const { cw, ch, dpr } = at;
  ctx.drawImage(at.canvas, i * cw * dpr, colorRow * ch * dpr, cw * dpr, ch * dpr, c * cw * dpr, r * ch * dpr, cw * dpr, ch * dpr);
}

/** Cheap deterministic per-cell noise (same as the prototype). */
export const cellNoise = (c: number, r: number) => {
  const x = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
