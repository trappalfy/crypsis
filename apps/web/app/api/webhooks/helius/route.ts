import { revalidateTag } from "next/cache";
import { getDb } from "@crypsis/db";
import { bearer, secretMatches } from "@/lib/server/auth";
import { parseRingTransaction } from "@/lib/indexer/parse";
import { insertEvents } from "@/lib/indexer/store";
import type { RawTransaction } from "@/lib/indexer/rpc";

// POST /api/webhooks/helius — Helius raw webhook on the Solana Privacy Program.
// Auth: the webhook's authHeader must equal HELIUS_WEBHOOK_SECRET (constant-time compare).
// Logs carry no IPs or wallet addresses.
export async function POST(req: Request) {
  if (!secretMatches(bearer(req), process.env.HELIUS_WEBHOOK_SECRET)) return new Response("unauthorized", { status: 401 });
  if (!process.env.DATABASE_URL) return new Response("no database", { status: 503 });
  let body: unknown;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const txs = (Array.isArray(body) ? body : [body]) as RawTransaction[];
  if (txs.length > 1000) return new Response("too many", { status: 413 });
  let stored = 0;
  const db = getDb();
  for (const tx of txs) {
    if (!tx?.transaction?.message?.accountKeys) continue;
    stored += await insertEvents(db, parseRingTransaction(tx));
  }
  if (stored) revalidateTag("tracker", "max");
  return Response.json({ received: txs.length, stored });
}
