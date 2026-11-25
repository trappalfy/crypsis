"use client";
// <Decrypt value/> — reveals `value` left to right over 600 ms, cells flicker as cipher glyphs first.
import { useEffect, useState } from "react";
import { CIPHER_GLYPHS } from "@/lib/ascii/engine";

export default function Decrypt({ value, duration = 600, className }: { value: string; duration?: number; className?: string }) {
  const [anim, setAnim] = useState<{ value: string; text: string } | null>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const k = Math.floor(p * value.length);
      setAnim({ value, text: value.slice(0, k) + value.slice(k).replace(/[^\s.,]/g, () => CIPHER_GLYPHS[(Math.random() * CIPHER_GLYPHS.length) | 0]) });
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const shown = anim && anim.value === value ? anim.text : value;
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
