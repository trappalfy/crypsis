import Link from "next/link";
import { Suspense } from "react";
import AppNav, { AppNavStatic } from "./AppNav";
import WalletSlot from "./WalletSlot";
import styles from "./AppShell.module.css";

// Brief §6 (Stoma): dark, orange "funnel" glow, glass pills. (The top-right corner butterfly was removed at the owner's request, 2026-11-25.)
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.glow} aria-hidden="true"><span /></div>
      <header className={styles.header}>
        <Link href="/" className={styles.mark}>Crypsis</Link>
        <Suspense fallback={<AppNavStatic />}><AppNav /></Suspense>
        <div className={styles.right}><WalletSlot /></div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
