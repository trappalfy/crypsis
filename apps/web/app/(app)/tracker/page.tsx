import type { Metadata } from "next";
import { Suspense } from "react";
import TrackerTable from "@/components/tracker/TrackerTable";
import { getTrackerPage } from "@/lib/tracker/data";
import { TRACKER_PREVIEW } from "@/lib/copy";
import ui from "@/components/app/ui.module.css";
import styles from "@/components/tracker/Tracker.module.css";

export const metadata: Metadata = { title: "Tracker", description: "How much of every pump.fun coin's supply sits in the Helius Privacy Ring. Live, read from Solana." };

async function Kpis() {
  const { kpis } = await getTrackerPage();
  return (
    <div className={styles.kpis}>
      <div className={`${ui.card} ${ui.cardHot}`}><p className={ui.label}>Coins in Ring</p><p className={ui.big}>{kpis.coins.toLocaleString("en-US")}</p></div>
      <div className={ui.card}><p className={ui.label}>Deposits 24h</p><p className={ui.big}>{kpis.deposits24h.toLocaleString("en-US")}</p></div>
      <div className={ui.card}><p className={ui.label}>Withdrawals 24h</p><p className={ui.big}>{kpis.withdrawals24h.toLocaleString("en-US")}</p></div>
    </div>
  );
}

async function Table() {
  const { items, nextCursor } = await getTrackerPage();
  return <TrackerTable initial={items} initialCursor={nextCursor} />;
}

export default function TrackerPage() {
  return (
    <>
      <div className={styles.head}>
        <h1 className={ui.pageTitle}>Supply in <em>the Ring</em></h1>
        <p className={ui.note}>{TRACKER_PREVIEW.sub}</p>
      </div>
      <Suspense fallback={<div className={styles.kpis}>{[0, 1, 2].map((i) => <div key={i} className={`${ui.card} ${ui.skeleton}`} style={{ height: 130 }} />)}</div>}>
        <Kpis />
      </Suspense>
      <Suspense fallback={<div className={ui.skeleton} style={{ height: 420, marginTop: 28 }} />}>
        <Table />
      </Suspense>
      <p className={ui.note} style={{ marginTop: 20 }}>Transfers inside the Ring don&apos;t reveal the coin, so they aren&apos;t counted here. Share = Ring vault balance ÷ total supply.</p>
    </>
  );
}
