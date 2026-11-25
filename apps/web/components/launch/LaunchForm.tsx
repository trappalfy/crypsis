"use client";
// Brief §6 /launch: form left, live preview right; honest list of transactions before signing;
// Tx1 create (+dev buy) -> Tx2 Ring-ready (+Crypsis memo) -> optional Tx3 shield dev buy.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AsciiImage from "@/components/ascii/AsciiImage";
import HatchCanvas from "@/components/site/HatchCanvas";
import { useSession } from "@/lib/app/session";
import { formatUnits, lamportsToSol, parseUnits } from "@/lib/app/amount";
import { callRing } from "@/lib/ring/client";
import { ringEndpoints } from "@/lib/ring/endpoints";
import { friendlyError } from "@/lib/ring/errors";
import type { BuiltTx } from "@/lib/ring/protocol";
import { chainFor, signTransactionsBytes } from "@/lib/solana/wallet-standard";
import { APP_COPY } from "@/lib/copy";
import { SITE } from "@/lib/site";
import { NAME_MAX, SYMBOL_MAX, shareOnXUrl, validateLaunch } from "@/lib/pump/launch";
import { solscanTx } from "@/components/app/TxFlow";
import ui from "@/components/app/ui.module.css";
import styles from "./Launch.module.css";

type Phase = "form" | "uploading" | "building" | "signing" | "create" | "buy" | "ringReady" | "recording" | "shield" | "done" | "failed";
const PHASE_TEXT: Partial<Record<Phase, string>> = {
  uploading: "Uploading metadata…", building: "Preparing transactions…", signing: "Check your wallet…",
  create: "Creating your coin on pump.fun…", buy: "Sending your dev buy…", ringReady: "Opening the Ring vault…", recording: "Recording…", shield: "Shielding your dev buy…",
};
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

type StepState = "ok" | "failed" | "skipped";
interface Result {
  mint: string;
  createSig: string;
  /** outcome of every step after create — the success screen shows exactly this */
  buy: StepState; ring: StepState; shield: StepState;
  ringSig?: string; shieldSig?: string; shieldError?: string;
}

export default function LaunchForm() {
  const live = SITE.appLive || SITE.network === "devnet";
  const s = useSession();
  const [name, setName] = useState(""); const [symbol, setSymbol] = useState(""); const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [twitter, setTwitter] = useState(""); const [telegram, setTelegram] = useState(""); const [website, setWebsite] = useState("");
  const [devBuy, setDevBuy] = useState("0");
  const [ringReady, setRingReady] = useState(true);
  const [shield, setShield] = useState(false);
  const [quote, setQuote] = useState<{ tokens: bigint; rent: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const devBuyLamports = parseUnits(devBuy || "0", 9) ?? -1n;

  // live quote: tokens for the dev buy + Ring vault rent (fresh global/feeConfig)
  useEffect(() => {
    if (!live) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [{ Connection }, pump, { NATIVE_MINT }, BN] = await Promise.all([import("@solana/web3.js"), import("@pump-fun/pump-sdk"), import("@solana/spl-token"), import("bn.js")]);
        const conn = new Connection(ringEndpoints().rpcUrl, "confirmed");
        const online = new pump.OnlinePumpSdk(conn);
        const [global, feeConfig, a, b] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig(), conn.getMinimumBalanceForRentExemption(48), conn.getMinimumBalanceForRentExemption(182)]);
        const tokens = devBuyLamports > 0n ? BigInt(pump.getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: new BN.default(devBuyLamports.toString()), quoteMint: NATIVE_MINT }).toString()) : 0n;
        if (alive) setQuote({ tokens, rent: a + b });
      } catch { if (alive) setQuote(null); }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [devBuyLamports, live]);

  const invalid = validateLaunch(name, symbol) ?? (!file ? "Add an image." : devBuyLamports < 0n ? "Dev buy must be a SOL amount." : null);
  const canLaunch = live && !invalid && !!s.account && phase === "form";

  async function launch() {
    if (!s.wallet || !s.account || !file) return;
    setError(null);
    let created: Result | null = null;
    try {
      setPhase("uploading");
      const fd = new FormData();
      Object.entries({ name, symbol, description, twitter, telegram, website }).forEach(([k, v]) => v && fd.append(k, v));
      fd.append("file", file);
      const up = await fetch("/api/ipfs", { method: "POST", body: fd });
      const upj = (await up.json()) as { metadataUri?: string; error?: string };
      if (!up.ok || !upj.metadataUri) throw new Error(upj.error ?? "Couldn't upload the metadata.");

      setPhase("building");
      const [{ Connection, PublicKey }, { buildLaunch }] = await Promise.all([import("@solana/web3.js"), import("@/lib/pump/launch")]);
      const conn = new Connection(ringEndpoints().rpcUrl, "confirmed");
      const user = new PublicKey(s.account.address);
      const built = await buildLaunch({ connection: conn, user, name: name.trim(), symbol: symbol.trim(), uri: upj.metadataUri, devBuyLamports, ringReady });
      const mint = built.mint.publicKey.toBase58();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

      setPhase("signing"); // one wallet prompt for every launch transaction
      const signed = await signTransactionsBytes(s.wallet, s.account, built.txs.map((t) => t.tx.serialize()), chainFor(SITE.network));
      const send = async (bytes: Uint8Array) => {
        const sig = await conn.sendRawTransaction(bytes, { preflightCommitment: "confirmed", maxRetries: 3 });
        const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        if (conf.value.err) throw new Error(JSON.stringify(conf.value.err));
        return sig;
      };
      for (let i = 0; i < built.txs.length; i++) {
        const label = built.txs[i].label;
        setPhase(label);
        if (label === "create") {
          created = { mint, createSig: await send(signed[i]), buy: devBuyLamports > 0n && !built.buySplit ? "ok" : "skipped", ring: ringReady ? "failed" : "skipped", shield: "skipped" };
          continue; // a failed create throws: nothing was created
        }
        try {
          const sig = await send(signed[i]);
          if (label === "buy") created = { ...created!, buy: "ok" };
          if (label === "ringReady") created = { ...created!, ring: "ok", ringSig: sig };
        } catch {
          if (label === "buy") created = { ...created!, buy: "failed" };
          if (label === "ringReady") created = { ...created!, ring: "failed" };
        }
      }

      setPhase("recording");
      await fetch("/api/launches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint, createSig: created!.createSig, ringSig: created!.ringSig }) }).catch(() => null);

      if (shield && created!.buy === "ok" && created!.ring === "ok" && s.status === "unlocked") {
        setPhase("shield");
        try { created = { ...created!, shield: "ok", shieldSig: await shieldDevBuy(mint, conn) }; }
        catch (e) { created = { ...created!, shield: "failed", shieldError: friendlyError(e as never).message }; }
      } else if (shield) {
        created = { ...created!, shield: "failed", shieldError: s.status !== "unlocked" ? "Your private balance was locked." : "The dev buy or the Ring vault didn't go through." };
      }
      setResult(created);
      setPhase("done");
    } catch (e) {
      if (created) { setResult(created); setPhase("done"); return; }
      const msg = (e as Error)?.message ?? String(e);
      const f = friendlyError(e as never);
      setError(/cancel|reject|denied/i.test(msg) ? f.message : `Launch failed, nothing was created. ${f.retry ? msg.slice(0, 160) : f.message}`);
      setPhase("form");
    }
  }

  /** Tx3: deposit the dev buy into the private balance (Mode A: wallet; Mode B: fund vault, then vault deposit). */
  async function shieldDevBuy(mint: string, conn: import("@solana/web3.js").Connection): Promise<string> {
    const { PublicKey } = await import("@solana/web3.js");
    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    const owner = s.account!.address;
    const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), false, new PublicKey(TOKEN_2022)).toBase58();
    const bal = await conn.getTokenAccountBalance(new PublicKey(ata), "confirmed");
    const amount = bal.value.amount;
    if (s.mode === "B") {
      const fund = await callRing<BuiltTx>("buildFundVault", { from: owner, lamports: "0", token: { mint, amount, tokenAccount: ata, tokenProgram: TOKEN_2022, decimals: bal.value.decimals } });
      await s.signAndSubmit(fund, { sync: false });
      const vaultAta = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(s.view!.ringAddress), true, new PublicKey(TOKEN_2022)).toBase58();
      const dep = await callRing<BuiltTx>("buildDeposit", { mint, amount, tokenAccount: vaultAta, tokenProgram: TOKEN_2022 });
      return (await s.signAndSubmit(dep)).signature;
    }
    const dep = await callRing<BuiltTx>("buildDeposit", { mint, amount, tokenAccount: ata, tokenProgram: TOKEN_2022 });
    return (await s.signAndSubmit(dep)).signature;
  }

  if (phase === "done" && result) {
    return (
      <div className={styles.success}>
        <div className={styles.hatch}><HatchCanvas drive="time" cols={90} rows={38} /></div>
        <h1 className={ui.pageTitle}>{result.ring === "ok" ? <>Launched. <em>Ring-ready.</em></> : <>Launched.</>}</h1>
        <ul className={styles.outcomes} aria-label="What happened">
          <li>Coin created on pump.fun ✓</li>
          {result.buy !== "skipped" && <li className={result.buy === "ok" ? undefined : styles.bad}>Dev buy {result.buy === "ok" ? "✓" : "— didn't go through"}</li>}
          {result.ring !== "skipped" && <li className={result.ring === "ok" ? undefined : styles.bad}>Ring vault {result.ring === "ok" ? "✓" : "— didn't go through"}</li>}
          {result.shield !== "skipped" && <li className={result.shield === "ok" ? undefined : styles.bad}>Dev buy shielded {result.shield === "ok" ? "✓" : `— ${result.shieldError ?? "didn't go through"}`}</li>}
        </ul>
        {result.ring === "failed" && <div className={`${ui.notice} ${ui.noticePublic}`}>Your coin is live on pump.fun, but opening its Ring vault didn&apos;t go through. Anyone can do it from the coin page: <Link href={`/coin/${result.mint}`}>Make Ring-ready</Link>.</div>}
        {result.ring === "skipped" && <div className={ui.notice}>You launched without a Ring vault. Anyone can open it later from the coin page.</div>}
        <div className={ui.row} style={{ justifyContent: "center", marginTop: 18 }}>
          <a className={ui.btn} href={`https://pump.fun/coin/${result.mint}`} target="_blank" rel="noopener noreferrer">View on pump.fun ↗</a>
          <a className={`${ui.btn} ${ui.btnGhost}`} href={solscanTx(result.createSig)} target="_blank" rel="noopener noreferrer">Solscan ↗</a>
          <Link className={`${ui.btn} ${ui.btnGhost}`} href={`/coin/${result.mint}`}>Tracker page</Link>
          <a className={`${ui.btn} ${ui.btnGhost}`} href={shareOnXUrl(result.mint)} target="_blank" rel="noopener noreferrer">Share on X</a>
        </div>
        <p className={ui.note} style={{ marginTop: 14 }}>Mint {result.mint}</p>
      </div>
    );
  }

  const busy = phase !== "form";
  return (
    <div className={styles.grid}>
      <form className={`${ui.card} ${ui.stack}`} onSubmit={(e) => { e.preventDefault(); if (canLaunch) void launch(); }} aria-describedby="launch-status">
        <h1 className={ui.pageTitle} style={{ fontSize: "clamp(40px,5vw,72px)" }}>Launch <em>your coin</em></h1>
        {!live && <div className={ui.notice}>Launch soon. This is a preview of the form.</div>}
        <fieldset className={ui.stack} disabled={busy || !live} style={{ border: 0 }}>
          <div className={ui.twoCol}>
            <label className={ui.field}><span className={ui.label} style={{ margin: 0 }}>Name ({name.length}/{NAME_MAX})</span><input className={ui.input} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} required /></label>
            <label className={ui.field}><span className={ui.label} style={{ margin: 0 }}>Ticker ({symbol.length}/{SYMBOL_MAX})</span><input className={ui.input} value={symbol} maxLength={SYMBOL_MAX} onChange={(e) => setSymbol(e.target.value.toUpperCase())} required /></label>
          </div>
          <label className={ui.field}><span className={ui.label} style={{ margin: 0 }}>Description</span><textarea className={ui.input} rows={3} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className={styles.drop}>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <span>{file ? file.name : "Drop an image or click to choose (PNG, JPG, GIF, WebP · up to 4 MB)"}</span>
          </label>
          <div className={ui.twoCol}>
            <label className={ui.field}><span className={ui.label} style={{ margin: 0 }}>X</span><input className={ui.input} placeholder="https://x.com/…" value={twitter} onChange={(e) => setTwitter(e.target.value)} /></label>
            <label className={ui.field}><span className={ui.label} style={{ margin: 0 }}>Telegram</span><input className={ui.input} placeholder="https://t.me/…" value={telegram} onChange={(e) => setTelegram(e.target.value)} /></label>
          </div>
          <label className={ui.field}><span className={ui.label} style={{ margin: 0 }}>Website</span><input className={ui.input} placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          <label className={ui.field}>
            <span className={ui.label} style={{ margin: 0 }}>Dev buy (SOL)</span>
            <input className={ui.input} inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value)} />
            <span className={ui.note}>{devBuyLamports > 0n && quote ? `≈ ${formatUnits(quote.tokens, 6, 0)} tokens` : "0 = create without buying"}</span>
          </label>
          <label className={styles.toggle}>
            <input type="checkbox" checked={ringReady} onChange={(e) => { setRingReady(e.target.checked); if (!e.target.checked) setShield(false); }} />
            <span>{APP_COPY.launchRingReady(quote ? lamportsToSol(BigInt(quote.rent)) : "0.0025")}</span>
          </label>
          <label className={styles.toggle}>
            <input type="checkbox" checked={shield} disabled={!ringReady || devBuyLamports <= 0n} onChange={(e) => setShield(e.target.checked)} />
            <span>{APP_COPY.launchShield}</span>
          </label>
          {shield && s.status !== "unlocked" && (
            <div className={ui.notice}>Shielding needs your private balance unlocked. <button type="button" className={ui.chip} onClick={() => void s.unlock()} disabled={!s.account || s.status === "unlocking"}>{s.status === "unlocking" ? "Check your wallet…" : "Unlock now"}</button></div>
          )}
        </fieldset>
        <div className={ui.notice}>
          <p className={ui.label} style={{ marginBottom: 8 }}>You will sign</p>
          <ol className={styles.txList}>
            <li><b>Tx1</b> create on pump.fun{devBuyLamports > 0n ? " + dev buy" : ""} — signed by you and the new mint key</li>
            {ringReady && <li><b>Tx2</b> open the Ring vault for the coin — signed by you</li>}
            {shield && <li><b>Tx3</b> deposit the dev buy (≈ {quote ? formatUnits(quote.tokens, 6, 0) : "…"} tokens) into your private balance, network fee ≈ 0.000005 SOL — signed {s.mode === "B" ? "by your Crypsis vault in this browser, right after a public funding transfer from your wallet; no further prompt" : "by you"}</li>}
          </ol>
          <p className={ui.note} style={{ marginTop: 8 }}>Everything about the launch is public, like any pump.fun launch.</p>
        </div>
        {!s.account ? (
          <div className={ui.stack}>
            {s.wallets.map((w) => <button key={w.name} type="button" className={ui.option} onClick={() => s.connect(w)}>Connect {w.name}</button>)}
            {s.wallets.length === 0 && <p className={ui.note}>Install a Solana wallet to launch.</p>}
          </div>
        ) : (
          <button type="submit" className={ui.btn} disabled={!canLaunch}>{busy ? PHASE_TEXT[phase] ?? "Working…" : live ? "Launch" : "Launch soon"}</button>
        )}
        <p id="launch-status" className={ui.note} role="status">{busy ? PHASE_TEXT[phase] : invalid && (name || symbol || file) ? invalid : ""}</p>
        {error && <div className={`${ui.notice} ${ui.noticeErr}`} role="alert">{error}</div>}
      </form>
      <aside className={styles.preview} aria-label="Preview">
        <div className={ui.card}>
          {preview ? <AsciiImage src={preview} alt={name} /> : <div className={styles.placeholder}>your coin</div>}
          <div className={styles.previewBody}>
            <p className={styles.previewName}>{name || "Your coin"} <span className={ui.muted}>{symbol ? `$${symbol}` : ""}</span></p>
            <p className={ui.note}>{description || "Description"}</p>
            <div className={ui.row} style={{ marginTop: 12 }}>
              {ringReady && <span className={ui.badge}>Ring-ready</span>}
              <span className={ui.chip}>pump.fun</span>
            </div>
          </div>
        </div>
        <p className={ui.note} style={{ marginTop: 10 }}>Hover the image to see it through the Ring.</p>
      </aside>
    </div>
  );
}
