import { getCoin } from "@/lib/tracker/queries";

// GET /api/coins/[mint] — card + snapshots (24h / 7d / 30d) + latest public events
export async function GET(_req: Request, ctx: RouteContext<"/api/coins/[mint]">) {
  const { mint } = await ctx.params;
  if (!process.env.DATABASE_URL) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const r = await getCoin(mint);
    if (!r) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(r, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
