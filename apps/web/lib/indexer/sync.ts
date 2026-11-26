// Coin registry sync + supply snapshots (brief §2.4, §3). Read-only against Solana.
import { sql } from "drizzle-orm";
import { coins, type Db, type NewCoin } from "@crypsis/db";
import { getMultipleAccounts, type RpcFn } from "./rpc";
import * as A from "./accounts";
import { getState, insertSnapshots, setState, upsertCoins } from "./store";
import { metadataImage } from "@/lib/server/remote-media";

/** share in basis points, floored; 0 when supply is 0 */
export function shareBps(vault: bigint, supply: bigint): number {
  if (supply <= 0n) return 0;
  return Number((vault * 10_000n) / supply);
}

const IMAGE_CURSOR = "coins:image-cursor";

/**
 * Pull every Ring-ready mint from chain and upsert the pump.fun ones (and any mint already flagged as
 * launched via Crypsis). Metadata (name/symbol/image) is resolved for new coins first; then, within the same
 * cap, coins that still have no image are retried in mint order from a saved cursor, so every coin gets another
 * try over a few runs and a dead image can't starve the others.
 */
export async function syncCoins(db: Db, rpc: RpcFn, opts: { resolveImages?: boolean; maxResolve?: number; budgetMs?: number } = {}): Promise<{ registries: number; pump: number; added: number; resolved: number }> {
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  const regs = await A.listRingMints(rpc);
  const mints = regs.map((r) => r.mint);
  const known = new Map((await db.select({ mint: coins.mint, name: coins.name, imageUri: coins.imageUri }).from(coins)).map((c) => [c.mint, c]));
  const mintAccs = await getMultipleAccounts(rpc, mints);
  const curves = await getMultipleAccounts(rpc, mints.map(A.bondingCurveAddress));
  // 1) cheap rows for every coin first (one batched write) — new coins appear even if metadata is slow
  const rows: (NewCoin & { _data: Buffer })[] = [];
  let added = 0;
  for (let i = 0; i < mints.length; i++) {
    const mint = mints[i], m = mintAccs[i], c = curves[i];
    if (!m) continue;
    const pump = A.isPumpCurve(c?.owner);
    if (!pump && !known.has(mint)) continue; // tracker = pump.fun coins
    const curve = pump && c ? A.decodeBondingCurve(c.data) : null;
    if (!known.has(mint)) added++;
    rows.push({
      mint, tokenProgram: m.owner, decimals: A.decodeMint(m.data).decimals, vault: A.vaultAddress(mint), isPump: pump,
      graduated: curve?.complete ?? false,
      creator: curve && curve.creator !== "11111111111111111111111111111111" ? curve.creator : null,
      _data: m.data,
    });
  }
  const strip = (r: NewCoin & { _data: Buffer }): NewCoin => { const out = { ...r } as Partial<typeof r>; delete out._data; return out as NewCoin; };
  await upsertCoins(db, rows.map(strip));
  // ring_ready_at = earliest indexed interface creation (also covers events that arrived before the coin row)
  await db.execute(sql`update coins c set ring_ready_at = e.t from (select mint, min(block_time) as t from ring_events where kind = 'interface_created' group by mint) e where c.mint = e.mint and (c.ring_ready_at is null or e.t < c.ring_ready_at)`);
  // 2) metadata: new coins (no name) first, then known coins still missing an image (rotating cursor)
  const images = opts.resolveImages !== false;
  const fresh = rows.filter((r) => !known.get(r.mint)?.name);
  let retry: typeof rows = [];
  let cursor = "";
  if (images) {
    cursor = (await getState(db, IMAGE_CURSOR)) ?? "";
    const missing = rows.filter((r) => known.get(r.mint)?.name && !known.get(r.mint)?.imageUri).sort((a, b) => (a.mint < b.mint ? -1 : 1));
    retry = [...missing.filter((r) => r.mint > cursor), ...missing.filter((r) => r.mint <= cursor)];
  }
  const max = opts.maxResolve ?? 20;
  let resolved = 0, attempts = 0, lastRetried: string | null = null;
  for (const [r, isRetry] of [...fresh.map((x) => [x, false] as const), ...retry.map((x) => [x, true] as const)]) {
    if (attempts >= max || Date.now() > deadline) break;
    attempts++;
    if (isRetry) lastRetried = r.mint;
    let meta = A.isToken2022(r.tokenProgram) ? A.decodeToken2022Metadata(r._data) : null;
    if (!meta) {
      const [mpl] = await getMultipleAccounts(rpc, [A.metaplexMetadataAddress(r.mint)]);
      meta = mpl ? A.decodeMetaplexMetadata(mpl.data) : null;
    }
    if (!meta) continue;
    const imageUri = images ? await metadataImage(meta.uri, {}) : null;
    if (isRetry && !imageUri) continue; // nothing new to write
    await upsertCoins(db, [{ ...strip(r), name: meta.name || null, symbol: meta.symbol || null, imageUri }]);
    resolved++;
  }
  if (lastRetried) await setState(db, IMAGE_CURSOR, lastRetried);
  return { registries: regs.length, pump: rows.filter((r) => r.isPump).length, added, resolved };
}

/** One snapshot per coin, timestamp floored to 5 minutes (idempotent within the slot). */
export async function takeSnapshots(db: Db, rpc: RpcFn, now = new Date()): Promise<number> {
  const list = await db.select({ mint: coins.mint, vault: coins.vault, tokenProgram: coins.tokenProgram, isPump: coins.isPump, graduated: coins.graduated }).from(coins);
  if (!list.length) return 0;
  const ts = new Date(Math.floor(now.getTime() / 300_000) * 300_000);
  const vaults = await getMultipleAccounts(rpc, list.map((c) => c.vault));
  const mints = await getMultipleAccounts(rpc, list.map((c) => c.mint));
  const curveAtas = await getMultipleAccounts(rpc, list.map((c) => A.ataOf(A.bondingCurveAddress(c.mint), c.mint, c.tokenProgram)));
  const poolAtas = await getMultipleAccounts(rpc, list.map((c) => A.ataOf(A.pumpPoolAddress(c.mint), c.mint, c.tokenProgram)));
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const m = mints[i];
    if (!m) continue;
    const supply = A.decodeMint(m.data).supply;
    const vault = vaults[i] ? A.decodeTokenAmount(vaults[i]!.data) : 0n;
    const locked = (curveAtas[i] ? A.decodeTokenAmount(curveAtas[i]!.data) : 0n) + (poolAtas[i] ? A.decodeTokenAmount(poolAtas[i]!.data) : 0n);
    const circulating = list[i].isPump && supply > locked ? supply - locked : null;
    rows.push({ mint: list[i].mint, ts, vaultAmount: vault.toString(), totalSupply: supply.toString(), circulating: circulating?.toString() ?? null, shareBps: shareBps(vault, supply) });
  }
  await insertSnapshots(db, rows);
  return rows.length;
}
