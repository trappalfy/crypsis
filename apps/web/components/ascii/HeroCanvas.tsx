"use client";
// Brief §5 S1 — port of crypsis-brief/kit/hero-prototype/index.html (canvas part). Same layers, same
// timeline, same per-cell rules; engine math untouched (lib/ascii/engine.ts, golden-tested).
// Layers: camouflage (camoField) -> butterfly (butterflyField) -> "viewing key" lens around the cursor.
// Timeline 13 s: REVEAL 1.6 -> FLY 9 -> HIDE 1.0 -> HIDDEN 1.4.
//
// Performance (budget ≤ 8 ms/frame, brief §5): versus the prototype this renderer
//  - caches butterfly fields per flap phase (a beat repeats every 1.5 s; 90 steps = 60 fps) and per
//    whole-degree flap angle, warming the cache in idle time;
//  - draws the camouflage into its own layer, double-buffered and rebuilt a few rows per frame;
//  - precomputes the per-cell reveal threshold once per layout;
//  - per frame touches only the butterfly box and the lens.
// Debug params (screenshots/tests): ?t=<sec> freezes a frame, &lens=x,y places the lens.
import { useEffect, useRef } from "react";
import { butterflyField, camoField, lumToIndex, RAMP, CAMO_RAMP, CIPHER_GLYPHS, type Field } from "@/lib/ascii/engine";
import { buildAtlas, blit, cellNoise, monoFamily, prefersReducedMotion, type Atlas } from "@/lib/ascii/atlas";

const COLORS = ["#FFFFFF", "rgba(255,255,255,0.2)", "rgba(17,16,16,0.5)"]; // art, camo, lens
const ORANGE = "#EC6C40";
const T_REVEAL = 1.6, T_FLY = 9, T_HIDE = 1.0, T_HIDDEN = 1.4, CYCLE = T_REVEAL + T_FLY + T_HIDE + T_HIDDEN;
const BEAT = 1.5; // seconds per wing beat
const PHASE_STEPS = 90; // = 60 fps over one beat
const LENS_R = 9;
const CAMO_EVERY = 0.12; // s
const CAMO_ROWS_PER_FRAME = 16;

interface HeroState { reveal: number; flap?: number; phase?: number }
export function heroStateAt(t: number): HeroState {
  const u = t % CYCLE;
  if (u < T_REVEAL) return { reveal: u / T_REVEAL, flap: 2 };
  if (u < T_REVEAL + T_FLY) return { reveal: 1, phase: ((u - T_REVEAL) / BEAT) % 1 };
  if (u < T_REVEAL + T_FLY + T_HIDE) { const k = (u - T_REVEAL - T_FLY) / T_HIDE; return { reveal: 1 - k, flap: 2 + 86 * Math.min(1, k * 1.4) }; }
  return { reveal: 0, flap: 88 };
}

declare global { interface Window { __heroPerf?: { frames: number; totalMs: number; maxMs: number } } }

export default function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const host = canvas.parentElement!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const reduce = prefersReducedMotion();
    const params = new URLSearchParams(location.search);
    const FIXED_T = params.has("t") ? parseFloat(params.get("t")!) : null;
    const animate = FIXED_T == null && !reduce;

    let W = 0, H = 0, fs = 0, cols = 0, rows = 0, mobile = false, dpr = 1;
    let at: Atlas | null = null;
    let mx = -1e9, my = -1e9;
    // butterfly box
    let bRows = 0, bCols = 0, ox = 0, oy = 0, scale = 1;
    let thresh = new Float32Array(0);
    const cache = new Map<string, Float32Array>();
    // camouflage layers (front is shown, back is being rebuilt)
    let camoFront: HTMLCanvasElement | null = null, camoBack: HTMLCanvasElement | null = null;
    let camo: Field | null = null, camoPending: Field | null = null, camoRow = 0, camoT = -1;
    let raf = 0, idle = 0, visible = true, onScreen = true, disposed = false;
    const perf = (window.__heroPerf = { frames: 0, totalMs: 0, maxMs: 0 });

    const fieldKey = (s: HeroState) => (s.phase != null ? `p${Math.round(s.phase * PHASE_STEPS) % PHASE_STEPS}` : `f${Math.round(s.flap!)}`);
    function fieldFor(key: string): Float32Array {
      let f = cache.get(key);
      if (!f) {
        const phase = key[0] === "p" ? Number(key.slice(1)) / PHASE_STEPS : 0;
        const flap = key[0] === "f" ? Number(key.slice(1)) : undefined;
        f = butterflyField(phase, { cols: bCols, rows: bRows, cellAspect: at!.cw / at!.ch, ss: 1, flap, scale }).lum;
        cache.set(key, f);
      }
      return f;
    }
    function warm(deadline?: IdleDeadline) {
      idle = 0;
      if (disposed || !at) return;
      const keys = ["f2", "f88", ...Array.from({ length: PHASE_STEPS }, (_, i) => `p${i}`), ...Array.from({ length: 87 }, (_, i) => `f${i + 2}`)];
      for (const k of keys) {
        if (cache.has(k)) continue;
        if (deadline && deadline.timeRemaining() < 8) break;
        fieldFor(k);
        if (!deadline) break;
      }
      if (cache.size < keys.length) idle = requestIdle(warm);
    }
    const hasIdle = typeof window.requestIdleCallback === "function";
    const requestIdle = (cb: (d?: IdleDeadline) => void): number =>
      hasIdle ? window.requestIdleCallback(cb, { timeout: 500 }) : (setTimeout(() => cb(), 50) as unknown as number);
    const cancelIdle = (id: number) => (hasIdle ? window.cancelIdleCallback(id) : clearTimeout(id));

    function makeLayer() {
      const c = document.createElement("canvas");
      c.width = canvas.width; c.height = canvas.height;
      return c;
    }
    function drawCamoRows(layer: HTMLCanvasElement, f: Field, r0: number, r1: number) {
      const lctx = layer.getContext("2d")!;
      for (let r = r0; r < r1; r++) for (let c = 0; c < cols; c++) {
        const gi = lumToIndex(f.lum[r * cols + c], CAMO_RAMP);
        if (gi > 0) blit(lctx, at!, CAMO_RAMP[gi], 1, c, r);
      }
    }

    function layout() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = host.clientWidth; H = host.clientHeight;
      mobile = W < 760;
      fs = mobile ? 8 : Math.max(9, Math.round(H / 82));
      at = buildAtlas(fs, COLORS, dpr);
      cols = Math.ceil(W / at.cw); rows = Math.ceil(H / at.ch);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      bRows = Math.floor(rows * (mobile ? 0.56 : 0.86));
      bCols = Math.min(cols, Math.floor(bRows * 2.4));
      ox = Math.floor((cols - bCols) / 2); oy = Math.floor(rows * (mobile ? 0.2 : 0.06));
      scale = mobile ? 0.95 : 1.2;
      cache.clear();
      // per-cell reveal threshold: from the body outwards, with grain (static per layout)
      const { cw, ch } = at;
      thresh = new Float32Array(bCols * bRows);
      for (let br = 0; br < bRows; br++) for (let bc = 0; bc < bCols; bc++) {
        const d = Math.hypot((bc - bCols / 2) * (cw / ch), br - bRows / 2) / (bRows * 0.62);
        thresh[br * bCols + bc] = d * 0.85 + cellNoise(bc + ox, br + oy) * 0.15;
      }
      camoFront = makeLayer(); camoBack = makeLayer();
      camo = null; camoPending = null;
      if (params.has("lens")) { const [x, y] = params.get("lens")!.split(",").map(Number); mx = x / at.cw; my = y / at.ch; }
    }

    function frame(now: number) {
      if (disposed || !at) return;
      const f0 = performance.now();
      const t = FIXED_T ?? now / 1000;
      const s: HeroState = reduce ? { reveal: 1, flap: 2 } : heroStateAt(t);
      const { cw, ch } = at;
      const asp2 = (cw / ch) ** 2;

      // camouflage: first build is synchronous, later builds go to the back buffer a few rows per frame
      if (!camo) {
        camo = camoField(reduce ? 0 : t, { cols, rows, cellAspect: cw / ch }); camoT = t;
        drawCamoRows(camoFront!, camo, 0, rows);
      } else if (animate && !camoPending && t - camoT > CAMO_EVERY) {
        camoPending = camoField(t, { cols, rows, cellAspect: cw / ch }); camoT = t; camoRow = 0;
        camoBack!.getContext("2d")!.clearRect(0, 0, camoBack!.width, camoBack!.height);
      } else if (camoPending) {
        const r1 = Math.min(rows, camoRow + CAMO_ROWS_PER_FRAME);
        drawCamoRows(camoBack!, camoPending, camoRow, r1);
        camoRow = r1;
        if (camoRow >= rows) { [camoFront, camoBack] = [camoBack, camoFront]; camo = camoPending; camoPending = null; }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = ORANGE; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(camoFront!, 0, 0);

      const lum = fieldFor(fieldKey(s));
      const lensOn = !reduce && mx > -1e8;
      const cellW = cw * dpr, cellH = ch * dpr;
      // 1) punch out every cell the butterfly or the lens will draw into (one path, one fill)
      const art: number[] = [];
      ctx.beginPath();
      for (let br = 0; br < bRows; br++) {
        const r = br + oy;
        for (let bc = 0; bc < bCols; bc++) {
          const i = br * bCols + bc;
          const l = lum[i];
          if (l <= 0.02) continue;
          const c = bc + ox;
          const inLens = lensOn && (c - mx) ** 2 * asp2 + (r - my) ** 2 < LENS_R * LENS_R;
          const v = inLens ? 1 : (s.reveal * 1.15 - thresh[i]) / 0.12;
          if (v <= 0) continue; // still camouflaged: the camo glyph stays
          art.push(c, r, v >= 1 ? lumToIndex(l) : -1);
          ctx.rect(c * cellW, r * cellH, cellW, cellH);
        }
      }
      const lensCells: number[] = [];
      if (lensOn) {
        const rx = Math.ceil(LENS_R / Math.sqrt(asp2)) + 1;
        for (let r = Math.max(0, Math.floor(my - LENS_R)); r <= Math.min(rows - 1, Math.ceil(my + LENS_R)); r++) {
          for (let c = Math.max(0, Math.floor(mx - rx)); c <= Math.min(cols - 1, Math.ceil(mx + rx)); c++) {
            if ((c - mx) ** 2 * asp2 + (r - my) ** 2 >= LENS_R * LENS_R) continue;
            const bc = c - ox, br = r - oy;
            if (bc >= 0 && bc < bCols && br >= 0 && br < bRows && lum[br * bCols + bc] > 0.02) continue; // butterfly cell
            ctx.rect(c * cellW, r * cellH, cellW, cellH);
            if (camo!.lum[r * cols + c] > 0.1) lensCells.push(c, r);
          }
        }
      }
      ctx.fillStyle = ORANGE;
      ctx.fill();
      // 2) glyphs
      for (let k = 0; k < art.length; k += 3) {
        const gi = art[k + 2];
        blit(ctx, at, gi >= 0 ? RAMP[gi] : CIPHER_GLYPHS[(Math.random() * CIPHER_GLYPHS.length) | 0], 0, art[k], art[k + 1]);
      }
      for (let k = 0; k < lensCells.length; k += 2) {
        const c = lensCells[k], r = lensCells[k + 1];
        blit(ctx, at, CIPHER_GLYPHS[(cellNoise(c + ((t * 8) | 0), r) * CIPHER_GLYPHS.length) | 0], 2, c, r);
      }

      const dt = performance.now() - f0;
      perf.frames++; perf.totalMs += dt; perf.maxMs = Math.max(perf.maxMs, dt);
      if (animate) schedule();
      else host.dataset.ready = "1";
    }
    const schedule = () => { if (animate && visible && onScreen && !raf) raf = requestAnimationFrame((n) => { raf = 0; frame(n); }); };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

    const onMove = (e: PointerEvent) => {
      if (!at) return;
      const b = host.getBoundingClientRect();
      mx = (e.clientX - b.left) / at.cw; my = (e.clientY - b.top) / at.ch;
      if (!animate) frame(performance.now());
    };
    const onLeave = () => { mx = my = -1e9; };
    const onVis = () => { visible = document.visibilityState === "visible"; if (visible) schedule(); else stop(); };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) schedule(); else stop(); });
    let resizeT = 0, lastW = 0;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = window.setTimeout(() => {
        if (host.clientWidth === lastW && Math.abs(host.clientHeight - H) < 120) return; // ignore mobile URL-bar jitter
        lastW = host.clientWidth; stop(); layout(); frame(performance.now()); if (animate) idle = requestIdle(warm);
      }, 120);
    };

    let started = false;
    const start = () => {
      if (disposed || started) return;
      started = true;
      layout(); lastW = W;
      frame(performance.now());
      if (animate) idle = requestIdle(warm);
      io.observe(host);
      if (!reduce) { host.addEventListener("pointermove", onMove); host.addEventListener("pointerleave", onLeave); }
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("resize", onResize);
    };
    // The atlas needs real Geist Mono metrics.
    // Start after the page has painted its text (LCP) and the main thread is idle: the canvas is decoration.
    const afterLoad = () => new Promise<void>((r) => (document.readyState === "complete" ? r() : addEventListener("load", () => r(), { once: true })));
    const idleTick = () => new Promise<void>((r) => (typeof requestIdleCallback === "function" ? requestIdleCallback(() => r(), { timeout: 1200 }) : setTimeout(r, 200)));
    afterLoad().then(idleTick).then(() => document.fonts.load(`500 12px ${monoFamily()}`)).catch(() => null).then(() => document.fonts.ready).then(start);

    return () => {
      disposed = true;
      stop();
      if (idle) cancelIdle(idle);
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
