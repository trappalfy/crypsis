"use client";
// Review rows rendered ONLY from the built transaction's summary (brief §10: review shows what is signed).
import { formatUnits, lamportsToSol } from "@/lib/app/amount";
import type { BuiltTx } from "@/lib/ring/protocol";
import ui from "./ui.module.css";

export default function Review({ tx, hidden = false }: { tx: BuiltTx; hidden?: boolean }) {
  const s = tx.summary;
  const coin = s.symbol ?? s.mint ?? "SOL";
  return (
    <dl className={ui.kv}>
      {s.mint && <><dt>Coin{hidden ? " (hidden onchain)" : ""}</dt><dd>{coin}</dd></>}
      {s.amount && s.decimals !== undefined && <><dt>Amount{hidden ? " (hidden onchain)" : ""}</dt><dd>{formatUnits(s.amount, s.decimals, s.decimals)}</dd></>}
      {s.lamports && BigInt(s.lamports) > 0n && <><dt>SOL</dt><dd>{lamportsToSol(s.lamports)}</dd></>}
      {s.from && <><dt>From (public)</dt><dd>{s.from}</dd></>}
      {s.recipient && <><dt>To (public)</dt><dd>{s.recipient}</dd></>}
      {s.createsInterface && <><dt>Also</dt><dd>Opens the Ring vault for this coin</dd></>}
    </dl>
  );
}
