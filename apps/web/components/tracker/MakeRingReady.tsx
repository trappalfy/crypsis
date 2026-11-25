"use client";
// "Make Ring-ready" for any pump.fun coin without a Ring vault (permissionless createSplInterface).
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/app/session";
import { ringEndpoints } from "@/lib/ring/endpoints";
import { friendlyError } from "@/lib/ring/errors";
import { chainFor, signTransactionsBytes } from "@/lib/solana/wallet-standard";
import { SITE } from "@/lib/site";
import { solscanTx } from "@/components/app/TxFlow";
import ui from "@/components/app/ui.module.css";

export default function MakeRingReady() {
  const { mint } = useParams<{ mint: string }>();
  const s = useSession();
  const [eligible, setEligible] = useState<null | { tokenProgram: string; rentSol: string; alreadyReady: boolean }>(null);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ Connection, PublicKey }, { bondingCurvePda }, { getSplAssetRegistryAddress }, { address }] = await Promise.all([import("@solana/web3.js"), import("@pump-fun/pump-sdk"), import("@heliuslabs/spr/addresses"), import("@solana/kit")]);
        const conn = new Connection(ringEndpoints().rpcUrl, "confirmed");
        const m = new PublicKey(mint);
        const registry = new PublicKey(await getSplAssetRegistryAddress(address(mint)));
        const [acc, curve, reg, r1, r2] = await Promise.all([conn.getAccountInfo(m), conn.getAccountInfo(bondingCurvePda(m)), conn.getAccountInfo(registry), conn.getMinimumBalanceForRentExemption(48), conn.getMinimumBalanceForRentExemption(182)]);
        if (alive && acc && curve?.owner.toBase58() === "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
          setEligible({ tokenProgram: acc.owner.toBase58(), rentSol: ((r1 + r2) / 1e9).toFixed(5), alreadyReady: !!reg && reg.data.length > 0 });
      } catch { /* not a pump coin / bad address */ }
    })();
    return () => { alive = false; };
  }, [mint]);

  if (!eligible) return null;
  const live = SITE.appLive || SITE.network === "devnet";
  if (eligible.alreadyReady) return <div className={ui.notice} style={{ marginTop: 28, maxWidth: 560 }}>This coin is already Ring-ready. It shows up in the tracker within a few minutes.</div>;
  const run = async () => {
    if (!s.wallet || !s.account) return;
    setState("busy"); setMsg(null);
    try {
      const [{ Connection, PublicKey }, { ringReadyInstructions, toV0 }] = await Promise.all([import("@solana/web3.js"), import("@/lib/pump/launch")]);
      const conn = new Connection(ringEndpoints().rpcUrl, "confirmed");
      const user = new PublicKey(s.account.address);
      const tx = await toV0(conn, user, await ringReadyInstructions(user, new PublicKey(mint), new PublicKey(eligible.tokenProgram), false));
      const [signed] = await signTransactionsBytes(s.wallet, s.account, [tx.serialize()], chainFor(SITE.network));
      const sg = await conn.sendRawTransaction(signed);
      await conn.confirmTransaction(sg, "confirmed");
      setSig(sg); setState("done");
    } catch (e) { setMsg(friendlyError(e as never).message); setState("idle"); }
  };
  return (
    <div className={ui.card} style={{ marginTop: 28, maxWidth: 560 }}>
      <p className={ui.label}>This is a pump.fun coin</p>
      <p className={ui.note} style={{ marginBottom: 14 }}>Anyone can open its Ring vault. One transaction signed by you: network fee ≈ 0.000005 SOL + one-time rent ≈ {eligible.rentSol} SOL. Public, like any Solana transaction.</p>
      {state === "done" && sig ? (
        <div className={ui.notice}>Done — the coin is Ring-ready. It shows up in the tracker within a few minutes. <a href={solscanTx(sig)} target="_blank" rel="noopener noreferrer">View transaction ↗</a></div>
      ) : !live ? (
        <p className={ui.note}>Launch soon.</p>
      ) : !s.account ? (
        <div className={ui.row}>{s.wallets.map((w) => <button key={w.name} type="button" className={ui.chip} onClick={() => s.connect(w)}>Connect {w.name}</button>)}</div>
      ) : (
        <button type="button" className={ui.btn} onClick={run} disabled={state === "busy"}>{state === "busy" ? "Check your wallet…" : "Make Ring-ready"}</button>
      )}
      {msg && <div className={`${ui.notice} ${ui.noticeErr}`} role="alert" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
