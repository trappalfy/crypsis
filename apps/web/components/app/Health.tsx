"use client";
// Status indicator for the Ring services (R11): RPC, indexer, prover attestation.
import { useEffect, useState } from "react";
import { callRing } from "@/lib/ring/client";
import { ringEndpoints } from "@/lib/ring/endpoints";
import ui from "./ui.module.css";

export default function Health() {
  const [h, setH] = useState<{ rpc: boolean; indexer: boolean; prover: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => callRing<{ rpc: boolean; indexer: boolean; prover: boolean }>("health", { endpoints: ringEndpoints() }).then((r) => alive && setH(r), () => {});
    run();
    const iv = setInterval(run, 120_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  if (!h) return null;
  const ok = h.rpc && h.indexer && h.prover;
  return (
    <span className={`${ui.note} ${ui.row}`} role="status" title={`RPC ${h.rpc ? "ok" : "down"} · indexer ${h.indexer ? "ok" : "down"} · prover ${h.prover ? "ok" : "down"}`}>
      <span className={ui.dot} style={{ background: ok ? "var(--ok)" : "var(--err)" }} />
      {ok ? "Ring online" : !h.prover ? "Prover unavailable" : !h.indexer ? "Indexer unavailable" : "RPC unavailable"}
    </span>
  );
}
