import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { CoinSummary } from "./types";

// Cached reads for server components (30–60 s, brief §3). Without DATABASE_URL: empty live data, never mocks.
const hasDb = () => !!process.env.DATABASE_URL;

export async function getTopCoins(limit = 5): Promise<CoinSummary[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag("tracker");
  if (!hasDb()) return [];
  const { listCoins } = await import("./queries");
  try { return (await listCoins({ sort: "share", filter: "all", limit })).items; } catch { return []; }
}

export async function getTrackerPage(sort = "share", filter = "all") {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag("tracker");
  if (!hasDb()) return { items: [] as CoinSummary[], nextCursor: null, kpis: { coins: 0, deposits24h: 0, withdrawals24h: 0 } };
  const { listCoins, trackerKpis } = await import("./queries");
  const [list, kpis] = await Promise.all([listCoins({ sort, filter, limit: 50 }), trackerKpis()]);
  return { ...list, kpis };
}

export async function getCoinDetail(mint: string) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag("tracker", `coin:${mint}`);
  if (!hasDb()) return null;
  const { getCoin } = await import("./queries");
  return getCoin(mint);
}
