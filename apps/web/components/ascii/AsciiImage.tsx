"use client";
// <AsciiImage src/> — the user's picture, which "ASCII-fies" on hover through the same engine (brief §6 Launch).
import { useEffect, useState } from "react";
import AsciiCanvas from "./AsciiCanvas";
import styles from "./AsciiImage.module.css";

const COLS = 64;
const COLORS = ["#EC6C40"];

export default function AsciiImage({ src, alt = "" }: { src: string; alt?: string }) {
  const [field, setField] = useState<{ lum: Float32Array; rows: number; src: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const rows = Math.max(8, Math.round((COLS * img.naturalHeight) / img.naturalWidth * 0.6));
      const c = document.createElement("canvas");
      c.width = COLS; c.height = rows;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, COLS, rows);
      const d = ctx.getImageData(0, 0, COLS, rows).data;
      const lum = new Float32Array(COLS * rows);
      for (let i = 0; i < lum.length; i++) {
        const a = d[i * 4 + 3] / 255;
        lum[i] = ((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255) * a; // brightness -> ink
      }
      if (alive) setField({ lum, rows, src });
    };
    img.src = src;
    return () => { alive = false; };
  }, [src]);
  const ready = field?.src === src ? field : null;
  return (
    <div className={styles.wrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={styles.img} />
      {ready && <div className={styles.ascii} aria-hidden="true"><AsciiCanvas cols={COLS} rows={ready.rows} colors={COLORS} frame={() => ({ lum: ready.lum })} mode="static" /></div>}
    </div>
  );
}
