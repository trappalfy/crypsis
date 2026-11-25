"use client";
// Share-of-supply history: thin orange line + dots on dark (brief §6 /coin/[mint]).
import { useState } from "react";
import ui from "@/components/app/ui.module.css";
import styles from "./Coin.module.css";

type Range = "24h" | "7d" | "30d";
export default function ShareChart({ history }: { history: Record<Range, { t: string; shareBps: number }[]> }) {
  const [range, setRange] = useState<Range>("24h");
  const pts = history[range];
  const W = 760, H = 220, P = 18;
  const max = Math.max(1, ...pts.map((p) => p.shareBps)) * 1.15;
  const t0 = pts.length ? new Date(pts[0].t).getTime() : 0, t1 = pts.length ? new Date(pts.at(-1)!.t).getTime() : 1;
  const x = (t: string) => (pts.length < 2 ? W / 2 : P + ((new Date(t).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.shareBps).toFixed(1)}`).join(" ");
  return (
    <div className={`${ui.card} ${styles.chart}`}>
      <div className={styles.chartHead}>
        <p className={ui.label}>Share of supply</p>
        <div className={ui.seg} role="group" aria-label="Range">
          {(["24h", "7d", "30d"] as Range[]).map((r) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      {pts.length === 0 ? (
        <p className={ui.note} style={{ padding: "60px 0" }}>No snapshots in this range yet. Snapshots are taken every 5 minutes.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`Share of supply over ${range}: from ${(pts[0].shareBps / 100).toFixed(2)}% to ${(pts.at(-1)!.shareBps / 100).toFixed(2)}%`}>
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={P} x2={W - P} y1={P + f * (H - 2 * P)} y2={P + f * (H - 2 * P)} stroke="rgba(255,255,255,.06)" />)}
          <path d={path} fill="none" stroke="#EC6C40" strokeWidth={1.5} />
          {pts.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.shareBps)} r={pts.length > 60 ? 1.6 : 3} fill="#EC6C40" />)}
        </svg>
      )}
    </div>
  );
}
