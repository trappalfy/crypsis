"use client";
// <AsciiCanvas> — shared canvas renderer for ASCII fields (brief §7.4).
// The caller supplies `frame(t, progress)` returning cell densities (+ optional colour row per cell);
// this component handles sizing, glyph atlas, DPR ≤ 2, pausing off-screen / hidden tab, reduced motion.
import { useEffect, useLayoutEffect, useRef } from "react";
import { lumToIndex, RAMP } from "@/lib/ascii/engine";
import { buildAtlas, blit, monoFamily, prefersReducedMotion, type Atlas } from "@/lib/ascii/atlas";

export interface CellFrame {
  lum: Float32Array;
  /** colour row (index into `colors`) per cell; default 0 */
  color?: Uint8Array;
  /** optional glyph override per cell (e.g. cipher glyphs); empty string = use ramp */
  glyph?: (i: number) => string | undefined;
}

export interface AsciiCanvasProps {
  cols: number;
  rows: number;
  colors: string[];
  /** t = seconds since start; progress = 0..1 scroll progress of the element through the viewport */
  frame: (t: number, progress: number) => CellFrame;
  /** time: rAF at `fps`; scroll: redraw when scroll progress changes; static: draw once */
  mode?: "time" | "scroll" | "static";
  fps?: number;
  ramp?: string;
  /** frame time used when motion is reduced */
  staticT?: number;
  className?: string;
  /** bump to force a redraw (e.g. highlight changed) */
  version?: number;
  label?: string;
}

export default function AsciiCanvas({ cols, rows, colors, frame, mode = "time", fps = 24, ramp = RAMP, staticT = 0, className, version = 0, label }: AsciiCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(frame);
  const drawRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { frameRef.current = frame; });

  useEffect(() => { drawRef.current?.(); }, [version]);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = prefersReducedMotion();
    let at: Atlas | null = null, dpr = 1;
    let raf = 0, last = -1, visible = true, onScreen = false, disposed = false;
    const t0 = performance.now();

    function layout() {
      dpr = Math.min(2, devicePixelRatio || 1);
      const W = canvas.parentElement!.clientWidth || canvas.clientWidth;
      // Geist Mono advance ≈ 0.6 em; measure the real ratio once, then fit `cols` into the width
      const probe = buildAtlas(100, ["#000"], 1, ["M"]);
      const ratio = probe.cw / 100;
      const fs = Math.max(4, W / (cols * ratio));
      at = buildAtlas(fs, colors, dpr);
      canvas.width = Math.round(cols * at.cw * dpr);
      canvas.height = Math.round(rows * at.ch * dpr);
      canvas.style.width = `${cols * at.cw}px`;
      canvas.style.height = `${rows * at.ch}px`;
    }
    function progress() {
      const b = canvas.getBoundingClientRect();
      const vh = innerHeight || 1;
      return Math.min(1, Math.max(0, (vh - b.top) / (vh + b.height)));
    }
    function draw() {
      if (!at || disposed) return;
      const t = reduce || mode === "static" ? staticT : (performance.now() - t0) / 1000;
      const f = frameRef.current(t, reduce && mode === "scroll" ? 1 : progress());
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const n = cols * rows;
      for (let i = 0; i < n; i++) {
        const g = f.glyph?.(i);
        let ch: string;
        if (g) ch = g;
        else {
          const gi = lumToIndex(f.lum[i], ramp);
          if (gi === 0) continue;
          ch = ramp[gi];
        }
        blit(ctx, at, ch, f.color ? f.color[i] : 0, i % cols, (i / cols) | 0);
      }
    }
    drawRef.current = draw;
    const loop = (now: number) => {
      raf = 0;
      if (!visible || !onScreen) return;
      if (now - last >= 1000 / fps - 1) { last = now; draw(); }
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (mode === "time" && !reduce && visible && onScreen && !raf) raf = requestAnimationFrame(loop); };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const onScroll = () => { if (onScreen) draw(); };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) { draw(); kick(); } else stop(); }, { rootMargin: "100px" });
    const onVis = () => { visible = document.visibilityState === "visible"; if (visible) kick(); else stop(); };
    const ro = new ResizeObserver(() => { layout(); draw(); });

    document.fonts.load(`500 12px ${monoFamily()}`).catch(() => null).then(() => document.fonts.ready).then(() => {
      if (disposed) return;
      layout();
      draw();
      io.observe(canvas);
      ro.observe(canvas.parentElement!);
      document.addEventListener("visibilitychange", onVis);
      if (mode === "scroll" && !reduce) addEventListener("scroll", onScroll, { passive: true });
    });
    return () => {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("scroll", onScroll);
    };
  }, [cols, rows, colors, mode, fps, ramp, staticT]);

  return <canvas ref={ref} className={className} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} />;
}
