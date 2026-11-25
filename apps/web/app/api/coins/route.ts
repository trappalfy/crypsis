import { listCoins } from "@/lib/tracker/queries";

// GET /api/coins?sort=share|amount|change24h|newest&filter=all|crypsis|graduated&cursor=
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (!process.env.DATABASE_URL) return Response.json({ items: [], nextCursor: null }, { headers: { "cache-control": "public, s-maxage=30" } });
  try {
    const r = await listCoins({ sort: u.searchParams.get("sort") ?? undefined, filter: u.searchParams.get("filter") ?? undefined, cursor: u.searchParams.get("cursor") ?? undefined, limit: Number.parseInt(u.searchParams.get("limit") ?? "50", 10) || 50 });
    // share also in basis points (brief §2.4)
    return Response.json(r, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
