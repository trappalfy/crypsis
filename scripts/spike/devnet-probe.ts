// Devnet probe: programs deployed? protocol config? pump create_v2 present? (devnet is free to use)
import { createSolanaRpc, address } from "@solana/kit";
import { decodeProtocolConfig } from "@heliuslabs/spr/interface";
import { getProtocolConfigAddress } from "@heliuslabs/spr/addresses";
import { pumpIdl } from "@pump-fun/pump-sdk";
const RPC = process.env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const rpc = createSolanaRpc(RPC);
const info = async (a: string) => { const r = await rpc.getAccountInfo(address(a), { encoding: "base64" }).send(); return r.value ? { owner: r.value.owner, executable: r.value.executable, len: Buffer.from(r.value.data[0], "base64").length } : null; };
const out: Record<string, unknown> = {};
for (const [k, a] of Object.entries({ ring: "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW", registry: "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ", tree: "777pvSGe5LaBd9nCczvE2FXEauiwtfGJ5XRpjKyniGor", pump: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", pumpAmm: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", pumpFees: "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ" })) out[k] = await info(a);
const cfg = await rpc.getAccountInfo(await getProtocolConfigAddress(), { encoding: "base64" }).send();
if (cfg.value) { const c = decodeProtocolConfig(Buffer.from(cfg.value.data[0], "base64")) as any; out.protocolConfig = { permissionless: c.splInterfaceCreationIsPermissionless }; }
// pump program on devnet: is there a create_v2 in recent history?
const sigs = await rpc.getSignaturesForAddress(address("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"), { limit: 200 }).send();
const ixNames = new Map<string, string>();
for (const ix of (pumpIdl as any).instructions) ixNames.set(Buffer.from(ix.discriminator).toString("hex"), ix.name);
let createV2 = 0, create = 0, scanned = 0, t22 = 0; let lastCreateV2: string | null = null;
for (const s of sigs.slice(0, 60)) {
  const tx: any = await rpc.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, encoding: "json" }).send().catch(() => null);
  if (!tx) continue; scanned++;
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])];
  for (const ix of tx.transaction.message.instructions) {
    if (keys[ix.programIdIndex] !== "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P") continue;
    const bs58 = (await import("bs58")).default; const d = Buffer.from(bs58.decode(ix.data)).subarray(0, 8).toString("hex");
    const n = ixNames.get(d);
    if (n === "create_v2") { createV2++; lastCreateV2 ??= s.signature; }
    if (n === "create") create++;
  }
  if ((tx.meta?.postTokenBalances ?? []).some((b: any) => b.programId?.startsWith("Tokenz"))) t22++;
}
out.pumpDevnetHistory = { recentSigs: sigs.length, scanned, createV2, create, txWithToken2022: t22, lastCreateV2, newestBlockTime: sigs[0]?.blockTime ? new Date(Number(sigs[0].blockTime) * 1000).toISOString() : null };
console.log(JSON.stringify(out, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));
