"use client";
import AppLink from "./AppLink";
import { useSession } from "@/lib/app/session";
import { shortAddress } from "@/lib/solana/wallet-standard";
import { SITE } from "@/lib/site";
import styles from "./ui.module.css";

// Header: wallet chip (address, network) + Lock when unlocked (brief §6).
export default function WalletSlot() {
  const { account, status, lock } = useSession();
  if (!account) return <AppLink href="/app" className={styles.chip}>Connect wallet</AppLink>;
  return (
    <>
      <span className={styles.chip} title={account.address}>
        <span className={styles.dot} data-network={SITE.network} aria-hidden="true" />
        <span className={styles.mono}>{shortAddress(account.address)}</span>
        <span className={styles.muted}>{SITE.network}</span>
      </span>
      {status === "unlocked" && <button type="button" className={styles.chip} onClick={lock}>Lock</button>}
    </>
  );
}
