"use client";
// Brief §5 S3: 0xLayer numbered list on the left; sticky ASCII ring split into Deposit / Send / Withdraw / Track
// on the right. Hover/scroll highlights a sector; click "zooms" into it and crossfades to the item's mini-art.
import { useEffect, useRef, useState } from "react";
import AsciiRing from "@/components/ascii/AsciiRing";
import MiniArt, { type MiniArtKind } from "@/components/ascii/MiniArt";
import { HOW, RING_SECTORS } from "@/lib/copy";
import styles from "./HowItWorks.module.css";

const ORIGINS = ["25% 25%", "75% 25%", "75% 75%", "25% 75%"];

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const current = HOW[zoom ?? active];
  const sector = current.sector;
  const origin = typeof sector === "number" ? ORIGINS[sector] : "50% 50%";

  return (
    <section id="private-balance" className={styles.how} aria-labelledby="how-title">
      <div className={styles.left}>
        <p className={`micro ${styles.kicker}`}>How it works</p>
        <h2 id="how-title" className={styles.title}>A private lane for <em>your coin.</em></h2>
        <ol className={styles.list}>
          {HOW.map((it, i) => (
            <li
              key={it.n}
              ref={(el) => { items.current[i] = el; }}
              data-i={i}
              className={i === active ? styles.on : undefined}
              onMouseEnter={() => setActive(i)}
            >
              <button type="button" className={styles.item} onClick={() => setZoom(zoom === i ? null : i)} aria-expanded={zoom === i}>
                <span className={`micro ${styles.n}`}>{it.n}</span>
                <span className={styles.itemTitle}>{it.title}</span>
                <span className={styles.itemText}>{it.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.right}>
        <div className={styles.stage}>
          <div className={`${styles.ringWrap} ${zoom !== null ? styles.zoomed : ""}`} style={{ transformOrigin: origin }}>
            <AsciiRing cols={84} rows={40} segments highlight={sector} label="Ring split into Deposit, Send, Withdraw and Track" />
            {RING_SECTORS.map((s, i) => (
              <span key={s} className={`micro ${styles.label} ${styles[`l${i}`]} ${sector === i || sector === "all" ? styles.labelOn : ""}`}>{s}</span>
            ))}
          </div>
          <div className={`${styles.art} ${zoom !== null ? styles.artOn : ""}`} aria-hidden={zoom === null}>
            {zoom !== null && <MiniArt kind={HOW[zoom].art as MiniArtKind} />}
            {zoom !== null && (
              <button type="button" className={`micro ${styles.back}`} onClick={() => setZoom(null)}>← Back to the ring</button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
