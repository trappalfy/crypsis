import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHIELDED_POOL_CPI_AUTHORITY, SHIELDED_POOL_PROGRAM_ID } from "@heliuslabs/spr/interface";
import { RING_CPI_AUTHORITY, RING_PROGRAM } from "./constants";
import { parseRingTransaction } from "./parse";
import type { RawTransaction } from "./rpc";

const dir = new URL("../../tests/fixtures/ring-txs/", import.meta.url);
const fx = (prefix: string) => {
  const f = readdirSync(dir).find((n) => n.startsWith(prefix))!;
  return JSON.parse(readFileSync(new URL(f, dir), "utf8")) as RawTransaction;
};
const MINT = "AToRiJBd4FfhGpi7WLLTA1Qc6zwu5DfSzYBKiR1fpump";

describe("Ring event parser on real mainnet transactions", () => {
  it("constants match the SDK", () => {
    expect(RING_CPI_AUTHORITY).toBe(SHIELDED_POOL_CPI_AUTHORITY);
    expect(RING_PROGRAM).toBe(SHIELDED_POOL_PROGRAM_ID);
  });

  it("first deposit = interface_created + deposit", () => {
    const ev = parseRingTransaction(fx("pmjTPjwGq6Ma6mQs"));
    expect(ev.map((e) => e.kind)).toEqual(["interface_created", "deposit"]);
    expect(ev.map((e) => e.ixIndex)).toEqual([0, 1]);
    expect(ev[1]).toMatchObject({ mint: MINT, amount: "57500813895", decimals: 6, vault: "2h38rUR31QTi7kX9wAhP4jx1Hbqkt6SmDncUiaD6eroD" });
    expect(ev[1].fromAddr).toMatch(/^ErJ4T7/);
  });

  it("later deposit", () => {
    const ev = parseRingTransaction(fx("rTefY1K6f1FPzvh8"));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "deposit", amount: (115692041215n - 57500813895n).toString() });
  });

  it("withdrawals record the public recipient", () => {
    const a = parseRingTransaction(fx("iqnUHqxGhEqzfe6f"));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "withdraw", amount: (115692041215n - 75691917759n).toString() });
    expect(a[0].toAddr).toMatch(/^ErJ4T7/);
    const b = parseRingTransaction(fx("XWvR6qyTSzgArrdu"));
    expect(b[0]).toMatchObject({ kind: "withdraw", amount: "75691917759" });
  });

  it("transactions that don't move the vault produce no events", () => {
    expect(parseRingTransaction(fx("2vmEst5U1dpud59F"))).toEqual([]);
    expect(parseRingTransaction(fx("5o3Q8DSzpMCwCd65"))).toEqual([]);
  });

  it("failed transactions produce no events", () => {
    const t = fx("rTefY1K6f1FPzvh8");
    expect(parseRingTransaction({ ...t, meta: { ...t.meta!, err: { InstructionError: [0, "Custom"] } } })).toEqual([]);
  });
});

describe("parser rejects look-alike vaults", () => {
  it("a token account owned by the CPI authority that isn't the mint's vault PDA is ignored", () => {
    const t = fx("rTefY1K6f1FPzvh8");
    const keys = [...t.transaction.message.accountKeys];
    const vaultIdx = keys.indexOf("2h38rUR31QTi7kX9wAhP4jx1Hbqkt6SmDncUiaD6eroD");
    keys[vaultIdx] = "11111111111111111111111111111111"; // same balances, different account
    expect(parseRingTransaction({ ...t, transaction: { ...t.transaction, message: { ...t.transaction.message, accountKeys: keys } } })).toEqual([]);
  });
  it("Ring merely listed but not invoked -> no events", () => {
    const t = fx("rTefY1K6f1FPzvh8");
    const logs = (t.meta!.logMessages ?? []).filter((l) => !l.includes("ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW invoke"));
    expect(parseRingTransaction({ ...t, meta: { ...t.meta!, logMessages: logs } })).toEqual([]);
  });
});
