// HKDF-SHA256 derivations from wallet signatures, under Crypsis-only domains (WebCrypto, works in workers).
const SALT = new TextEncoder().encode("crypsis.fun");
async function hkdf(ikm: Uint8Array, info: string, bits = 256): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(info) }, key, bits));
}

/** Mode A: key material for the encrypted IndexedDB snapshot; walletSnapshotKey() turns it into AES-256-GCM. */
export const snapshotKeyMaterial = (derivationSeed: Uint8Array) => hkdf(derivationSeed, "crypsis/snapshot-key/v1");

/** Mode B: the vault's Ed25519 seed (one seed for the Solana signer and the ShieldedKeypair). Never stored. */
export const vaultSeedFromSignature = (vaultSignature: Uint8Array) => hkdf(vaultSignature, "crypsis/vault-key/v1");
