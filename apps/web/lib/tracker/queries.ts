// Tracker read queries (public data only). Used by API routes and server components.
import { sql } from "drizzle-orm";
import { getDb } from "@crypsis/db";
import type { CoinSummary } from "./types";

export type SortKey = "share" | "amount" | "change24h" | "newest";
export type FilterKey = "all" | "crypsis" | "graduated";
export const SORTS: SortKey[] = ["share", "amount", "change24h", "newest"];
export const FILTERS: FilterKey[] = ["all", "crypsis", "graduated"];

const ORDER: Record<SortKey, string> = {
  share: "l.share_bps desc nulls last, c.mint",
  amount: "(l.vault_amount / power(10, c.decimals)) desc nulls last, c.mint",
  change24h: "(l.share_bps - d.share_bps) desc nulls last, l.share_bps desc nulls last, c.mint",
  newest: "c.ring_ready_at desc nulls last, c.mint",
};
const WHERE: Record<FilterKey, string> = {
  all: "c.is_pump",
  crypsis: "c.is_pump and c.launched_via_crypsis",
  graduated: "c.is_pump and c.graduated",
};

type Row = {
  mint: string; symbol: string | null; name: string | null; image_uri: string | null; token_program: string; decimals: number;
  is_pump: boolean; launched_via_crypsis: boolean; graduated: boolean; ring_ready_at: string | Date | null;
  vault_amount: string | null; total_supply: string | null; share_bps: number | null; change_bps: number | null; deposits: number; withdrawals: number;
};

const iso = (v: string | Date | null) => (v == null ? null : new Date(v).toISOString());

function toSummary(r: Row, spark: number[] = []): CoinSummary {
  return {
    mint: r.mint, symbol: r.symbol, name: r.name, imageUri: r.image_uri, tokenProgram: r.token_program, decimals: r.decimals,
    isPump: r.is_pump, launchedViaCrypsis: r.launched_via_crypsis, graduated: r.graduated, ringReadyAt: iso(r.ring_ready_at),
    vaultAmount: r.vault_amount ?? "0", totalSupply: r.total_supply ?? "0", shareBps: r.share_bps ?? 0,
    change24hBps: r.change_bps, deposits24h: Number(r.deposits), withdrawals24h: Number(r.withdrawals), spark,
  };
}

const BASE = (where: string, order: string) => `
  with latest as (
    select distinct on (mint) mint, vault_amount, total_supply, share_bps from snapshots order by mint, ts desc
  ), d as (
    select distinct on (mint) mint, share_bps from snapshots where ts <= now() - interval '24 hours' order by mint, ts desc
  ), ev as (
    select mint, count(*) filter (where kind = 'deposit') as deposits, count(*) filter (where kind = 'withdraw') as withdrawals
    from ring_events where block_time > now() - interval '24 hours' group by mint
  )
  select c.mint, c.symbol, c.name, c.image_uri, c.token_program, c.decimals, c.is_pump, c.launched_via_crypsis, c.graduated, c.ring_ready_at,
         l.vault_amount::text, l.total_supply::text, l.share_bps, (l.share_bps - d.share_bps) as change_bps,
         coalesce(ev.deposits, 0)::int as deposits, coalesce(ev.withdrawals, 0)::int as withdrawals
  from coins c
  left join latest l on l.mint = c.mint
  left join d on d.mint = c.mint
  left join ev on ev.mint = c.mint
  where ${where}
  order by ${order}`;

async function sparks(mints: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!mints.length) return out;
  const rows = (await getDb().execute(sql`
    select mint, date_trunc('hour', ts) as h, max(share_bps)::int as s
    from snapshots where mint in ${mints} and ts > now() - interval '24 hours'
    group by 1, 2 order by 1, 2`)) as unknown as { mint: string; s: number }[];
  for (const r of rows) out.set(r.mint, [...(out.get(r.mint) ?? []), r.s]);
  return out;
}

export async function listCoins(q: { sort?: string; filter?: string; limit?: number; cursor?: string }): Promise<{ items: CoinSummary[]; nextCursor: string | null }> {
  const sort = (SORTS as string[]).includes(q.sort ?? "") ? (q.sort as SortKey) : "share";
  const filter = (FILTERS as string[]).includes(q.filter ?? "") ? (q.filter as FilterKey) : "all";
  const limit = Math.min(100, Math.max(1, q.limit ?? 50));
  const offset = Math.max(0, Number.parseInt(q.cursor ?? "0", 10) || 0);
  const rows = (await getDb().execute(sql.raw(`${BASE(WHERE[filter], ORDER[sort])} limit ${limit + 1} offset ${offset}`))) as unknown as Row[];
  const page = rows.slice(0, limit);
  const sp = await sparks(page.map((r) => r.mint));
  return { items: page.map((r) => toSummary(r, sp.get(r.mint))), nextCursor: rows.length > limit ? String(offset + limit) : null };
}

export async function trackerKpis(): Promise<{ coins: number; deposits24h: number; withdrawals24h: number }> {
  const [r] = (await getDb().execute(sql`
    select (select count(*) from coins where is_pump)::int as coins,
           (select count(*) from ring_events e join coins c on c.mint = e.mint where c.is_pump and e.kind = 'deposit' and e.block_time > now() - interval '24 hours')::int as deposits,
           (select count(*) from ring_events e join coins c on c.mint = e.mint where c.is_pump and e.kind = 'withdraw' and e.block_time > now() - interval '24 hours')::int as withdrawals`)) as unknown as { coins: number; deposits: number; withdrawals: number }[];
  return { coins: r?.coins ?? 0, deposits24h: r?.deposits ?? 0, withdrawals24h: r?.withdrawals ?? 0 };
}

export type Range = "24h" | "7d" | "30d";
const RANGE: Record<Range, { interval: string; bucket: string }> = {
  "24h": { interval: "24 hours", bucket: "hour" },
  "7d": { interval: "7 days", bucket: "hour" },
  "30d": { interval: "30 days", bucket: "day" },
};

export interface CoinDetail {
  coin: CoinSummary & { vault: string; creator: string | null; circulating: string | null };
  history: Record<Range, { t: string; shareBps: number }[]>;
  events: { signature: string; kind: string; amount: string | null; fromAddr: string | null; toAddr: string | null; blockTime: string | null }[];
  /** Σ public deposits − Σ public withdrawals indexed so far (cross-check against the vault balance) */
  eventsNet: string;
}

export async function getCoin(mint: string): Promise<CoinDetail | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return null;
  const db = getDb();
  const safe = mint.replace(/'/g, "");
  const rows = (await db.execute(sql.raw(`${BASE(`c.mint = '${safe}'`, "c.mint")} limit 1`))) as unknown as Row[];
  if (!rows.length) return null;
  const extra = (await db.execute(sql`
    select c.vault, c.creator, (select circulating::text from snapshots s where s.mint = c.mint order by ts desc limit 1) as circulating,
           coalesce((select sum(case when kind = 'deposit' then amount when kind = 'withdraw' then -amount else 0 end) from ring_events e where e.mint = c.mint), 0)::text as net
    from coins c where c.mint = ${mint}`)) as unknown as { vault: string; creator: string | null; circulating: string | null; net: string }[];
  const history = {} as CoinDetail["history"];
  for (const r of Object.keys(RANGE) as Range[]) {
    const { interval, bucket } = RANGE[r];
    const h = (await db.execute(sql.raw(`
      select date_trunc('${bucket}', ts) as t, max(share_bps)::int as s from snapshots
      where mint = '${safe}' and ts > now() - interval '${interval}' group by 1 order by 1`))) as unknown as { t: Date | string; s: number }[];
    history[r] = h.map((x) => ({ t: new Date(x.t).toISOString(), shareBps: x.s }));
  }
  const ev = (await db.execute(sql`
    select signature, kind::text, amount::text, from_addr, to_addr, block_time from ring_events
    where mint = ${mint} and kind <> 'interface_created' order by block_time desc nulls last, signature limit 50`)) as unknown as { signature: string; kind: string; amount: string | null; from_addr: string | null; to_addr: string | null; block_time: Date | string | null }[];
  return {
    coin: { ...toSummary(rows[0], history["24h"].map((x) => x.shareBps)), vault: extra[0].vault, creator: extra[0].creator, circulating: extra[0].circulating },
    history,
    events: ev.map((e) => ({ signature: e.signature, kind: e.kind, amount: e.amount, fromAddr: e.from_addr, toAddr: e.to_addr, blockTime: iso(e.block_time) })),
    eventsNet: extra[0].net,
  };
}
