// Tracker backfill (read-only against mainnet): registry -> coins, events since 2026-11-10, snapshot.
// usage: DATABASE_URL=... [MAINNET_RPC_URL=...] tsx scripts/backfill.ts [--max-tx N] [--concurrency N] [--skip-events]
import { closeDb, getDb } from "@crypsis/db";
import { makeRpc } from "../lib/indexer/rpc";
import { syncCoins, takeSnapshots } from "../lib/indexer/sync";
import { backfillHistory } from "../lib/indexer/backfill";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const rpcUrl = process.env.MAINNET_RPC_URL ?? (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "https://api.mainnet-beta.solana.com");
const rpc = makeRpc(rpcUrl);
const db = getDb();
const t0 = Date.now();
const coins = await syncCoins(db, rpc, { maxResolve: 10_000, budgetMs: 30 * 60_000 });
console.log("coins", coins, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!process.argv.includes("--skip-events")) {
  const r = await backfillHistory(db, rpc, {
    maxTx: arg("--max-tx") ? Number(arg("--max-tx")) : undefined,
    concurrency: Number(arg("--concurrency") ?? (process.env.HELIUS_API_KEY ? 12 : 3)),
    onProgress: (p) => console.log("events", p, `${((Date.now() - t0) / 1000).toFixed(0)}s`),
  });
  console.log("events done", r);
}
console.log("snapshots", await takeSnapshots(db, rpc));
await closeDb();
