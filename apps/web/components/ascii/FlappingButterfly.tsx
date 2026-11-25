"use client";
import { useRef } from "react";
import AsciiCanvas from "@/components/ascii/AsciiCanvas";
import { butterflyField } from "@/lib/ascii/engine";

const COLORS = ["#EC6C40"];

/** The ASCII butterfly flapping its wings (36-frame cycle, frames computed once and cached). Reduced motion: still. */
export default function FlappingButterfly({ cols = 110, rows = 46, label = "A butterfly flapping its wings" }: { cols?: number; rows?: number; label?: string }) {
  const cache = useRef(new Map<number, Float32Array>());
  const frame = (t: number) => {
    const i = Math.floor(t * 24) % 36;
    let lum = cache.current.get(i);
    if (!lum) { lum = butterflyField(i / 36, { cols, rows }).lum; cache.current.set(i, lum); }
    return { lum };
  };
  return <AsciiCanvas cols={cols} rows={rows} colors={COLORS} frame={frame} fps={24} label={label} />;
}
