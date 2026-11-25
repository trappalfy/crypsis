// Acceptance §13: vault balance must equal Σ public deposits − Σ public withdrawals (indexed events).
// Meaningful only after a full backfill since 2026-11-10 (events:tail = done).
// usage: DATABASE_URL=... tsx scripts/reconcile.ts
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@crypsis/db";
import { getState } from "../lib/indexer/store";

const db = getDb();
const tail = await getState(db, "events:tail");
const rows = (await db.execute(sql`
  with latest as (select distinct on (mint) mint, vault_amount, ts from snapshots order by mint, ts desc),
  net as (select mint, sum(case when kind = 'deposit' then amount when kind = 'withdraw' then -amount else 0 end) as net from ring_events group by mint)
  select c.mint, c.symbol, l.vault_amount::text as vault, coalesce(n.net, 0)::text as net, (l.vault_amount - coalesce(n.net, 0))::text as diff
  from coins c join latest l on l.mint = c.mint left join net n on n.mint = c.mint
  order by abs(l.vault_amount - coalesce(n.net, 0)) desc`)) as unknown as { mint: string; symbol: string | null; vault: string; net: string; diff: string }[];
const off = rows.filter((r) => r.diff !== "0");
console.log(`backfill: ${tail === "done" ? "complete" : "INCOMPLETE (tail=" + (tail ?? "none") + ") — differences are expected"}`);
console.log(`coins: ${rows.length}, matching: ${rows.length - off.length}, different: ${off.length}`);
for (const r of off.slice(0, 20)) console.log(`${r.mint} ${r.symbol ?? ""} vault=${r.vault} net=${r.net} diff=${r.diff}`);
console.log("Known explained differences: deposits/withdrawals between the last snapshot and now; transfers of tokens straight to the vault address (not Ring deposits).");
await closeDb();
