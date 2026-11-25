"use client";
// Mini-arts for the "How it works" list (brief §5 S3).
import { useMemo, useRef } from "react";
import AsciiCanvas from "./AsciiCanvas";
import AsciiRing from "./AsciiRing";
import DotBars from "./DotBars";
import { butterflyField, chrysalisField } from "@/lib/ascii/engine";

export type MiniArtKind = "chrysalis" | "ring" | "butterfly-sm" | "butterfly-flap" | "butterfly-open" | "dots";
const ORANGE = ["#EC6C40"];

function Butterfly({ cols, rows, flap, animate }: { cols: number; rows: number; flap?: number; animate?: boolean }) {
  const cacheRef = useRef(new Map<number, Float32Array>());
  const frame = (t: number) => {
    const cache = cacheRef.current;
    const i = animate ? Math.floor(t * 24) % 36 : 0;
    let lum = cache.get(i);
    if (!lum) { lum = butterflyField(animate ? i / 36 : 0.55, { cols, rows, flap }).lum; cache.set(i, lum); }
    return { lum };
  };
  return <AsciiCanvas cols={cols} rows={rows} colors={ORANGE} frame={frame} mode={animate ? "time" : "static"} />;
}

function Chrysalis() {
  const lum = useMemo(() => chrysalisField({ cols: 40, rows: 44 }).lum, []);
  return <AsciiCanvas cols={40} rows={44} colors={ORANGE} frame={() => ({ lum })} mode="static" />;
}

// Decorative only (not data): a smooth procedural profile.
const DOTS = Array.from({ length: 18 }, (_, i) => 0.25 + 0.6 * Math.abs(Math.sin(i * 0.55)) * (0.6 + 0.4 * Math.cos(i * 0.21)));

export default function MiniArt({ kind }: { kind: MiniArtKind }) {
  switch (kind) {
    case "chrysalis": return <Chrysalis />;
    case "ring": return <AsciiRing cols={72} rows={33} highlight="all" />;
    case "butterfly-sm": return <Butterfly cols={56} rows={24} animate />;
    case "butterfly-flap": return <Butterfly cols={110} rows={46} />;
    case "butterfly-open": return <Butterfly cols={110} rows={46} flap={2} />;
    case "dots": return <DotBars values={DOTS} dots={12} size={10} gap={5} empty="rgba(17,16,16,.08)" />;
  }
}
