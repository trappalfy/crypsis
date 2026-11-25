// Solana off-chain message v0 envelopes, built without importing the Ring SDK (keeps it out of UI bundles).
// Byte-identical to @heliuslabs/spr/keypair ed25519DerivationMessage — pinned by lib/ring/derivation.test.ts.
const MAGIC = Uint8Array.from([0xff, 0x73, 0x6f, 0x6c, 0x61, 0x6e, 0x61, 0x20, 0x6f, 0x66, 0x66, 0x63, 0x68, 0x61, 0x69, 0x6e]); // "\xffsolana offchain"
export const RING_DERIVATION_PAYLOAD = "TSPP/derive/v1";
/**
 * Mode B (Crypsis vault) message, signed as plain UTF-8 text. Not an off-chain envelope: Phantom refuses to sign
 * `\xffsolana offchain` bytes ("You cannot sign solana transactions using sign message", 2026-11-25), and the
 * vault seed only needs a deterministic Ed25519 signature over fixed bytes. Changing these bytes changes every
 * user's vault key, so they are frozen once real vaults exist (owner-decisions #18).
 */
export const VAULT_DERIVATION_PAYLOAD = "crypsis.fun/vault/v1 - Only sign this on https://crypsis.fun. This signature unlocks your Crypsis vault.";

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

/** magic || version=0 || application_domain(32) || format=0 (restricted ASCII) || signer_count=1 || signer(32) || len u16 LE || payload */
export function offchainMessageV0(applicationDomain: Uint8Array, signer: Uint8Array, payloadText: string): Uint8Array {
  if (applicationDomain.length !== 32 || signer.length !== 32) throw new Error("bad envelope input");
  const payload = new TextEncoder().encode(payloadText);
  const m = new Uint8Array(85 + payload.length);
  m.set(MAGIC, 0);
  m[16] = 0;
  m.set(applicationDomain, 17);
  m[49] = 0;
  m[50] = 1;
  m.set(signer, 51);
  m[83] = payload.length & 0xff;
  m[84] = payload.length >> 8;
  m.set(payload, 85);
  return m;
}

/** Mode A: exact bytes the Ring SDK verifies in LocalKeys.fromDerivationSeed. */
export async function derivationMessage(signerPublicKey: Uint8Array): Promise<Uint8Array> {
  return offchainMessageV0(await sha256(new TextEncoder().encode(RING_DERIVATION_PAYLOAD)), signerPublicKey, RING_DERIVATION_PAYLOAD);
}

/** Mode B: Crypsis vault key message (exact bytes the wallet signs). */
export function vaultMessage(): Uint8Array {
  return new TextEncoder().encode(VAULT_DERIVATION_PAYLOAD);
}
