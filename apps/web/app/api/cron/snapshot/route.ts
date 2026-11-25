import { revalidateTag } from "next/cache";
import { getDb } from "@crypsis/db";
import { bearer, secretMatches } from "@/lib/server/auth";
import { makeRpc } from "@/lib/indexer/rpc";
import { syncCoins, takeSnapshots } from "@/lib/indexer/sync";
import { catchUpHead } from "@/lib/indexer/backfill";
import { serverRpcUrl } from "@/lib/server/rpc";

export const maxDuration = 60;

// GET /api/cron/snapshot — Vercel Cron every 5 minutes (Authorization: Bearer CRON_SECRET).
// Registry sync -> event catch-up (webhook fallback) -> vault/supply snapshots. Read-only on Solana.
export async function GET(req: Request) {
  if (!secretMatches(bearer(req), process.env.CRON_SECRET)) return new Response("unauthorized", { status: 401 });
  if (!process.env.DATABASE_URL) return new Response("no database", { status: 503 });
  const db = getDb();
  const rpc = makeRpc(serverRpcUrl("mainnet"));
  const t0 = Date.now();
  // budgets keep the whole run inside maxDuration (60 s); unfinished work resumes on the next run
  const coins = await syncCoins(db, rpc, { resolveImages: true, maxResolve: 20, budgetMs: 15_000 });
  const events = await catchUpHead(db, rpc, { maxPages: 3, concurrency: process.env.HELIUS_API_KEY ? 8 : 2, budgetMs: 25_000 });
  const snapshots = await takeSnapshots(db, rpc);
  revalidateTag("tracker", "max");
  return Response.json({ coins, events, snapshots, ms: Date.now() - t0 });
}
