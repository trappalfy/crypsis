"use client";
import AppLink from "./AppLink";
import { usePathname } from "next/navigation";
import styles from "./AppNav.module.css";

const ITEMS = [
  { href: "/app/balance", label: "Balance", match: (p: string) => p === "/app" || p.startsWith("/app/balance") || p.startsWith("/app/deposit") || p.startsWith("/app/withdraw") || p.startsWith("/app/activate") },
  { href: "/app/send", label: "Send", match: (p: string) => p.startsWith("/app/send") },
  { href: "/launch", label: "Launch", match: (p: string) => p.startsWith("/launch") },
  { href: "/tracker", label: "Tracker", match: (p: string) => p.startsWith("/tracker") || p.startsWith("/coin") },
];

export default function AppNav() {
  const path = usePathname();
  return (
    <nav className={styles.nav} aria-label="App">
      {ITEMS.map((it) => (
        <AppLink key={it.href} href={it.href} className={it.match(path) ? styles.on : undefined} aria-current={it.match(path) ? "page" : undefined}>{it.label}</AppLink>
      ))}
    </nav>
  );
}

/** Same pills without the active state (Suspense fallback while the URL is resolved). */
export function AppNavStatic() {
  return (
    <nav className={styles.nav} aria-label="App">
      {ITEMS.map((it) => <AppLink key={it.href} href={it.href}>{it.label}</AppLink>)}
    </nav>
  );
}
