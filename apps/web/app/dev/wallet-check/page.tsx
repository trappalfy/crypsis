"use client";
// Wallet compatibility check, run by the owner in real wallets (Phase 0 / R1 + R2, wallet matrix).
// Mode A (wallet signs Ring transactions): the wallet signs the Ring SDK's exact off-chain envelope, twice,
//   byte-identical, and signs (never sends) a real v1 Ring transaction.
// Mode B (Crypsis vault): the wallet signs the plain-text vault message twice, byte-identical.
// Each wallet request times out instead of hanging. Signatures are compared in memory and wiped;
// they are never shown, logged or sent anywhere.
import { useEffect, useMemo, useState } from "react";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { getAddressEncoder, address } from "@solana/kit";
import {
  capabilities,
  chainFor,
  connect,
  isUserRejection,
  signExactMessage,
  signTransactionBytes,
  watchWallets,
} from "@/lib/solana/wallet-standard";
import { derivationMessage, vaultMessage } from "@/lib/ring/derivation";
import { callRing } from "@/lib/ring/client";
import { ringEndpoints } from "@/lib/ring/endpoints";
import type { ProbeTx } from "@/lib/ring/protocol";
import { SITE } from "@/lib/site";
import styles from "../dev.module.css";

type Verdict = "pending" | "pass" | "fail" | "skipped" | "n/a";
interface Report {
  wallet: string;
  declaredTxVersions: string;
  modeA_envelopeSigned: Verdict;
  modeA_deterministic: Verdict;
  modeA_v1Signed: Verdict;
  modeB_messageSigned: Verdict;
  modeB_deterministic: Verdict;
  step: string;
  result: string;
  notes: string[];
}

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.reduce((d, x, i) => d | (x ^ b[i]), 0) === 0;
const why = (e: unknown) => (isUserRejection(e) ? "rejected in the wallet" : (e as Error)?.message ?? String(e));

/** Sign the same bytes twice and compare. Returns [signed, deterministic]. */
async function signTwice(w: Wallet, account: WalletAccount, msg: Uint8Array, notes: string[], label: string, onStep: (s: string) => void): Promise<[Verdict, Verdict]> {
  let a: Uint8Array | null = null, b: Uint8Array | null = null;
  try {
    onStep(`waiting for the wallet: ${label}, signature 1 of 2`);
    a = await signExactMessage(w, account, msg);
  } catch (e) {
    notes.push(`${label}: ${why(e)}`);
    return ["fail", "n/a"];
  }
  try {
    onStep(`waiting for the wallet: ${label}, signature 2 of 2`);
    b = await signExactMessage(w, account, msg);
    return ["pass", equal(a, b) ? "pass" : "fail"];
  } catch (e) {
    notes.push(`${label} (2nd signature): ${why(e)}`);
    return ["pass", "fail"];
  } finally {
    a.fill(0);
    b?.fill(0);
  }
}

export default function WalletCheck() {
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => watchWallets(setWallets), []);
  const caps = useMemo(() => wallets.map(capabilities), [wallets]);

  async function run(w: Wallet) {
    setBusy(true);
    const cap = capabilities(w);
    const r: Report = {
      wallet: w.name,
      declaredTxVersions: cap.txVersions.join(", ") || "none",
      modeA_envelopeSigned: cap.signsV1 ? "pending" : "n/a",
      modeA_deterministic: cap.signsV1 ? "pending" : "n/a",
      modeA_v1Signed: cap.signsV1 ? "pending" : "n/a",
      modeB_messageSigned: "pending",
      modeB_deterministic: "pending",
      step: "waiting for the wallet: connect",
      result: "checking…",
      notes: [],
    };
    const show = () => setReport({ ...r, notes: [...r.notes] });
    const onStep = (s: string) => { r.step = s; show(); };
    show();
    let account: WalletAccount;
    try {
      account = await connect(w);
    } catch (e) {
      r.notes.push(`connect: ${why(e)}`);
      r.result = "could not connect";
      r.step = "stopped at connect";
      show();
      return setBusy(false);
    }

    // Mode A: exact Ring SDK envelope (twice) + a real v1 Ring transaction (signed, never sent)
    let modeA = false;
    if (cap.signsV1) {
      const pub = getAddressEncoder().encode(address(account.address)) as Uint8Array;
      [r.modeA_envelopeSigned, r.modeA_deterministic] = await signTwice(w, account, await derivationMessage(pub), r.notes, "Mode A message", onStep);
      show();
      if (r.modeA_deterministic === "pass") {
        try {
          onStep("building a test v1 transaction");
          const probe = await callRing<ProbeTx>("probeTransaction", { endpoints: ringEndpoints(), owner: account.address });
          onStep("waiting for the wallet: sign the test v1 transaction (it is never sent)");
          const signed = await signTransactionBytes(w, account, probe.bytes, chainFor(SITE.network));
          // v1 wire = message || signatures: the message must be unchanged and the fee-payer signature non-zero
          const n = probe.bytes[1], msgLen = probe.bytes.length - 64 * n;
          const sameMsg = signed.length === probe.bytes.length && signed.subarray(0, msgLen).every((x, i) => x === probe.bytes[i]);
          const sigNonZero = signed.subarray(msgLen, msgLen + 64).some((x) => x !== 0);
          r.modeA_v1Signed = sameMsg && sigNonZero ? "pass" : "fail";
          if (!sameMsg) r.notes.push("the wallet changed the v1 transaction");
        } catch (e) {
          r.modeA_v1Signed = "fail";
          r.notes.push(`v1 transaction: ${why(e)}`);
        }
      } else {
        r.modeA_v1Signed = "skipped";
      }
      modeA = r.modeA_v1Signed === "pass";
      show();
    }

    // Mode B: plain-text vault message (twice). Only needed when Mode A is not available.
    if (modeA) {
      r.modeB_messageSigned = "skipped";
      r.modeB_deterministic = "skipped";
    } else {
      [r.modeB_messageSigned, r.modeB_deterministic] = await signTwice(w, account, vaultMessage(), r.notes, "Mode B message", onStep);
      if (!cap.signTransaction) r.notes.push("the wallet can't sign transactions without sending them (needed to fund a vault)");
    }
    r.result = modeA
      ? "Mode A: the wallet signs Ring transactions itself"
      : r.modeB_deterministic === "pass" && cap.signTransaction
        ? "Mode B: works through a Crypsis vault"
        : "not supported";
    r.step = "done";
    show();
    setBusy(false);
  }

  return (
    <>
      <h1>Wallet check</h1>
      <p>
        Network: <b>{SITE.network}</b>. Up to four message signatures and one transaction signature. Nothing is sent to the
        network and nothing leaves this browser tab. Send a screenshot of the report.
      </p>
      <h2>Detected wallets</h2>
      {caps.length === 0 && <p>No Wallet Standard wallet found. Install Phantom, Solflare or Backpack and reload.</p>}
      <table className={styles.table}>
        <thead><tr><th>Wallet</th><th>signMessage</th><th>signTransaction</th><th>tx versions</th><th /></tr></thead>
        <tbody>
          {caps.map((c, i) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td>{c.signMessage ? "yes" : "no"}</td>
              <td>{c.signTransaction ? "yes" : "no"}</td>
              <td className={c.signsV1 ? styles.ok : styles.warn}>{c.txVersions.join(", ") || "—"}</td>
              <td><button className={styles.btn} disabled={busy} onClick={() => run(wallets[i])}>Run check</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {report && (
        <>
          <h2>Report {report.wallet}</h2>
          {busy && <p className={styles.warn}>Now: {report.step}. If no window appears, click the wallet&apos;s icon in the browser toolbar: the request may be waiting there.</p>}
          <pre data-testid="wallet-report">{JSON.stringify(report, null, 2)}</pre>
          <p>Mode A: the wallet signs Ring transactions itself. Mode B: the wallet unlocks a separate Crypsis vault that signs them. A wallet that gives different signatures for the same message is not supported. A request the wallet doesn&apos;t answer times out after 3 minutes.</p>
        </>
      )}
    </>
  );
}
