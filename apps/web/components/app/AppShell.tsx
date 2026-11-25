import Link from "next/link";
import { Suspense } from "react";
import AppNav, { AppNavStatic } from "./AppNav";
import CornerButterfly from "./CornerButterfly";
import WalletSlot from "./WalletSlot";
import styles from "./AppShell.module.css";

// Brief §6 (Stoma): dark, orange "funnel" glow, glass pills, a small ASCII butterfly top-right.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.glow} aria-hidden="true"><span /></div>
      <header className={styles.header}>
        <Link href="/" className={styles.mark}>Crypsis</Link>
        <Suspense fallback={<AppNavStatic />}><AppNav /></Suspense>
        <div className={styles.right}><WalletSlot /></div>
      </header>
      <div className={styles.corner} aria-hidden="true"><CornerButterfly /></div>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
