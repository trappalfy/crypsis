"use client";
// Review -> Sign -> Pending -> Done (brief §6, §10: always a review screen with fee and what is public).
import { useEffect, useState } from "react";
import { callRing } from "@/lib/ring/client";
import { useSession } from "@/lib/app/session";
import { lamportsToSol } from "@/lib/app/amount";
import type { BuiltTx, SubmitResult } from "@/lib/ring/protocol";
import { SITE } from "@/lib/site";
import { ErrorNotice } from "./Gate";
import ui from "./ui.module.css";

type Phase = "idle" | "building" | "review" | "signing" | "pending" | "done" | "error";
export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}${SITE.network === "devnet" ? "?cluster=devnet" : ""}`;

export default function TxFlow({
  cta, build, review, publicNote, disabled, onDone, sync = true, onActiveChange,
}: {
  cta: string;
  build: () => Promise<BuiltTx | null>;
  review: (tx: BuiltTx) => React.ReactNode;
  publicNote?: string;
  disabled?: boolean;
  onDone?: (r: SubmitResult) => void;
  sync?: boolean;
  /** true while a transaction is built/being signed: the caller must lock its inputs (review = what is signed) */
  onActiveChange?: (active: boolean) => void;
}) {
  const { signAndSubmit } = useSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [tx, setTx] = useState<BuiltTx | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const active = phase === "building" || phase === "review" || phase === "signing" || phase === "pending" || (phase === "error" && !!tx);
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  const start = async () => {
    setError(null);
    setPhase("building");
    try {
      const t = await build();
      if (!t) { setPhase("done"); return; }
      setTx(t);
      setPhase("review");
    } catch (e) { setError(e); setPhase("error"); }
  };
  const sign = async () => {
    if (!tx) return;
    setPhase(tx.signer === "wallet" ? "signing" : "pending");
    try {
      const r = await signAndSubmit(tx, { sync });
      setResult(r);
      setPhase("done");
      onDone?.(r);
    } catch (e) {
      // codes and names only — never messages, which could carry addresses or URLs
      console.warn("[crypsis] transaction failed", (e as Error)?.name, (e as { code?: string }).code ?? "", ((e as { codes?: string[] }).codes ?? []).join(","));
      setError(e);
      // once a signature exists the transaction may be on chain: never offer "sign again" for it
      if ((e as { signature?: string }).signature) { setResult({ signature: (e as { signature: string }).signature, slot: null }); setPhase("done"); }
      else setPhase("error");
    }
  };

  if (phase === "idle" || phase === "building" || (phase === "error" && !tx)) {
    return (
      <div className={ui.stack}>
        {publicNote && <div className={`${ui.notice} ${ui.noticePublic}`}>{publicNote}</div>}
        <button type="button" className={ui.btn} onClick={start} disabled={disabled || phase === "building"}>{phase === "building" ? "Preparing…" : `Review ${cta.toLowerCase()}`}</button>
        <ErrorNotice error={error} />
      </div>
    );
  }
  if (phase === "done") {
    return (
      <div className={ui.stack} role="status">
        <div className={ui.notice}>
          {!result ? "Nothing to do: already done." : result.slot === null ? (
            <>Sent, but not confirmed yet. <a href={solscanTx(result.signature)} target="_blank" rel="noopener noreferrer">Check the transaction ↗</a> before trying again — don&apos;t send it twice.</>
          ) : (
            <>Done. Confirmed at slot {Number(result.slot).toLocaleString("en-US")}. <a href={solscanTx(result.signature)} target="_blank" rel="noopener noreferrer">View transaction ↗</a>{result.syncFailed ? " Refreshing your balance failed — press Sync." : ""}</>
          )}
        </div>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setPhase("idle"); setTx(null); setResult(null); setError(null); }}>Close</button>
      </div>
    );
  }
  return (
    <div className={ui.stack}>
      {tx && review(tx)}
      {tx && (
        <dl className={ui.kv}>
          <dt>Network fee</dt><dd>≈ {lamportsToSol(tx.feeLamports)} SOL</dd>
          {BigInt(tx.rentLamports) > 0n && <><dt>Rent (one-time)</dt><dd>≈ {lamportsToSol(tx.rentLamports)} SOL</dd></>}
          <dt>Signed by</dt><dd>{tx.signer === "wallet" ? "Your wallet" : "Your Crypsis vault key (in this browser)"}</dd>
        </dl>
      )}
      {publicNote && <div className={`${ui.notice} ${ui.noticePublic}`}>{publicNote}</div>}
      <ErrorNotice error={error} />
      <div className={ui.row}>
        <button type="button" className={ui.btn} onClick={sign} disabled={phase === "signing" || phase === "pending"}>
          {phase === "signing" ? "Check your wallet…" : phase === "pending" ? "Sending and confirming…" : `Sign ${cta.toLowerCase()}`}
        </button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { if (tx) void callRing("discard", { txId: tx.id }).catch(() => null); setPhase("idle"); setTx(null); setError(null); }} disabled={phase === "signing" || phase === "pending"}>Cancel</button>
      </div>
    </div>
  );
}
