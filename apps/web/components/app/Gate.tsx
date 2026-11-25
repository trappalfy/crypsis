"use client";
// Access states (brief §6.1): not connected -> connected/locked -> unlocked (+ not activated banner).
import Link from "next/link";
import { useMemo } from "react";
import AsciiCanvas from "@/components/ascii/AsciiCanvas";
import Cipher from "@/components/ascii/Cipher";
import { butterflyField } from "@/lib/ascii/engine";
import { useSession } from "@/lib/app/session";
import { friendlyError } from "@/lib/ring/errors";
import { capabilities } from "@/lib/solana/wallet-standard";
import { APP_COPY } from "@/lib/copy";
import { SITE } from "@/lib/site";
import ui from "./ui.module.css";
import styles from "./Gate.module.css";

const ORANGE = ["#EC6C40"];
function SleepingButterfly() {
  const lum = useMemo(() => butterflyField(0, { cols: 110, rows: 46, flap: 72 }).lum, []);
  return <AsciiCanvas cols={110} rows={46} colors={ORANGE} frame={() => ({ lum })} mode="static" label="A sleeping butterfly, wings folded" />;
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const f = friendlyError(error as never);
  return (
    <div className={`${ui.notice} ${ui.noticeErr}`} role="alert" data-codes={((error as { codes?: string[] }).codes ?? []).join(",")} data-custom={(error as { custom?: number }).custom}>
      {f.message}
      {f.action === "help" && <> <Link href="/privacy-model">Learn more</Link></>}
    </div>
  );
}

function Connect() {
  const { wallets, connect, status, error } = useSession();
  return (
    <div className={styles.center}>
      <div className={styles.art}><SleepingButterfly /></div>
      <h1 className={ui.pageTitle}>Your <em>private</em> balance</h1>
      <p className={ui.note} style={{ marginTop: 14 }}>{APP_COPY.connect}</p>
      <div className={styles.wallets}>
        {wallets.length === 0 && <p className={ui.note}>No Solana wallet found. Install Phantom, Solflare or Backpack, then reload.</p>}
        {wallets.map((w) => {
          const c = capabilities(w);
          return (
            <button key={w.name} type="button" className={ui.option} onClick={() => connect(w)} disabled={status === "connecting"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.icon} alt="" width={28} height={28} />
              <span style={{ flex: 1 }}>{w.name}</span>
              <span className={ui.note}>{c.signsV1 ? "Direct" : "Crypsis vault"}</span>
            </button>
          );
        })}
      </div>
      <ErrorNotice error={error} />
    </div>
  );
}

function Locked() {
  const { unlock, status, unlockStep, mode, setMode, canModeA, error } = useSession();
  const busy = status === "unlocking";
  return (
    <div className={styles.lockedGrid}>
      <div className={ui.card}>
        <p className={ui.label}>Private balance</p>
        {[12, 9, 10].map((n, i) => (
          <div key={i} className={styles.cipherRow}><Cipher length={6} label="Locked" /><span className={styles.cipherAmt}><Cipher length={n} label="Locked" /></span></div>
        ))}
      </div>
      <div className={`${ui.card} ${styles.unlockCard}`}>
        <h1 className={styles.unlockTitle}>{APP_COPY.unlockTitle}</h1>
        <p className={ui.note}>{APP_COPY.unlockBody}</p>
        {mode === "B" && (
          <div className={ui.notice}>
            <strong>{APP_COPY.modeBTitle}.</strong> {APP_COPY.modeBBody}
          </div>
        )}
        {unlockStep === "confirm" && <div className={ui.notice} role="status">{APP_COPY.determinism}</div>}
        <button type="button" className={ui.btn} onClick={() => void unlock()} disabled={busy}>
          {busy ? (unlockStep === "derive" ? "Deriving keys…" : unlockStep === "sync" ? "Decrypting…" : "Check your wallet…") : APP_COPY.unlockCta}
        </button>
        <ErrorNotice error={error} />
        <div className={ui.row}>
          {mode === "A" && <button type="button" className={ui.note} onClick={() => setMode("B")} style={{ textDecoration: "underline" }}>Use a Crypsis vault instead</button>}
          {mode === "B" && canModeA && <button type="button" className={ui.note} onClick={() => setMode("A")} style={{ textDecoration: "underline" }}>Sign Ring transactions with my wallet</button>}
        </div>
      </div>
    </div>
  );
}

export function ActivateBanner() {
  const { view } = useSession();
  if (!view || view.registered) return null;
  return (
    <div className={ui.banner} style={{ marginBottom: 18 }}>
      <div>
        <strong>{APP_COPY.activateTitle}</strong>
        <p className={ui.note} style={{ marginTop: 4 }}>{APP_COPY.activateBody} Until then you can deposit and withdraw, but nobody can send to you.</p>
      </div>
      <Link className={ui.btn} href="/app/activate">Activate</Link>
    </div>
  );
}

export default function Gate({ children, banner = true }: { children: React.ReactNode; banner?: boolean }) {
  const { status } = useSession();
  // Before launch the app is only usable on devnet (owner sets APP_LIVE=true for mainnet).
  if (!SITE.appLive && SITE.network === "mainnet") {
    return (
      <div className={styles.center}>
        <h1 className={ui.pageTitle}>Launch <em>soon.</em></h1>
        <a className={ui.btn} style={{ marginTop: 24 }} href={SITE.xUrl} target="_blank" rel="noopener noreferrer">Follow @crypsisfun</a>
      </div>
    );
  }
  if (status === "disconnected" || status === "connecting") return <Connect />;
  if (status === "locked" || status === "unlocking") return <Locked />;
  return <WithView>{banner && <ActivateBanner />}{children}</WithView>;
}

/** Unlocked, but the first sync hasn't produced a balance yet (or failed): say so instead of a blank page. */
function WithView({ children }: { children: React.ReactNode }) {
  const { view, error, sync, syncing } = useSession();
  if (view) return <>{children}</>;
  return (
    <div className={styles.center}>
      <h1 className={ui.pageTitle}>Private <em>balance</em></h1>
      {error ? (
        <>
          <ErrorNotice error={error} />
          <button type="button" className={ui.btn} style={{ marginTop: 18 }} onClick={() => sync()} disabled={syncing}>{syncing ? "Syncing…" : "Try again"}</button>
        </>
      ) : (
        <p className={ui.note} role="status">Syncing your private balance…</p>
      )}
    </div>
  );
}
