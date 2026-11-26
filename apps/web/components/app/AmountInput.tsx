"use client";
import { formatUnits, parseUnits } from "@/lib/app/amount";
import ui from "./ui.module.css";

export default function AmountInput({ value, onChange, decimals, max, symbol, reserve = 0n, label = "Amount", id = "amount" }: { value: string; onChange: (v: string) => void; decimals: number; max: string; symbol: string; reserve?: bigint; label?: string; id?: string }) {
  const parsed = value ? parseUnits(value, decimals) : null;
  const maxRaw = BigInt(max) > reserve ? BigInt(max) - reserve : 0n;
  const invalid = value !== "" && (parsed === null || parsed <= 0n || parsed > maxRaw);
  const set = (raw: bigint) => onChange(formatUnits(raw, decimals, decimals).replace(/,/g, ""));
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id} style={{ margin: 0 }}>{label}</label>
      <input id={id} className={ui.input} inputMode="decimal" autoComplete="off" placeholder="0.0" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} />
      <div className={ui.row}>
        <span className={ui.note}>Available: {formatUnits(maxRaw, decimals)} {symbol}</span>
        {[25, 50, 100].map((p) => (
          <button key={p} type="button" className={ui.pct} onClick={() => set((maxRaw * BigInt(p)) / 100n)}>{p === 100 ? "Max" : `${p}%`}</button>
        ))}
      </div>
      {invalid && <span className={ui.note} style={{ color: "var(--err)" }} role="alert">{parsed === null ? `Use up to ${decimals} decimals.` : parsed <= 0n ? "Enter an amount greater than zero." : "More than available."}</span>}
    </div>
  );
}
export const validAmount = (value: string, decimals: number, max: string, reserve = 0n) => {
  const p = parseUnits(value, decimals);
  return p !== null && p > 0n && p <= BigInt(max) - reserve ? p : null;
};
