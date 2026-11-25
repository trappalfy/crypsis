"use client";
import Link from "next/link";
import { useState } from "react";
import Decrypt from "@/components/ascii/Decrypt";
import { useSession } from "@/lib/app/session";
import { formatUnits, lamportsToSol } from "@/lib/app/amount";
import { shortAddress } from "@/lib/solana/wallet-standard";
import CoinAvatar from "../CoinAvatar";
import Health from "../Health";
import { ErrorNotice } from "../Gate";
import ui from "../ui.module.css";
import styles from "./screens.module.css";

const KIND: Record<string, string> = { deposit: "Deposit", privateTransfer: "Transfer", ringEntry: "Ring entry", publicWithdrawal: "Withdraw", split: "Split", merge: "Merge" };
const PAGE = 10;

export default function Balance() {
  const { view, sync, syncing, error, mode } = useSession();
  const [page, setPage] = useState(0);
  if (!view) return null;
  const activity = view.activity.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <div className={ui.stack}>
      <div className={styles.head}>
        <h1 className={ui.pageTitle}>Private <em>balance</em></h1>
        <div className={ui.row}>
          <Health />
          <span className={ui.note}>{syncing ? "Syncing…" : view.syncedSlot ? `Synced at slot ${Number(view.syncedSlot).toLocaleString("en-US")}` : ""}</span>
          <button type="button" className={ui.chip} onClick={() => sync()} disabled={syncing}>Sync</button>
          <Link href="/app/deposit" className={ui.btn}>Deposit</Link>
        </div>
      </div>
      <ErrorNotice error={error} />
      {mode === "B" && (
        <div className={ui.card}>
          <p className={ui.label}>Crypsis vault</p>
          <p className={ui.mono}>{view.ringAddress}</p>
          <p className={ui.note} style={{ marginTop: 6 }}>Vault SOL for fees: {lamportsToSol(view.vaultLamports ?? "0")} SOL · <Link href="/app/deposit">Fund vault</Link></p>
        </div>
      )}
      <div className={ui.card}>
        <p className={ui.label}>Coins</p>
        {view.balances.length === 0 ? (
          <p className={ui.note} style={{ padding: "18px 0" }}>Nothing here yet. Deposit a coin to start.</p>
        ) : (
          <ul className={styles.list}>
            {view.balances.map((b) => (
              <li key={b.mint}>
                <CoinAvatar symbol={b.symbol} />
                <span className={styles.coinName}>{b.symbol ?? shortAddress(b.mint)}{b.isPump && <span className={ui.pumpBadge}>pump</span>}</span>
                <span className={styles.amount}><Decrypt value={formatUnits(b.amount, b.decimals)} /></span>
                <span className={ui.row}>
                  <Link className={ui.chip} href={`/app/send?mint=${b.mint}`}>Send</Link>
                  <Link className={ui.chip} href={`/app/withdraw?mint=${b.mint}`}>Withdraw</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={ui.card}>
        <p className={ui.label}>Activity</p>
        {view.activity.length === 0 ? <p className={ui.note}>No private activity yet.</p> : (
          <>
            <ul className={styles.activity}>
              {activity.map((a) => (
                <li key={a.id}>
                  <span>{KIND[a.kind] ?? a.kind}</span>
                  <span className={ui.muted}>{a.direction === "inbound" ? "in" : a.direction === "outbound" ? "out" : "self"}</span>
                  <span className={styles.amount}>{a.direction === "outbound" ? "−" : "+"}{formatUnits(a.amount, a.decimals)} {a.symbol ?? shortAddress(a.mint)}</span>
                </li>
              ))}
            </ul>
            {view.activity.length > PAGE && (
              <div className={ui.row} style={{ marginTop: 12 }}>
                <button type="button" className={ui.chip} disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
                <button type="button" className={ui.chip} disabled={(page + 1) * PAGE >= view.activity.length} onClick={() => setPage(page + 1)}>Older</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
