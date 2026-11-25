"use client";
// Brief §5 S6: chrysalis "hatches" into a butterfly while scrolling — lum of both fields interpolated by progress.
import { useMemo, useRef } from "react";
import AsciiCanvas from "@/components/ascii/AsciiCanvas";
import { butterflyField, chrysalisField } from "@/lib/ascii/engine";

const COLS = 110, ROWS = 46;
const COLORS = ["#111010", "#EC6C40"];
const COLORS_DARK = ["rgba(255,255,255,.75)", "#EC6C40"];
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** drive="scroll": hatches while scrolling (landing S6). drive="time": hatches once over ~2.4 s (launch success). */
export default function HatchCanvas({ drive = "scroll", cols = COLS, rows = ROWS }: { drive?: "scroll" | "time"; cols?: number; rows?: number }) {
  const { chrys, bfly } = useMemo(() => ({
    chrys: chrysalisField({ cols, rows }).lum,
    bfly: butterflyField(0, { cols, rows, flap: 2 }).lum,
  }), [cols, rows]);
  const buf = useRef({ out: new Float32Array(cols * rows), color: new Uint8Array(cols * rows) });
  const frame = (t: number, progress: number) => {
    const { out, color } = buf.current;
    const p = drive === "time" ? smooth(0.2, 2.4, t) : smooth(0.3, 0.62, progress);
    for (let i = 0; i < out.length; i++) {
      out[i] = chrys[i] * (1 - p) + bfly[i] * p;
      color[i] = p > 0.5 ? 1 : 0;
    }
    return { lum: out, color };
  };
  return <AsciiCanvas cols={cols} rows={rows} colors={drive === "time" ? COLORS_DARK : COLORS} frame={frame} mode={drive} fps={30} staticT={drive === "time" ? 3 : 0} label="A chrysalis hatching into a butterfly" />;
}
