// DB writes for the indexer. Idempotent (re-runs and webhook retries are safe).
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { coins, indexerState, ringEvents, snapshots, type Db, type NewCoin } from "@crypsis/db";
import type { ParsedRingEvent } from "./parse";

export async function insertEvents(db: Db, events: ParsedRingEvent[]): Promise<number> {
  if (!events.length) return 0;
  const res = await db
    .insert(ringEvents)
    .values(events.map((e) => ({ signature: e.signature, ixIndex: e.ixIndex, slot: e.slot, blockTime: e.blockTime, mint: e.mint, kind: e.kind, amount: e.amount, fromAddr: e.fromAddr, toAddr: e.toAddr })))
    .onConflictDoNothing()
    .returning({ s: ringEvents.signature });
  // ring_ready_at = earliest interface creation we have seen
  for (const e of events.filter((x) => x.kind === "interface_created" && x.blockTime)) {
    await db.update(coins).set({ ringReadyAt: e.blockTime }).where(and(eq(coins.mint, e.mint), or(isNull(coins.ringReadyAt), lt(sql`${e.blockTime!.toISOString()}::timestamptz`, coins.ringReadyAt))));
  }
  return res.length;
}

export async function upsertCoins(db: Db, rows: NewCoin[]) {
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(coins)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: coins.mint,
        set: {
          symbol: sql`coalesce(excluded.symbol, ${coins.symbol})`,
          name: sql`coalesce(excluded.name, ${coins.name})`,
          imageUri: sql`coalesce(excluded.image_uri, ${coins.imageUri})`,
          isPump: sql`excluded.is_pump`,
          graduated: sql`excluded.graduated`,
          creator: sql`coalesce(excluded.creator, ${coins.creator})`,
          launchedViaCrypsis: sql`${coins.launchedViaCrypsis} or excluded.launched_via_crypsis`,
          updatedAt: sql`now()`,
        },
      });
  }
}

export async function insertSnapshots(db: Db, rows: { mint: string; ts: Date; vaultAmount: string; totalSupply: string; circulating: string | null; shareBps: number }[]) {
  for (let i = 0; i < rows.length; i += 500) await db.insert(snapshots).values(rows.slice(i, i + 500)).onConflictDoNothing();
}

export async function getState(db: Db, key: string): Promise<string | null> {
  const r = await db.select({ v: indexerState.value }).from(indexerState).where(eq(indexerState.key, key)).limit(1);
  return r[0]?.v ?? null;
}
export async function setState(db: Db, key: string, value: string) {
  await db.insert(indexerState).values({ key, value }).onConflictDoUpdate({ target: indexerState.key, set: { value, updatedAt: sql`now()` } });
}
