"use client";
// The 160×37 ASCII wordmark (kit/ascii/frames/wordmark-crypsis.txt) drawn on canvas: it's art, not text.
// Glyphs map back to the density they came from (inverse of lumToIndex), so the drawing is identical.
import { useMemo } from "react";
import AsciiCanvas from "@/components/ascii/AsciiCanvas";
import { RAMP } from "@/lib/ascii/engine";

const WHITE = ["#FFFFFF"];
export default function WordmarkCanvas({ text }: { text: string }) {
  const { cols, rows, lum } = useMemo(() => {
    const lines = text.replace(/\n+$/, "").split("\n");
    const cols = Math.max(...lines.map((l) => l.length)), rows = lines.length;
    const lum = new Float32Array(cols * rows);
    lines.forEach((l, r) => { for (let c = 0; c < l.length; c++) { const i = RAMP.indexOf(l[c]); if (i > 0) lum[r * cols + c] = Math.pow(i / (RAMP.length - 1), 1 / 0.9); } });
    return { cols, rows, lum };
  }, [text]);
  return <AsciiCanvas cols={cols} rows={rows} colors={WHITE} frame={() => ({ lum })} mode="static" />;
}
