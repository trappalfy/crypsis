"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { callRing } from "@/lib/ring/client";
import { NATIVE_SOL as SOL, type BuiltTx, type PublicToken } from "@/lib/ring/protocol";
import { useSession } from "@/lib/app/session";
import { formatUnits } from "@/lib/app/amount";
import { shortAddress } from "@/lib/solana/wallet-standard";
import { APP_COPY } from "@/lib/copy";
import AmountInput, { validAmount } from "../AmountInput";
import CoinAvatar from "../CoinAvatar";
import TxFlow from "../TxFlow";
import Review from "../Review";
import { ErrorNotice } from "../Gate";
import ui from "../ui.module.css";
import styles from "./screens.module.css";

const SOL_RESERVE = 10_000_000n; // keep 0.01 SOL for fees
// Funding the vault: the wallet must keep its rent-exempt minimum (~0.00089 SOL) plus the fee, and pays the
// vault's token account (~0.00204 SOL; a little more for Token-2022) when a coin is sent along.
const WALLET_SOL_RESERVE = 1_000_000n;
const TOKEN_ACCOUNT_RENT = 2_100_000n;

function useTokens(owner: string | undefined, version: number) {
  const [tokens, setTokens] = useState<PublicToken[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    callRing<PublicToken[]>("publicTokens", { owner }).then((t) => alive && setTokens(t), (e) => alive && setError(e));
    return () => { alive = false; };
  }, [owner, version]);
  return { tokens, error };
}

function TokenList({ tokens, selected, onSelect }: { tokens: PublicToken[]; selected: string | null; onSelect: (t: PublicToken) => void }) {
  return (
    <div className={ui.select} role="listbox" aria-label="Coin">
      {tokens.map((t) => (
        <button key={t.tokenAccount + t.mint} type="button" className={ui.option} aria-pressed={selected === t.mint} onClick={() => onSelect(t)}>
          <CoinAvatar symbol={t.symbol} />
          <span style={{ flex: 1 }}>
            {t.symbol ?? shortAddress(t.mint)} {t.isPump && <span className={ui.pumpBadge}>pump</span>} {t.ringReady && t.mint !== SOL && <span className={ui.ringDot} title="Ring-ready" aria-label="Ring-ready" />}
          </span>
          <span className={ui.mono}>{formatUnits(t.amount, t.decimals)}</span>
        </button>
      ))}
    </div>
  );
}

function FundVault({ onFunded }: { onFunded: () => void }) {
  const { account, view } = useSession();
  const { tokens } = useTokens(account?.address, 0);
  const [sol, setSol] = useState("0.02");
  const [tok, setTok] = useState<PublicToken | null>(null);
  const [amt, setAmt] = useState("");
  const [locked, setLocked] = useState(false);
  if (!account || !view) return null;
  const walletSol = tokens?.find((t) => t.mint === SOL)?.amount ?? null;
  const solReserve = WALLET_SOL_RESERVE + (tok ? TOKEN_ACCOUNT_RENT : 0n);
  const lamports = sol.trim() === "" ? 0n : walletSol !== null ? validAmount(sol, 9, walletSol, solReserve) : null;
  const canPayFees = walletSol !== null && BigInt(walletSol) >= solReserve;
  const tokenRaw = tok ? validAmount(amt, tok.decimals, tok.amount) : null;
  return (
    <div className={ui.card}>
      <p className={ui.label}>Fund your Crypsis vault</p>
      <p className={ui.note} style={{ marginBottom: 14 }}>{APP_COPY.modeBBody}</p>
      <fieldset disabled={locked} style={{ border: 0 }}>
        {walletSol === null ? (
          <div className={ui.field}>
            <label className={ui.label} htmlFor="sol" style={{ margin: 0 }}>SOL for fees</label>
            <input id="sol" className={ui.input} inputMode="decimal" value={sol} onChange={(e) => setSol(e.target.value)} />
          </div>
        ) : (
          <AmountInput id="sol" label="SOL for fees" value={sol} onChange={setSol} decimals={9} max={walletSol} symbol="SOL" reserve={solReserve} />
        )}
        {walletSol !== null && !canPayFees && (
          <div className={ui.notice} style={{ marginTop: 10 }}>Add SOL to your wallet first: funding needs about {formatUnits(solReserve, 9)} SOL left in the wallet for the network fee{tok ? " and the vault's account for this coin" : ""}.</div>
        )}
        {tokens && <div style={{ marginTop: 14 }}><TokenList tokens={tokens.filter((t) => t.mint !== SOL)} selected={tok?.mint ?? null} onSelect={(t) => { setTok(t); setAmt(""); }} /></div>}
        {tok && <div style={{ marginTop: 14 }}><AmountInput value={amt} onChange={setAmt} decimals={tok.decimals} max={tok.amount} symbol={tok.symbol ?? ""} /></div>}
      </fieldset>
      <div style={{ marginTop: 16 }}>
        <TxFlow
          cta="Funding"
          sync={false}
          disabled={lamports === null || !canPayFees || (lamports <= 0n && !tokenRaw)}
          build={() => callRing<BuiltTx>("buildFundVault", { from: account.address, lamports: (lamports ?? 0n).toString(), ...(tok && tokenRaw ? { token: { mint: tok.mint, amount: tokenRaw.toString(), tokenAccount: tok.tokenAccount, tokenProgram: tok.tokenProgram, decimals: tok.decimals } } : {}) })}
          review={(tx) => <Review tx={tx} />}
          onActiveChange={setLocked}
          publicNote="This funding transfer is public and links your wallet to the vault address."
          onDone={onFunded}
        />
      </div>
    </div>
  );
}

export default function Deposit() {
  const { view, mode, account, sync } = useSession();
  const params = useSearchParams();
  const [version, setVersion] = useState(0);
  const owner = mode === "B" ? view?.ringAddress : account?.address;
  const { tokens, error } = useTokens(owner, version);
  const [sel, setSel] = useState<PublicToken | null>(null);
  const [amount, setAmount] = useState("");
  const [locked, setLocked] = useState(false);
  const pre = params.get("mint");
  const selected = sel ?? (tokens && pre ? tokens.find((t) => t.mint === pre) ?? null : null);
  if (!view) return null;
  const reserve = selected?.mint === SOL ? SOL_RESERVE : 0n;
  const raw = selected ? validAmount(amount, selected.decimals, selected.amount, reserve) : null;
  return (
    <div className={ui.stack}>
      <h1 className={ui.pageTitle}>Deposit</h1>
      {mode === "B" && <FundVault onFunded={() => setVersion((v) => v + 1)} />}
      <div className={styles.form}>
        <fieldset className={ui.card} disabled={locked} style={{ border: 0 }}>
          <p className={ui.label}>{mode === "B" ? "Coin in your vault" : "Coin in your wallet"}</p>
          <ErrorNotice error={error} />
          {!tokens && !error && <div className={ui.skeleton} style={{ height: 160 }} />}
          {tokens && tokens.every((t) => t.amount === "0") && <p className={ui.note}>No coins found at {owner ? shortAddress(owner) : "this address"}.</p>}
          {tokens && <TokenList tokens={tokens.filter((t) => t.amount !== "0")} selected={selected?.mint ?? null} onSelect={(t) => { setSel(t); setAmount(""); }} />}
          {pre && tokens && !tokens.some((t) => t.mint === pre) && <p className={ui.note} style={{ marginTop: 10 }}>You don&apos;t hold {shortAddress(pre)} in this {mode === "B" ? "vault" : "wallet"}.</p>}
        </fieldset>
        <div className={`${ui.card} ${ui.stack}`}>
          {selected ? (
            <>
              <fieldset disabled={locked} style={{ border: 0 }}><AmountInput value={amount} onChange={setAmount} decimals={selected.decimals} max={selected.amount} symbol={selected.symbol ?? ""} reserve={reserve} /></fieldset>
              {selected.mint !== SOL && !selected.ringReady && <div className={ui.notice}>{APP_COPY.firstDeposit}</div>}
              <TxFlow
                cta="Deposit"
                disabled={!raw}
                build={() => callRing<BuiltTx>("buildDeposit", { mint: selected.mint, amount: raw!.toString(), tokenAccount: selected.tokenAccount, tokenProgram: selected.tokenProgram })}
                review={(tx) => <Review tx={tx} />}
                onActiveChange={setLocked}
                publicNote={APP_COPY.depositPublic}
                onDone={() => { setVersion((v) => v + 1); setAmount(""); void sync(); }}
              />
            </>
          ) : <p className={ui.note}>Pick a coin to deposit.</p>}
        </div>
      </div>
    </div>
  );
}
