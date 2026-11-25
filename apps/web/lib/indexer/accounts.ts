// Account decoders + address derivations for the tracker (public data only).
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { bondingCurvePda, canonicalPumpPoolPda } from "@pump-fun/pump-sdk";
import { decodeSplAssetRegistry } from "@heliuslabs/spr/interface";
import { METAPLEX_METADATA_PROGRAM, PUMP_PROGRAM, REGISTRY_DATA_SIZE, REGISTRY_DISCRIMINATOR, RING_PROGRAM, TOKEN_2022_PROGRAM } from "./constants";
import type { RpcFn } from "./rpc";

const RING = new PublicKey(RING_PROGRAM);
const METAPLEX = new PublicKey(METAPLEX_METADATA_PROGRAM);

/** Every Ring-ready mint (asset registry accounts), same filters as the SDK's internal fetchSplAssetRegistrations. */
export async function listRingMints(rpc: RpcFn): Promise<{ mint: string; assetId: bigint }[]> {
  const accs = await rpc<{ pubkey: string; account: { data: [string, string] } }[]>("getProgramAccounts", [
    RING_PROGRAM,
    { encoding: "base64", commitment: "confirmed", filters: [{ dataSize: REGISTRY_DATA_SIZE }, { memcmp: { offset: 0, bytes: "6" /* base58(5) */ } }] },
  ]);
  return accs.map((a) => {
    const r = decodeSplAssetRegistry(Buffer.from(a.account.data[0], "base64"));
    return { mint: r.mint as string, assetId: r.assetId };
  });
}
// guard: base58 "6" is byte 5
if (REGISTRY_DISCRIMINATOR !== 5) throw new Error("registry discriminator changed");

export function vaultAddress(mint: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("spl_asset_vault"), new PublicKey(mint).toBuffer()], RING)[0].toBase58();
}
export function bondingCurveAddress(mint: string): string {
  return bondingCurvePda(new PublicKey(mint)).toBase58();
}
export function ataOf(owner: string, mint: string, tokenProgram: string): string {
  return getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), true, new PublicKey(tokenProgram)).toBase58();
}
export function pumpPoolAddress(mint: string): string {
  return canonicalPumpPoolPda(new PublicKey(mint)).toBase58();
}
export function metaplexMetadataAddress(mint: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("metadata"), METAPLEX.toBuffer(), new PublicKey(mint).toBuffer()], METAPLEX)[0].toBase58();
}

/** SPL / Token-2022 mint base layout: supply u64 @36, decimals u8 @44. */
export function decodeMint(data: Buffer): { supply: bigint; decimals: number } {
  return { supply: data.readBigUInt64LE(36), decimals: data[44] };
}
/** Token account base layout: amount u64 @64. */
export function decodeTokenAmount(data: Buffer): bigint {
  return data.readBigUInt64LE(64);
}

export interface TokenMeta { name: string; symbol: string; uri: string }
const clean = (s: string) => s.replace(/\0+$/g, "").trim();

/** Token-2022 TokenMetadata extension (type 19) stored in the mint (pump.fun create_v2 coins). */
export function decodeToken2022Metadata(data: Buffer): TokenMeta | null {
  if (data.length <= 166 || data[165] !== 1) return null; // account type 1 = mint
  let o = 166;
  while (o + 4 <= data.length) {
    const type = data.readUInt16LE(o), len = data.readUInt16LE(o + 2);
    const v = o + 4;
    if (type === 19) {
      let p = v + 64; // update_authority + mint
      const str = () => { const n = data.readUInt32LE(p); const s = data.subarray(p + 4, p + 4 + n).toString("utf8"); p += 4 + n; return s; };
      return { name: clean(str()), symbol: clean(str()), uri: clean(str()) };
    }
    if (type === 0) break;
    o = v + len;
  }
  return null;
}

/** Metaplex Token Metadata account (legacy SPL pump.fun coins). */
export function decodeMetaplexMetadata(data: Buffer): TokenMeta | null {
  if (data.length < 70 || data[0] !== 4) return null; // Key::MetadataV1
  let p = 65;
  const str = () => { const n = data.readUInt32LE(p); const s = data.subarray(p + 4, p + 4 + n).toString("utf8"); p += 4 + n; return s; };
  try { return { name: clean(str()), symbol: clean(str()), uri: clean(str()) }; } catch { return null; }
}

/** pump bonding curve: 8-byte discriminator, 5×u64, complete bool @48, creator @49. */
export function decodeBondingCurve(data: Buffer): { complete: boolean; creator: string } | null {
  if (data.length < 81) return null;
  return { complete: data[48] === 1, creator: new PublicKey(data.subarray(49, 81)).toBase58() };
}

export const isPumpCurve = (owner: string | undefined) => owner === PUMP_PROGRAM;
export const isToken2022 = (program: string) => program === TOKEN_2022_PROGRAM;

/** Prefer one public IPFS gateway for every image (CSP img-src stays short). */
export function normalizeImage(uri: string | null | undefined, gateway = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs/"): string | null {
  if (!uri) return null;
  const m = uri.match(/\/ipfs\/([A-Za-z0-9]+)(\/.*)?$/) ?? uri.match(/^ipfs:\/\/([A-Za-z0-9]+)(\/.*)?$/);
  if (m) return `${gateway}${m[1]}${m[2] ?? ""}`;
  // CSP img-src allows only the IPFS gateway (brief §10): other hosts get the placeholder icon
  return null;
}
