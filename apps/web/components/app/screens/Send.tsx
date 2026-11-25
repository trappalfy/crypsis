"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isAddress } from "@solana/kit";
import Cipher from "@/components/ascii/Cipher";
import { callRing } from "@/lib/ring/client";
import type { BuiltTx, PrivateBalance } from "@/lib/ring/protocol";
import { useSession } from "@/lib/app/session";
import { APP_COPY } from "@/lib/copy";
import { SITE } from "@/lib/site";
import AmountInput, { validAmount } from "../AmountInput";
import TxFlow from "../TxFlow";
import Review from "../Review";
import PrivateCoinPicker from "./PrivateCoinPicker";
import ui from "../ui.module.css";
import styles from "./screens.module.css";

export default function Send() {
  const { view, sync } = useSession();
  const params = useSearchParams();
  const [recipient, setRecipient] = useState("");
  const [reg, setReg] = useState<"idle" | "checking" | "yes" | "no">("idle");
  const [sel, setSel] = useState<PrivateBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [locked, setLocked] = useState(false);
  const valid = isAddress(recipient.trim());
  const self = recipient.trim() === view?.ringAddress;

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const t = setTimeout(() => {
      setReg("checking");
      callRing<{ registered: boolean }>("checkRecipient", { address: recipient.trim() }).then((r) => alive && setReg(r.registered ? "yes" : "no"), () => alive && setReg("idle"));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [recipient, valid]);

  if (!view) return null;
  const pre = params.get("mint");
  const coin = sel ?? view.balances.find((b) => b.mint === pre) ?? null;
  const raw = coin ? validAmount(amount, coin.decimals, coin.amount) : null;
  const status = !recipient ? null : !valid ? "That isn't a valid Solana address." : self ? "That's your own address." : reg === "no" ? `${APP_COPY.notActivated}.` : null;

  return (
    <div className={ui.stack}>
      <h1 className={ui.pageTitle}>Send <em>privately</em></h1>
      <div className={styles.form}>
        <fieldset className={`${ui.card} ${ui.stack}`} disabled={locked} style={{ border: 0 }}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="to" style={{ margin: 0 }}>Recipient (Solana address)</label>
            <input id="to" className={ui.input} autoComplete="off" spellCheck={false} value={recipient} onChange={(e) => { setRecipient(e.target.value); setReg("idle"); }} aria-invalid={!!status && reg !== "checking"} placeholder="Address" />
            {reg === "checking" && <span className={ui.note}>Checking the Ring registry…</span>}
            {reg === "yes" && valid && <span className={ui.note} style={{ color: "var(--ok)" }}>Can receive encrypted transfers.</span>}
            {status && <span className={ui.note} style={{ color: reg === "no" ? "var(--warn)" : "var(--err)" }} role="alert">{status}</span>}
            {reg === "no" && (
              <button type="button" className={ui.chip} onClick={async () => { await navigator.clipboard.writeText(`${SITE.url}/app`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? "Copied" : APP_COPY.copyInvite}
              </button>
            )}
          </div>
          <PrivateCoinPicker balances={view.balances} selected={coin?.mint ?? null} onSelect={(b) => { setSel(b); setAmount(""); }} />
          {coin && <AmountInput value={amount} onChange={setAmount} decimals={coin.decimals} max={coin.amount} symbol={coin.symbol ?? ""} />}
        </fieldset>
        <div className={`${ui.card} ${ui.stack}`}>
          <div className={ui.twoCol}>
            <div className={styles.hiddenCol}>
              <p className={styles.colTitle}>{APP_COPY.sendHidden}</p>
              <div className={styles.colRow}><span>Coin</span><Cipher length={6} label="Hidden" /></div>
              <div className={styles.colRow}><span>Amount</span><Cipher length={8} label="Hidden" /></div>
            </div>
            <div className={styles.publicCol}>
              <p className={styles.colTitle}>{APP_COPY.sendPublic}</p>
              <div className={styles.colRow}><span>From</span><span className={ui.mono}>{view.ringAddress.slice(0, 4)}…{view.ringAddress.slice(-4)}</span></div>
              <div className={styles.colRow}><span>To</span><span className={ui.mono}>{valid ? `${recipient.trim().slice(0, 4)}…${recipient.trim().slice(-4)}` : "—"}</span></div>
            </div>
          </div>
          <TxFlow
            cta="Transfer"
            disabled={!coin || !raw || !valid || self || reg !== "yes"}
            build={() => callRing<BuiltTx>("buildTransfer", { recipient: recipient.trim(), mint: coin!.mint, amount: raw!.toString() })}
            review={(tx) => <Review tx={tx} hidden />}
            onActiveChange={setLocked}
            publicNote="The coin and the amount are encrypted onchain. Your address and the recipient's address are public."
            onDone={() => { setAmount(""); void sync(); }}
          />
        </div>
      </div>
    </div>
  );
}
