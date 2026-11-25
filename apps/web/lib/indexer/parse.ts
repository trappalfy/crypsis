// Ring event parser (brief §3 indexer). Protocol-agnostic: derives public events from the change of
// Ring vault token balances, so it survives instruction-format changes of the alpha SDK.
//   vault balance up   -> deposit   (from = owner of the token account that paid)
//   vault balance down -> withdraw  (to   = owner of the token account that received; from = fee payer)
//   vault appears      -> interface_created (the mint became Ring-ready)
// Private transfers move no vault balance and stay invisible here (they don't reveal the coin).
import { RING_CPI_AUTHORITY, RING_PROGRAM } from "./constants";
import { vaultAddress } from "./accounts";
import type { RawTransaction, TokenBalance } from "./rpc";

export type RingEventKind = "deposit" | "withdraw" | "interface_created";
export interface ParsedRingEvent {
  signature: string;
  ixIndex: number;
  slot: number;
  blockTime: Date | null;
  mint: string;
  kind: RingEventKind;
  /** raw token units as decimal string; null for interface_created */
  amount: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  vault: string;
  tokenProgram: string | null;
  decimals: number;
}

const amountOf = (b?: TokenBalance) => (b ? BigInt(b.uiTokenAmount.amount) : 0n);

export function accountKeysOf(tx: RawTransaction): string[] {
  const l = tx.meta?.loadedAddresses;
  return [...tx.transaction.message.accountKeys, ...(l?.writable ?? []), ...(l?.readonly ?? [])];
}

export function touchesRing(tx: RawTransaction): boolean {
  return accountKeysOf(tx).includes(RING_PROGRAM);
}

/** The Ring program actually executed (not merely listed as an account). */
export function ringInvoked(tx: RawTransaction): boolean {
  return (tx.meta?.logMessages ?? []).some((l) => l.startsWith(`Program ${RING_PROGRAM} invoke`));
}

export function parseRingTransaction(tx: RawTransaction): ParsedRingEvent[] {
  if (!tx.meta || tx.meta.err || !touchesRing(tx) || !ringInvoked(tx)) return [];
  const keys = accountKeysOf(tx);
  const signature = tx.transaction.signatures[0];
  const feePayer = keys[0];
  const pre = tx.meta.preTokenBalances ?? [];
  const post = tx.meta.postTokenBalances ?? [];
  const byIdx = (list: TokenBalance[]) => new Map(list.map((b) => [b.accountIndex, b]));
  const preMap = byIdx(pre), postMap = byIdx(post);
  // a Ring vault = the per-mint vault PDA (owned by the CPI authority); any other token account the
  // authority happens to own (e.g. an ATA someone created for it) is not a vault and is ignored
  const vaultIdx = new Set([...pre, ...post].filter((b) => b.owner === RING_CPI_AUTHORITY && keys[b.accountIndex] === vaultAddress(b.mint)).map((b) => b.accountIndex));

  const events: ParsedRingEvent[] = [];
  let ord = 0;
  for (const idx of [...vaultIdx].sort((a, b) => a - b)) {
    const before = preMap.get(idx), after = postMap.get(idx);
    const ref = (after ?? before)!;
    const mint = ref.mint;
    const base = {
      signature, slot: tx.slot, blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null, mint,
      vault: keys[idx], tokenProgram: ref.programId ?? null, decimals: ref.uiTokenAmount.decimals,
    };
    if (!before && after) events.push({ ...base, ixIndex: ord++, kind: "interface_created", amount: null, fromAddr: feePayer, toAddr: null });
    const delta = amountOf(after) - amountOf(before);
    if (delta === 0n) continue;
    // counterparties: other token accounts of the same mint whose balance moved the opposite way
    const others = new Set([...pre, ...post].filter((b) => b.mint === mint && !vaultIdx.has(b.accountIndex)).map((b) => b.accountIndex));
    let best: { owner: string | null; d: bigint } = { owner: null, d: 0n };
    for (const o of others) {
      const d = amountOf(postMap.get(o)) - amountOf(preMap.get(o));
      const owner = (postMap.get(o) ?? preMap.get(o))?.owner ?? null;
      if (delta > 0n ? d < best.d : d > best.d) best = { owner, d };
    }
    if (delta > 0n) events.push({ ...base, ixIndex: ord++, kind: "deposit", amount: delta.toString(), fromAddr: best.owner ?? feePayer, toAddr: null });
    else events.push({ ...base, ixIndex: ord++, kind: "withdraw", amount: (-delta).toString(), fromAddr: feePayer, toAddr: best.owner });
  }
  return events;
}
