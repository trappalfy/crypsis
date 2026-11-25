import type { Metadata } from "next";
import AppLink from "@/components/app/AppLink";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ShareChart from "@/components/tracker/ShareChart";
import CopyAddress from "@/components/tracker/CopyAddress";
import { CoinIcon } from "@/components/tracker/TrackerTable";
import { getCoinDetail } from "@/lib/tracker/data";
import { formatShare, formatTokenAmount, shortMint } from "@/lib/tracker/types";
import { APP_COPY } from "@/lib/copy";
import ui from "@/components/app/ui.module.css";
import styles from "@/components/tracker/Coin.module.css";

export async function generateMetadata({ params }: PageProps<"/coin/[mint]">): Promise<Metadata> {
  const { mint } = await params;
  const d = await getCoinDetail(mint);
  const name = d?.coin.symbol ?? shortMint(mint);
  if (!d) return { title: "Not in the Ring", robots: { index: false, follow: false } };
  return { title: `${name} in the Ring`, description: d ? `${formatShare(d.coin.shareBps)} of ${name} supply is in the Helius Privacy Ring.` : undefined };
}

const pct = (num: string | null, den: string) => {
  if (!num) return "—";
  const n = BigInt(num), d = BigInt(den || "0");
  return d > 0n ? `${(Number((n * 1_000_000n) / d) / 10_000).toFixed(2)}%` : "—";
};
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  return s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

async function Coin({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const d = await getCoinDetail(mint);
  if (!d) notFound();
  const c = d.coin;
  return (
    <>
      <header className={styles.header}>
        <CoinIcon c={c} size={56} />
        <div className={styles.titleBlock}>
          <h1 className={styles.name}>{c.name ?? shortMint(c.mint)} <span className={ui.muted}>{c.symbol}</span></h1>
          <CopyAddress value={c.mint} />
        </div>
        <div className={styles.links}>
          <span className={ui.badge}>Ring-ready</span>
          {c.isPump && <a className={ui.chip} href={`https://pump.fun/coin/${c.mint}`} target="_blank" rel="noopener noreferrer">pump.fun ↗</a>}
          <a className={ui.chip} href={`https://solscan.io/token/${c.mint}`} target="_blank" rel="noopener noreferrer">Solscan ↗</a>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={`${ui.card} ${ui.cardHot} ${styles.hero}`}>
          <p className={ui.label}>Share of supply in the Ring</p>
          <p className={styles.heroNum}>{formatShare(c.shareBps)}</p>
          <p className={`${ui.mono} ${styles.bps}`}>{c.shareBps} bps</p>
        </div>
        <ShareChart history={d.history} />
      </div>

      <div className={styles.cards}>
        <div className={ui.card}><p className={ui.label}>In Ring</p><p className={styles.mid}>{formatTokenAmount(c.vaultAmount, c.decimals)}<span className={ui.unit}>{c.symbol ?? "tokens"}</span></p></div>
        <div className={ui.card}><p className={ui.label}>Total supply</p><p className={styles.mid}>{formatTokenAmount(c.totalSupply, c.decimals)}<span className={ui.unit}>{c.symbol ?? "tokens"}</span></p></div>
        <div className={ui.card}><p className={ui.label}>Circulating share</p><p className={styles.mid}>{pct(c.vaultAmount, c.circulating ?? "0")}</p><p className={ui.note}>Supply minus the bonding curve (and PumpSwap pool) balance.</p></div>
      </div>

      <section className={ui.card} style={{ marginTop: 14 }} aria-labelledby="events-title">
        <div className={styles.eventsHead}>
          <h2 id="events-title" className={ui.label} style={{ margin: 0 }}>Public events</h2>
          <AppLink className={ui.btn} href={`/app/deposit?mint=${c.mint}`}>Deposit this coin</AppLink>
        </div>
        {d.events.length === 0 ? (
          <p className={ui.note} style={{ padding: "24px 0" }}>No public deposits or withdrawals indexed yet.</p>
        ) : (
          <ul className={styles.events}>
            {d.events.map((e) => (
              <li key={`${e.signature}-${e.kind}`}>
                <span className={e.kind === "deposit" ? styles.dep : styles.wd}>{e.kind === "deposit" ? "Deposit" : "Withdraw"}</span>
                <span className={styles.num}>{e.amount ? formatTokenAmount(e.amount, c.decimals) : "—"}</span>
                <span className={`${ui.mono} ${ui.muted}`}>{shortMint((e.kind === "deposit" ? e.fromAddr : e.toAddr) ?? "")}</span>
                <span className={`${ui.mono} ${ui.muted}`}>{ago(e.blockTime)}</span>
                <a className={ui.mono} href={`https://solscan.io/tx/${e.signature}`} target="_blank" rel="noopener noreferrer">tx ↗</a>
              </li>
            ))}
          </ul>
        )}
        <p className={ui.note} style={{ marginTop: 16 }}>{APP_COPY.transfersNotCounted}</p>
      </section>
    </>
  );
}

export default function CoinPage({ params }: PageProps<"/coin/[mint]">) {
  return (
    <Suspense fallback={<div className={ui.skeleton} style={{ height: 520 }} />}>
      <Coin params={params} />
    </Suspense>
  );
}
