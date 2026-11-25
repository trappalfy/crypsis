"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { isAddress } from "@solana/kit";
import { callRing } from "@/lib/ring/client";
import type { BuiltTx, PrivateBalance } from "@/lib/ring/protocol";
import { useSession } from "@/lib/app/session";
import { APP_COPY } from "@/lib/copy";
import AmountInput, { validAmount } from "../AmountInput";
import TxFlow from "../TxFlow";
import Review from "../Review";
import PrivateCoinPicker from "./PrivateCoinPicker";
import ui from "../ui.module.css";
import styles from "./screens.module.css";

export default function Withdraw() {
  const { view, account, sync } = useSession();
  const params = useSearchParams();
  const [recipient, setRecipient] = useState<string | null>(null);
  const [sel, setSel] = useState<PrivateBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [locked, setLocked] = useState(false);
  if (!view || !account) return null;
  const to = (recipient ?? account.address).trim(); // default: your own wallet
  const valid = isAddress(to);
  const coin = sel ?? view.balances.find((b) => b.mint === params.get("mint")) ?? null;
  const raw = coin ? validAmount(amount, coin.decimals, coin.amount) : null;
  return (
    <div className={ui.stack}>
      <h1 className={ui.pageTitle}>Withdraw</h1>
      <div className={styles.form}>
        <fieldset className={`${ui.card} ${ui.stack}`} disabled={locked} style={{ border: 0 }}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="to" style={{ margin: 0 }}>To (any Solana address)</label>
            <input id="to" className={ui.input} spellCheck={false} autoComplete="off" value={to} onChange={(e) => setRecipient(e.target.value)} aria-invalid={!valid} />
            {to === account.address && <span className={ui.note}>Your wallet.</span>}
            {!valid && <span className={ui.note} style={{ color: "var(--err)" }} role="alert">That isn&apos;t a valid Solana address.</span>}
          </div>
          <PrivateCoinPicker balances={view.balances} selected={coin?.mint ?? null} onSelect={(b) => { setSel(b); setAmount(""); }} />
          {coin && <AmountInput value={amount} onChange={setAmount} decimals={coin.decimals} max={coin.amount} symbol={coin.symbol ?? ""} />}
        </fieldset>
        <div className={`${ui.card} ${ui.stack}`}>
          <TxFlow
            cta="Withdrawal"
            disabled={!coin || !raw || !valid}
            build={() => callRing<BuiltTx>("buildWithdraw", { recipient: to, mint: coin!.mint, amount: raw!.toString() })}
            review={(tx) => <Review tx={tx} />}
            onActiveChange={setLocked}
            publicNote={APP_COPY.withdrawPublic}
            onDone={() => { setAmount(""); void sync(); }}
          />
        </div>
      </div>
    </div>
  );
}
