"use client";
import { useEffect, useState } from "react";
import { callRing } from "@/lib/ring/client";
import { ringEndpoints } from "@/lib/ring/endpoints";
import type { SelftestResult } from "@/lib/ring/protocol";
import styles from "../dev.module.css";

// Phase 0 / R5: does the Ring SDK (WASM Poseidon, WebCrypto, kit) load and work in a browser Worker?
export default function RingWorkerCheck() {
  const [state, setState] = useState<{ status: "running" | "ok" | "fail"; result?: SelftestResult; error?: string }>({ status: "running" });
  useEffect(() => {
    const t = performance.now();
    callRing<SelftestResult>("selftest", { endpoints: ringEndpoints() })
      .then((result) => setState({ status: "ok", result: { ...result, totalMs: Math.round(performance.now() - t) } as SelftestResult }))
      .catch((e: Error & { code?: string }) => setState({ status: "fail", error: `${e.code ?? ""} ${e.message}` }));
  }, []);
  return (
    <>
      <h1>Ring worker</h1>
      <p>Loads @heliuslabs/spr in a Web Worker, derives Mode A keys from a throwaway signature, builds a v1 deposit and round-trips an encrypted snapshot. Nothing is signed by your wallet and nothing is sent.</p>
      <h2>Status</h2>
      <pre data-testid="ring-status" className={state.status === "ok" ? styles.ok : state.status === "fail" ? styles.bad : undefined}>{state.status}</pre>
      <h2>Result</h2>
      <pre data-testid="ring-result">{state.result ? JSON.stringify(state.result, null, 2) : state.error ?? "…"}</pre>
    </>
  );
}
