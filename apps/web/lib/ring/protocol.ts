// Messages between the UI thread and ring.worker.ts. Plain structured-clone data only.
// Secrets (derivation signatures) travel UI -> worker once, as transferred ArrayBuffers, and never
// travel back. Keys, UTXOs and decrypted state stay inside the worker.

export interface RingEndpoints {
  network: "mainnet" | "devnet";
  rpcUrl: string;
  indexerUrl?: string;
  proverUrl?: string;
  /** Helius key for the Ring indexer and prover (the browser key, domain-restricted). */
  apiKey?: string;
}

/** A = wallet signs Ring transactions (needs tx v1). B = Crypsis vault key derived from a signature. */
export type RingMode = "A" | "B";

export interface SelftestResult {
  poseidonMs: number; deriveMs: number; buildMs: number; txBytes: number; txVersion: number | "legacy";
  shieldedAddress: string; snapshotRoundtrip: boolean; indexedDb: boolean;
}
export interface ProbeTx { bytes: Uint8Array; version: number | "legacy" }

export interface TokenInfo {
  mint: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  tokenProgram: string;
  isPump: boolean;
  ringReady: boolean;
}
export interface PrivateBalance extends TokenInfo { amount: string }
export interface ActivityItem {
  id: string;
  kind: "deposit" | "privateTransfer" | "ringEntry" | "publicWithdrawal" | "split" | "merge";
  direction: "inbound" | "outbound" | "selfTransfer";
  mint: string;
  amount: string;
  symbol: string | null;
  decimals: number;
}
export interface WalletView {
  ringAddress: string;
  mode: RingMode;
  registered: boolean;
  balances: PrivateBalance[];
  activity: ActivityItem[];
  syncedSlot: string | null;
  /** Mode B only: the vault's public SOL balance (lamports) */
  vaultLamports?: string;
}
export interface PublicToken extends TokenInfo { tokenAccount: string; amount: string }

export interface BuiltTx {
  id: string;
  /** wire bytes; for mode A the wallet signs these, for mode B the worker signs internally */
  bytes: Uint8Array;
  version: number | "legacy";
  signer: "wallet" | "vault";
  feeLamports: string;
  rentLamports: string;
  /** what the review screen should show */
  /** what the review screen shows — always rendered from this, never from live form state */
  summary: { kind: "register" | "deposit" | "transfer" | "withdraw" | "fund"; mint?: string; amount?: string; recipient?: string; from?: string; decimals?: number; symbol?: string | null; lamports?: string; createsInterface?: boolean };
}
/** slot is null when the transaction was sent but confirmation timed out; syncFailed when the refresh after it failed */
export interface SubmitResult { signature: string; slot: string | null; view?: WalletView; syncFailed?: boolean }

export interface RingErrorPayload { code?: string; codes: string[]; message: string; custom?: number; signature?: string }

export type RingRequest =
  | { id: number; method: "selftest"; params: { endpoints: RingEndpoints } }
  | { id: number; method: "probeTransaction"; params: { endpoints: RingEndpoints; owner: string } }
  | { id: number; method: "health"; params: { endpoints: RingEndpoints } }
  | { id: number; method: "unlock"; params: { endpoints: RingEndpoints; mode: RingMode; walletAddress: string; seed: ArrayBuffer; resetDamaged?: boolean } }
  | { id: number; method: "sync"; params: { requireSlot?: string } }
  | { id: number; method: "view"; params: Record<string, never> }
  | { id: number; method: "publicTokens"; params: { owner: string } }
  | { id: number; method: "checkRecipient"; params: { address: string } }
  | { id: number; method: "buildRegistration"; params: Record<string, never> }
  | { id: number; method: "buildDeposit"; params: { mint: string; amount: string; tokenAccount: string; tokenProgram: string } }
  | { id: number; method: "buildTransfer"; params: { recipient: string; mint: string; amount: string } }
  | { id: number; method: "buildWithdraw"; params: { recipient: string; mint: string; amount: string } }
  | { id: number; method: "buildFundVault"; params: { from: string; lamports: string; token?: { mint: string; amount: string; tokenAccount: string; tokenProgram: string; decimals: number } } }
  | { id: number; method: "submit"; params: { txId: string; signedBytes?: Uint8Array; sync: boolean } }
  | { id: number; method: "discard"; params: { txId: string } }
  | { id: number; method: "lock"; params: Record<string, never> };

export type RingResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: RingErrorPayload };
