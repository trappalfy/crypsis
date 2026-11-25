"use client";
import { useRef } from "react";
import AsciiCanvas from "@/components/ascii/AsciiCanvas";
import { butterflyField } from "@/lib/ascii/engine";

const COLORS = ["#EC6C40"];
export default function CornerButterfly() {
  const cache = useRef(new Map<number, Float32Array>());
  const frame = (t: number) => {
    const i = Math.floor(t * 24) % 36;
    let lum = cache.current.get(i);
    if (!lum) { lum = butterflyField(i / 36, { cols: 56, rows: 24 }).lum; cache.current.set(i, lum); }
    return { lum };
  };
  return <AsciiCanvas cols={56} rows={24} colors={COLORS} frame={frame} fps={24} />;
}
