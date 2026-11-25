// TypeScript port of crypsis-brief/kit/ascii/src/crypsis-ascii.mjs — procedural ASCII engine.
// RULE: math is copied 1:1 (same operations, same order). lib/ascii/engine.test.ts is a golden test
// against kit/ascii/frames/*.json with zero tolerance. Do not "clean up" expressions here.
// Zero dependencies; runs in the browser, in workers and on the server.
//
// Every field returns { cols, rows, lum: Float32Array } where lum[i] in [0..1] is the ink density
// of a cell (0 = empty). toLines() maps a field to text using a density ramp.

export interface Field {
  cols: number;
  rows: number;
  lum: Float32Array;
  cover?: Float32Array;
}

export const RAMP = " .:-=+*#%@"; // 10 levels, light -> dense
/** Speckled ramp for the camouflage background (no horizontal strokes, so it never reads as scanlines) */
export const CAMO_RAMP = " .:;+*";
/** Same-density alternates for the live "shimmer" (a cell may swap glyphs inside its level) */
export const RAMP_ALTS: readonly (readonly string[])[] = [
  [" "],
  [".", "`", "'"],
  [":", ",", ";"],
  ["-", "~", "\""],
  ["=", "+", "r", "c"],
  ["+", "*", "x", "v"],
  ["*", "#", "k", "X"],
  ["#", "%", "Q", "B"],
  ["%", "&", "8", "B"],
  ["@", "M", "W", "#"],
];
/** Glyphs used for "encrypted" placeholders (amounts before unlock, ciphertext lens) */
export const CIPHER_GLYPHS = "0123456789abcdef#%&*+=/\\<>[]{}";

const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// 1. Butterfly
// ---------------------------------------------------------------------------
// Wing silhouette: polar radius around the wing root as a sum of super-gaussian
// lobes. phi is measured from the outward horizontal axis, positive = up.
interface Lobe { a: number; c: number; s: number; p: number }
const FORE: Lobe = { a: 1.0, c: 31 * DEG, s: 29 * DEG, p: 3.0 };
const HIND: Lobe = { a: 0.72, c: -42 * DEG, s: 29 * DEG, p: 2.4 };
const TAIL: Lobe = { a: 0.86, c: -79 * DEG, s: 5.5 * DEG, p: 2.0 };
const lobe = (L: Lobe, phi: number) => L.a * Math.exp(-Math.pow(Math.abs(phi - L.c) / L.s, L.p) * 0.5);

export type WingPart = "fore" | "hind";

export function wingRadius(phi: number, part: WingPart, tail = true): number {
  if (part === "fore") {
    if (phi < -12 * DEG || phi > 96 * DEG) return 0;
    let r = lobe(FORE, phi);
    // straighter leading edge + slightly hooked apex
    r *= 1 + 0.07 * Math.sin((phi - 10 * DEG) * 3.0);
    return Math.max(r, 0.1);
  }
  if (phi > 14 * DEG || phi < -98 * DEG) return 0;
  let r = lobe(HIND, phi);
  if (tail) r = Math.max(r, lobe(TAIL, phi));
  // scalloped outer margin
  r *= 1 + 0.035 * Math.cos(phi * 15);
  return Math.max(r, 0.1);
}

/** Ink density of the wing surface at wing-local (x >= 0 outward, y up). */
export function wingInk(x: number, y: number, part: WingPart, tail = true): number {
  const r = Math.hypot(x, y);
  const phi = Math.atan2(y, x);
  const R = wingRadius(phi, part, tail);
  if (R <= 0 || r > R) return -1; // outside
  const u = r / R; // 0 root .. 1 edge
  // smooth fill: dense at the root, lighter towards the middle
  let ink = 0.46 + 0.4 * (1 - smooth(0.05, 0.6, u));

  // a few strong veins (wide enough to survive at ~1 cell)
  const veins = part === "fore" ? [8, 24, 40, 58] : [-14, -34, -56];
  let vein = 0;
  for (const v of veins) {
    const d = Math.abs(phi - v * DEG) * r;
    vein = Math.max(vein, Math.exp(-(d * d) / 0.0009));
  }
  ink *= 1 - 0.5 * vein * smooth(0.12, 0.3, u) * (1 - smooth(0.78, 0.84, u));

  // dense margin band with large pale spots
  const band = smooth(0.78, 0.84, u);
  if (band > 0) {
    const spotsN = part === "fore" ? 6 : 5;
    const k = (phi * spotsN) / (Math.PI / 2);
    const spot = Math.exp(-Math.pow((k - Math.round(k)) / 0.2, 2)) * Math.exp(-Math.pow((u - 0.91) / 0.04, 2));
    ink = ink * (1 - band) + band * (1.0 - 0.9 * spot);
  }

  if (part === "fore") {
    // pale bar across the outer third
    const bar = Math.exp(-Math.pow((u - 0.66) / 0.06, 2)) * smooth(18 * DEG, 30 * DEG, phi) * (1 - smooth(62 * DEG, 72 * DEG, phi));
    ink *= 1 - 0.75 * bar;
  } else {
    // eyespot
    const ea = -40 * DEG, er = 0.52 * wingRadius(ea, "hind", tail);
    const d = Math.hypot(x - Math.cos(ea) * er, y - Math.sin(ea) * er) / 0.13;
    if (d < 1.15) ink = d < 0.38 ? 1.0 : d < 0.66 ? 0.1 : d < 1.0 ? 0.95 : ink * 0.6;
  }
  return clamp01(ink);
}

// Body billboard (thorax, abdomen, head, antennae) in the z=0 plane.
const ANT: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push([0.02 + 0.1 * t + 0.06 * t * t, 0.2 + 0.6 * t - 0.04 * t * t * t]);
  }
  return pts;
})();
export function bodyInk(x: number, y: number): number {
  const ax = Math.abs(x);
  const e = (cx: number, cy: number, rx: number, ry: number) => ((ax - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  if (e(0, 0.17, 0.042, 0.042) <= 1) return 1; // head
  if (e(0, 0.04, 0.05, 0.13) <= 1) return 0.95; // thorax
  const ab = e(0, -0.28, 0.038, 0.28);
  if (ab <= 1) {
    const seg = 0.5 + 0.5 * Math.cos((y + 0.28) * 70);
    return 0.75 + 0.25 * seg; // segmented abdomen
  }
  if (y > 0.18 && y < 0.8 && ax < 0.36) {
    let dmin = 1;
    for (const [px, py] of ANT) dmin = Math.min(dmin, Math.hypot(ax - px, y - py));
    if (dmin < 0.011) return 0.85;
    const [cx, cy] = ANT[ANT.length - 1];
    if (Math.hypot(ax - cx, y - cy) < 0.028) return 1; // club
  }
  return -1;
}

/** Flap angle (radians) for loop phase t in [0,1). Fast down-stroke, slower up-stroke. */
export function flapAngle(t: number, lo = -16, hi = 74): number {
  const w = t + 0.1 * Math.sin(2 * Math.PI * t);
  const f = 0.5 - 0.5 * Math.cos(2 * Math.PI * w);
  return (lo + (hi - lo) * f) * DEG;
}

export interface ButterflyOptions {
  /** grid size */
  cols?: number;
  rows?: number;
  /** glyph cell width / height (Geist Mono at line-height 1 ~= 0.6) */
  cellAspect?: number;
  /** world units -> fraction of rows (1 = wings fill the height) */
  scale?: number;
  /** camera tilt in degrees (positive = seen from above) */
  tilt?: number;
  /** rotation around the vertical axis in degrees */
  yaw?: number;
  /** supersampling per axis (2 = 4 samples per cell) */
  ss?: number;
  /** override flap angle in degrees (e.g. 89 = closed, "hidden") */
  flap?: number | null;
  tail?: boolean;
  /** centre of the butterfly in cells (defaults to grid centre) */
  cx?: number;
  cy?: number;
}

interface Plane { p0: Vec3; u: Vec3; v: Vec3; n: Vec3; part?: WingPart; side?: number; nz?: Vec3 }

/** Render the butterfly into a cell field. `t` is the loop phase 0..1. */
export function butterflyField(t: number, o: ButterflyOptions = {}): Field & { cover: Float32Array } {
  const cols = o.cols ?? 120, rows = o.rows ?? 54;
  const aspect = o.cellAspect ?? 0.6;
  const ss = o.ss ?? 2;
  const tilt = (o.tilt ?? 16) * DEG;
  const yaw = (o.yaw ?? 0) * DEG;
  const tail = o.tail ?? true;
  const D = 4.2; // camera distance
  const k = (rows / 2.25) * (o.scale ?? 1); // cells per world unit (vertical)
  const cx = o.cx ?? cols / 2, cy = o.cy ?? rows * 0.5;
  const bob = 0.035 * Math.sin(2 * Math.PI * (t + 0.25));
  const th = o.flap != null ? o.flap * DEG : flapAngle(t);
  const thH = o.flap != null ? o.flap * DEG : flapAngle((t - 0.035 + 1) % 1); // hindwing lags

  // world -> view rotation: yaw (around y) then tilt (around x)
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const toView = ([x, y, z]: Vec3): Vec3 => {
    const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
    return [x1, y * ct - z1 * st, y * st + z1 * ct];
  };
  // planes: [origin, u (wing outward), v (wing up), part, side]
  const planes: Plane[] = [];
  for (const side of [1, -1]) {
    for (const [part, a] of [["fore", th], ["hind", thH]] as [WingPart, number][]) {
      const u = toView([side * Math.cos(a), 0, Math.sin(a)]);
      const v = toView([0, 1, 0]);
      const p0 = toView([side * 0.02, bob, 0]);
      const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      planes.push({ p0, u, v, n, part, side, nz: n });
    }
  }
  const bodyP: Plane = { p0: toView([0, bob, 0]), u: toView([1, 0, 0]), v: toView([0, 1, 0]), n: [0, 0, 0] };
  bodyP.n = [bodyP.u[1] * bodyP.v[2] - bodyP.u[2] * bodyP.v[1], bodyP.u[2] * bodyP.v[0] - bodyP.u[0] * bodyP.v[2], bodyP.u[0] * bodyP.v[1] - bodyP.u[1] * bodyP.v[0]];
  const L = (() => { const l = [0.35, 0.55, -1]; const m = Math.hypot(...l); return l.map((c) => c / m) as Vec3; })();

  const lum = new Float32Array(cols * rows);
  const cover = new Float32Array(cols * rows);
  const O: Vec3 = [0, 0, -D];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const hit = (P: Plane, d: Vec3) => {
    const den = dot(P.n, d);
    if (Math.abs(den) < 1e-6) return null;
    const lam = (dot(P.n, P.p0) - dot(P.n, O)) / den;
    if (lam <= 0) return null;
    const q: Vec3 = [O[0] + lam * d[0] - P.p0[0], O[1] + lam * d[1] - P.p0[1], O[2] + lam * d[2] - P.p0[2]];
    return { lam, x: dot(q, P.u), y: dot(q, P.v) };
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let acc = 0, cov = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = c + (sx + 0.5) / ss, py = r + (sy + 0.5) / ss;
        const X = ((px - cx) * aspect) / k, Y = -(py - cy) / k;
        const d: Vec3 = [X, Y, D];
        let best = 1e9, ink = -1, bodyHit = false;
        const b = hit(bodyP, d);
        if (b) { const bi = bodyInk(b.x, b.y); if (bi >= 0) { best = b.lam - 0.002; ink = bi; bodyHit = true; } }
        for (const P of planes) {
          const h = hit(P, d);
          if (!h || h.x < 0 || (ink >= 0 && bodyHit) || h.lam >= best) continue;
          const wi = wingInk(h.x, h.y, P.part!, tail);
          if (wi < 0) continue;
          const lamb = Math.abs(dot(P.n, L));
          best = h.lam; ink = wi * (0.42 + 0.58 * lamb);
        }
        if (ink >= 0) { acc += ink; cov += 1; }
      }
      const n = ss * ss;
      lum[r * cols + c] = acc / n;
      cover[r * cols + c] = cov / n;
    }
  }
  return { cols, rows, lum, cover };
}

// ---------------------------------------------------------------------------
// 2. Ring (torus) — the "globe" of the 0xLayer layout, in our language
// ---------------------------------------------------------------------------
export interface RingOptions { cols?: number; rows?: number; cellAspect?: number; thickness?: number; scale?: number }
export function ringField(t: number, o: RingOptions = {}): Field {
  const cols = o.cols ?? 90, rows = o.rows ?? 44, aspect = o.cellAspect ?? 0.6;
  const R = 1, r = o.thickness ?? 0.36;
  const A = 2 * Math.PI * t + 0.9, B = 0.55 + 0.25 * Math.sin(2 * Math.PI * t);
  const k = (rows / 3.0) * (o.scale ?? 1);
  const lum = new Float32Array(cols * rows), zb = new Float32Array(cols * rows).fill(-1e9);
  const cA = Math.cos(A), sA = Math.sin(A), cB = Math.cos(B), sB = Math.sin(B);
  const L = [0.0, 0.7, -0.7];
  const stepU = 0.012, stepV = 0.03;
  for (let u = 0; u < 2 * Math.PI; u += stepU) {
    const cu = Math.cos(u), su = Math.sin(u);
    for (let v = 0; v < 2 * Math.PI; v += stepV) {
      const cv = Math.cos(v), sv = Math.sin(v);
      // torus around z axis, then rotate x by B, then y by A
      let x = (R + r * cv) * cu, y = (R + r * cv) * su, z = r * sv;
      let nx = cv * cu, ny = cv * su, nz = sv;
      [y, z] = [y * cB - z * sB, y * sB + z * cB];
      [ny, nz] = [ny * cB - nz * sB, ny * sB + nz * cB];
      [x, z] = [x * cA + z * sA, -x * sA + z * cA];
      [nx, nz] = [nx * cA + nz * sA, -nx * sA + nz * cA];
      const ooz = 1 / (z + 5);
      const col = Math.floor(cols / 2 + (x * 5 * ooz * k) / aspect);
      const row = Math.floor(rows / 2 - y * 5 * ooz * k);
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      const i = row * cols + col;
      if (ooz > zb[i]) {
        zb[i] = ooz;
        const l = nx * L[0] + ny * L[1] + nz * L[2];
        // engraved "data" stripes around the tube
        const stripe = 0.82 + 0.18 * Math.sign(Math.sin(u * 48));
        lum[i] = clamp01((0.18 + 0.82 * Math.max(0, l)) * stripe);
      }
    }
  }
  return { cols, rows, lum };
}

// ---------------------------------------------------------------------------
// 3. Chrysalis — static, for the Launch section / empty states
// ---------------------------------------------------------------------------
export interface ChrysalisOptions { cols?: number; rows?: number; cellAspect?: number }
export function chrysalisField(o: ChrysalisOptions = {}): Field {
  const cols = o.cols ?? 40, rows = o.rows ?? 44, aspect = o.cellAspect ?? 0.6;
  const lum = new Float32Array(cols * rows);
  const top = 0.12, bot = 0.95; // fraction of rows
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const y = (r + 0.5) / rows, x = ((c + 0.5 - cols / 2) * aspect) / rows;
    // silk stalk
    if (y < top && Math.abs(x) < 0.008) { lum[r * cols + c] = 0.55; continue; }
    if (y < top || y > bot) continue;
    const s = (y - top) / (bot - top); // 0..1 along body
    const w = 0.15 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08)), 0.75) * (1 + 0.12 * Math.sin(s * 9)) * (1 - 0.35 * s);
    if (Math.abs(x) > w) continue;
    const nx = x / Math.max(w, 1e-3); // -1..1 across
    const shade = Math.sqrt(1 - nx * nx) * (0.55 + 0.45 * Math.max(0, -nx * 0.6 + 0.6));
    let ink = 0.25 + 0.7 * shade;
    // segment rings + gold-dot band
    ink *= 0.85 + 0.15 * Math.cos(s * 38);
    if (Math.abs(s - 0.34) < 0.018) ink = Math.abs(Math.sin(nx * 9)) > 0.6 ? 1 : 0.2;
    lum[r * cols + c] = clamp01(ink);
  }
  return { cols, rows, lum };
}

// ---------------------------------------------------------------------------
// 4. Camouflage field — the hero background ("crypsis")
// ---------------------------------------------------------------------------
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
export interface CamoOptions { cols?: number; rows?: number; cellAspect?: number; scale?: number }
/** Bark/lichen-like density field; slow drift with time t (seconds). */
export function camoField(tSec: number, o: CamoOptions = {}): Field {
  const cols = o.cols ?? 160, rows = o.rows ?? 60, aspect = o.cellAspect ?? 0.6;
  const lum = new Float32Array(cols * rows);
  const sc = o.scale ?? 0.055;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * aspect * sc, y = r * sc;
    const wx = fbm(x + 0.03 * tSec, y) * 2.2, wy = fbm(x + 5.2, y + 1.3 - 0.02 * tSec) * 2.2;
    const n = fbm(x + wx, y + wy);
    lum[r * cols + c] = clamp01((n - 0.32) * 1.9);
  }
  return { cols, rows, lum };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function lumToIndex(l: number, ramp: string = RAMP, gamma = 0.9): number {
  if (l <= 0.02) return 0;
  return Math.min(ramp.length - 1, Math.max(1, Math.round(Math.pow(l, gamma) * (ramp.length - 1))));
}
export function toLines(field: Field, ramp: string = RAMP, gamma = 0.9): string[] {
  const out: string[] = [];
  for (let r = 0; r < field.rows; r++) {
    let s = "";
    for (let c = 0; c < field.cols; c++) s += ramp[lumToIndex(field.lum[r * field.cols + c], ramp, gamma)];
    out.push(s.replace(/\s+$/, ""));
  }
  return out;
}
/** Trim empty rows/cols around a field (keeps alignment metadata). */
export function trimLines(lines: string[]): string[] {
  let top = 0, bot = lines.length - 1;
  while (top < bot && !lines[top].trim()) top++;
  while (bot > top && !lines[bot].trim()) bot--;
  const body = lines.slice(top, bot + 1);
  const left = Math.min(...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return body.map((l) => l.slice(left));
}
