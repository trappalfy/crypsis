"use client";
import { formatUnits } from "@/lib/app/amount";
import type { PrivateBalance } from "@/lib/ring/protocol";
import { shortAddress } from "@/lib/solana/wallet-standard";
import CoinAvatar from "../CoinAvatar";
import ui from "../ui.module.css";

export default function PrivateCoinPicker({ balances, selected, onSelect }: { balances: PrivateBalance[]; selected: string | null; onSelect: (b: PrivateBalance) => void }) {
  if (!balances.length) return <p className={ui.note}>Your private balance is empty. Deposit first.</p>;
  return (
    <div className={ui.select} role="listbox" aria-label="Coin">
      {balances.map((b) => (
        <button key={b.mint} type="button" className={ui.option} aria-pressed={selected === b.mint} onClick={() => onSelect(b)}>
          <CoinAvatar symbol={b.symbol} />
          <span style={{ flex: 1 }}>{b.symbol ?? shortAddress(b.mint)}</span>
          <span className={ui.mono}>{formatUnits(b.amount, b.decimals)}</span>
        </button>
      ))}
    </div>
  );
}
