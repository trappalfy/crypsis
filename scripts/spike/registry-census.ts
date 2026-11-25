// Read-only: census of Ring-ready mints on mainnet (which are pump.fun, which token program).
import { createSolanaRpc, address } from "@solana/kit";
import { SHIELDED_POOL_PROGRAM_ID } from "@heliuslabs/spr";
import { decodeSplAssetRegistry } from "@heliuslabs/spr/interface";
import { getSplAssetVaultAddress } from "@heliuslabs/spr/addresses";
const RPC = process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const rpc = createSolanaRpc(RPC);
const accs = (await rpc.getProgramAccounts(SHIELDED_POOL_PROGRAM_ID, { encoding: "base64", filters: [{ dataSize: 48n }, { memcmp: { offset: 0n, encoding: "base58", bytes: "6" as never } }] }).send()) as unknown as { account: { data: [string, string] } }[];
const mints = accs.map((a) => decodeSplAssetRegistry(Buffer.from(a.account.data[0], "base64")).mint as string);
const pump = mints.filter((m) => m.endsWith("pump"));
const progs: Record<string, number> = {};
const legacyPump: string[] = [];
for (let i = 0; i < pump.length; i += 100) {
  const chunk = pump.slice(i, i + 100);
  const r = await rpc.getMultipleAccounts(chunk.map((m) => address(m)), { encoding: "base64" }).send();
  r.value.forEach((v, j) => { const o = (v?.owner as string) ?? "missing"; progs[o] = (progs[o] ?? 0) + 1; if (o.startsWith("Tokenkeg")) legacyPump.push(chunk[j]); });
}
let withBalance = 0;
for (const m of legacyPump.slice(0, 5)) {
  const v = await getSplAssetVaultAddress(address(m));
  const b = await rpc.getTokenAccountBalance(v).send();
  if (BigInt(b.value.amount) > 0n) withBalance++;
  console.log("legacy pump mint", m, "vault balance", b.value.amount);
}
console.log({ totalRingReady: mints.length, pumpSuffix: pump.length, byProgram: progs, legacyPumpCount: legacyPump.length, legacySampleWithBalance: withBalance });
