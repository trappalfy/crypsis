import Link from "next/link";
import DotBars from "@/components/ascii/DotBars";
import { getTopCoins } from "@/lib/tracker/data";
import { coinImageUrl, formatShare, shortMint } from "@/lib/tracker/types";
import { TRACKER_PREVIEW } from "@/lib/copy";
import styles from "./TrackerPreview.module.css";

// Brief §5 S5: dark band, top-5 coins by ring share, live data only.
export default async function TrackerPreview() {
  const coins = await getTopCoins(5);
  return (
    <section id="tracker" className={styles.band} aria-labelledby="tracker-title">
      <div className={styles.head}>
        <h2 id="tracker-title" className={styles.title}>{TRACKER_PREVIEW.title}</h2>
        <p className={`micro ${styles.sub}`}><span className={styles.live} aria-hidden="true" />{TRACKER_PREVIEW.sub}</p>
      </div>
      {coins.length === 0 ? (
        <p className={styles.empty}>{TRACKER_PREVIEW.empty}</p>
      ) : (
        <ol className={styles.rows}>
          {coins.map((c, i) => (
            <li key={c.mint}>
              <Link href={`/coin/${c.mint}`} className={styles.row}>
                <span className={`micro ${styles.rank}`}>{String(i + 1).padStart(2, "0")}</span>
                <span className={styles.coin}>
                  {c.imageUri ? <img src={coinImageUrl(c.mint)} alt="" width={28} height={28} className={styles.icon} loading="lazy" /> : <span className={styles.icon} />}
                  <span>{c.symbol ?? shortMint(c.mint)}</span>
                  <span className={`micro ${styles.mint}`}>{shortMint(c.mint)}</span>
                </span>
                <DotBars values={c.spark.length ? c.spark.map((v) => v / 10000) : [c.shareBps / 10000]} dots={8} size={5} gap={3} className={styles.bars} />
                <span className={`num ${styles.share}`}>{formatShare(c.shareBps)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link href="/tracker" className={styles.cta}>{TRACKER_PREVIEW.cta} →</Link>
    </section>
  );
}
