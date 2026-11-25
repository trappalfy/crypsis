"use client";
import { useState } from "react";
import styles from "./Coin.module.css";

export default function CopyAddress({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={styles.copy} onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }} aria-label="Copy mint address">
      <span className={styles.addr}>{value}</span> <span aria-live="polite">{done ? "Copied" : "Copy"}</span>
    </button>
  );
}
