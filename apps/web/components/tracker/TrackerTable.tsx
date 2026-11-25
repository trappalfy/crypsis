"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import DotBars from "@/components/ascii/DotBars";
import { formatPp, formatShare, formatTokenAmount, shortMint, type CoinSummary } from "@/lib/tracker/types";
import { TRACKER_PREVIEW } from "@/lib/copy";
import ui from "@/components/app/ui.module.css";
import styles from "./Tracker.module.css";

type Sort = "share" | "amount" | "change24h" | "newest";
type Filter = "all" | "crypsis" | "graduated";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "crypsis", label: "Launched on Crypsis" },
  { key: "graduated", label: "Graduated" },
];

export function CoinIcon({ c, size = 28 }: { c: Pick<CoinSummary, "imageUri" | "symbol">; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return c.imageUri ? <img src={c.imageUri} alt="" width={size} height={size} className={styles.icon} loading="lazy" referrerPolicy="no-referrer" /> : <span className={styles.icon} style={{ width: size, height: size }} aria-hidden="true" />;
}

export default function TrackerTable({ initial, initialCursor }: { initial: CoinSummary[]; initialCursor: string | null }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [sort, setSort] = useState<Sort>("share");
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  const load = (s: Sort, f: Filter, append = false) =>
    start(async () => {
      try {
        const q = new URLSearchParams({ sort: s, filter: f, ...(append && cursor ? { cursor } : {}) });
        const r = await fetch(`/api/coins?${q}`);
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { items: CoinSummary[]; nextCursor: string | null };
        setItems((prev) => (append ? [...prev, ...j.items] : j.items));
        setCursor(j.nextCursor);
        setError(false);
      } catch { setError(true); }
    });

  const maxShare = Math.max(1, ...items.flatMap((c) => [c.shareBps, ...c.spark]));
  const th = (key: Sort, label: string) => (
    <th scope="col" aria-sort={sort === key ? "descending" : "none"}>
      <button type="button" onClick={() => { setSort(key); load(key, filter); }} className={sort === key ? styles.sorted : undefined}>{label}{sort === key ? " ↓" : ""}</button>
    </th>
  );

  return (
    <div className={styles.tableBlock} aria-busy={pending}>
      <div className={styles.controls}>
        <div className={ui.seg} role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); load(sort, f.key); }}>{f.label}</button>
          ))}
        </div>
        {error && <span className={ui.note} role="status">Couldn&apos;t refresh. Showing the last data.</span>}
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>{TRACKER_PREVIEW.empty}</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Coin</th>
                {th("amount", "In Ring")}
                {th("share", "Share of supply")}
                {th("change24h", "24h")}
                <th scope="col">Deposits / Withdrawals 24h</th>
                {th("newest", "Ring-ready since")}
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.mint}>
                  <td>
                    <Link href={`/coin/${c.mint}`} className={styles.coin}>
                      <CoinIcon c={c} />
                      <span className={styles.sym}>{c.symbol ?? shortMint(c.mint)}</span>
                      <span className={`${ui.mono} ${ui.muted} ${styles.mint}`}>{shortMint(c.mint)}</span>
                    </Link>
                  </td>
                  <td className={styles.num}>{formatTokenAmount(c.vaultAmount, c.decimals)}</td>
                  <td>
                    <span className={styles.shareCell}>
                      <span className={styles.num}>{formatShare(c.shareBps)}</span>
                      <DotBars values={(c.spark.length ? c.spark : [c.shareBps]).slice(-16).map((v) => v / maxShare)} dots={6} size={4} gap={2} />
                    </span>
                  </td>
                  <td className={`${styles.num} ${c.change24hBps == null ? ui.muted : c.change24hBps >= 0 ? styles.up : styles.down}`}>{formatPp(c.change24hBps)}</td>
                  <td className={styles.num}>{c.deposits24h} / {c.withdrawals24h}</td>
                  <td className={`${ui.mono} ${ui.muted}`}>{c.ringReadyAt ? new Date(c.ringReadyAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} style={{ marginTop: 18 }} disabled={pending} onClick={() => load(sort, filter, true)}>Load more</button>
      )}
    </div>
  );
}
