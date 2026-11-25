import { rpcCall } from "@/lib/server/rpc";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";

// GET /api/slot — current mainnet slot for the hero micro-copy. CDN cache 2 s.
export async function GET(req: Request) {
  // the CDN caches /api/slot for 2 s; this stops cache-busting query strings from burning the server RPC key
  if (!rateLimit(`slot:${clientKey(req)}`, 90, 60_000)) return Response.json({ slot: null }, { status: 429 });
  try {
    const slot = await rpcCall<number>("getSlot", [{ commitment: "confirmed" }], "mainnet", 4000);
    return Response.json({ slot }, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=4" } });
  } catch {
    return Response.json({ slot: null }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
