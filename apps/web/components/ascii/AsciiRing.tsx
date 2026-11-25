"use client";
// <AsciiRing segments highlight/> — rotating ASCII torus (ringField), optionally split into 4 sectors
// (Deposit / Send / Withdraw / Track). Highlighted sector -> orange, the rest dimmed to 35%.
import { useMemo, useRef } from "react";
import AsciiCanvas from "./AsciiCanvas";
import { ringField } from "@/lib/ascii/engine";

const RING_FRAMES = 72, RING_FPS = 24; // 3 s loop, as kit/ascii/frames/ring.json
export const INK_ON_PAPER = ["#111010", "#EC6C40", "rgba(17,16,16,0.35)"];
export const WHITE_ON_ORANGE = ["#FFFFFF", "#111010", "rgba(255,255,255,0.35)"];

/** Screen-space quadrant: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left. */
export function sectorOf(c: number, r: number, cols: number, rows: number): number {
  const top = r < rows / 2, left = c < cols / 2;
  return top ? (left ? 0 : 1) : left ? 3 : 2;
}

export default function AsciiRing({
  cols = 96, rows = 44, segments = false, highlight = null, colors = INK_ON_PAPER, className, label,
}: {
  cols?: number; rows?: number; segments?: boolean; highlight?: number | "all" | null; colors?: string[]; className?: string; label?: string;
}) {
  const cacheRef = useRef<{ key: string; map: Map<number, Float32Array> }>({ key: "", map: new Map() });
  const sector = useMemo(() => {
    const s = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s[r * cols + c] = sectorOf(c, r, cols, rows);
    return s;
  }, [cols, rows]);
  const color = useMemo(() => {
    const out = new Uint8Array(cols * rows);
    if (highlight === "all") out.fill(1);
    else if (typeof highlight === "number") for (let i = 0; i < out.length; i++) out[i] = sector[i] === highlight ? 1 : 2;
    return out;
  }, [highlight, sector, cols, rows]);

  const frame = (t: number) => {
    const key = `${cols}x${rows}:${segments}`;
    if (cacheRef.current.key !== key) cacheRef.current = { key, map: new Map() };
    const cache = cacheRef.current.map;
    const i = Math.floor(t * RING_FPS) % RING_FRAMES;
    let lum = cache.get(i);
    if (!lum) {
      const fresh = ringField(i / RING_FRAMES, { cols, rows }).lum;
      lum = fresh;
      if (segments) {
        // thin gaps on the sector boundaries
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
          if (Math.abs(c + 0.5 - cols / 2) < 0.8 || Math.abs(r + 0.5 - rows / 2) < 0.6) fresh[r * cols + c] = 0;
      }
      cache.set(i, lum);
    }
    return { lum, color };
  };
  return <AsciiCanvas cols={cols} rows={rows} colors={colors} frame={frame} fps={RING_FPS} className={className} version={typeof highlight === "number" ? highlight + 10 : highlight === "all" ? 1 : 0} label={label} />;
}
