"use client";
import AppLink from "./AppLink";
import { useSession } from "@/lib/app/session";
import { shortAddress } from "@/lib/solana/wallet-standard";
import { SITE } from "@/lib/site";
import styles from "./ui.module.css";

// Header: wallet chip (address, network) + Lock when unlocked (brief §6) + Disconnect (to switch to another wallet).
export default function WalletSlot() {
  const { account, status, lock, disconnect } = useSession();
  if (!account) return <AppLink href="/app" className={styles.chip}>Connect wallet</AppLink>;
  return (
    <>
      <span className={styles.chip} title={account.address}>
        <span className={styles.dot} data-network={SITE.network} aria-hidden="true" />
        <span className={`${styles.mono} ${styles.nowrap}`}>{shortAddress(account.address)}</span>
        <span className={`${styles.muted} ${styles.walletNet}`}>{SITE.network}</span>
      </span>
      {status === "unlocked" && <button type="button" className={styles.chip} onClick={lock}>Lock</button>}
      <button type="button" className={`${styles.chip} ${styles.walletOut}`} onClick={() => void disconnect()} aria-label="Disconnect" title="Disconnect">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
        <span className={styles.walletOutText}>Disconnect</span>
      </button>
    </>
  );
}
