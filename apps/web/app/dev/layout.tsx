import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import styles from "./dev.module.css";

export const metadata: Metadata = { title: "Dev checks", robots: { index: false, follow: false } };

// Dev pages exist for phase-0 checks on devnet only.
export const instant = false;

export default async function DevLayout({ children }: LayoutProps<"/dev">) {
  await connection();
  if (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" && process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES !== "true") notFound();
  return <main className={styles.dev}>{children}</main>;
}
