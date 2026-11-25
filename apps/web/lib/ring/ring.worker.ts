/// <reference lib="webworker" />
// Ring SDK runs here, off the UI thread. This is the ONLY browser module that imports @heliuslabs/spr.
// Keys, UTXOs and decrypted balances live only in this worker's memory. Locking = terminating the worker.
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPair,
  getAddressEncoder,
  getAddressFromPublicKey,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getBase58Decoder,
  getPublicKeyFromAddress,
  verifySignature,
  getTransactionEncoder,
  partiallySignTransactionWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signBytes,
  type Address,
  type Instruction,
  type Transaction,
  type TransactionPartialSigner,
} from "@solana/kit";
import {
  LocalKeys,
  ShieldedKeypair,
  SigningKey,
  SOL_MINT,
  Wallet,
  buildDepositTransaction,
  buildRegistrationTransaction,
  buildTransferTransaction,
  buildWithdrawalTransaction,
  createSprClient,
  deserializeWallet,
  getPrivateTokenBalances,
  getPrivateTransactions,
  keyedWalletSnapshotCipher,
  loadPersistedWallet,
  serializeWallet,
  syncPersistedWallet,
  walletSnapshotCipher,
  walletSnapshotKey,
  type Bytes32,
  type WalletStateCipher,
  type WalletStateStore,
} from "@heliuslabs/spr";
import { SignedTeePolicy, type SprClient } from "@heliuslabs/spr/client";
import { ed25519DerivationMessage } from "@heliuslabs/spr/keypair";
import { getSplAssetRegistryAddress, getUserRecordAddress } from "@heliuslabs/spr/addresses";
import { getTransferSolInstruction } from "@solana-program/system";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync, getTransferCheckedInstruction } from "@solana-program/token";
import type {
  ActivityItem, BuiltTx, ProbeTx, PrivateBalance, PublicToken, RingEndpoints, RingErrorPayload, RingMode, RingRequest, RingResponse,
  SelftestResult, SubmitResult, TokenInfo, WalletView,
} from "./protocol";
import { snapshotKeyMaterial, vaultSeedFromSignature } from "./snapshot-key";
import { keyedServiceConfig } from "./api-key";
import { vaultMessage } from "./derivation";
import { idbSnapshotStore } from "./idb-store";
import { decodeMetaplex, decodeMintInfo } from "./token-meta";

declare const self: DedicatedWorkerGlobalScope;

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const BASE_FEE_LAMPORTS = 5000n;
/** Priority fee per Ring transaction (v1 carries it in the message). Without one, mainnet txs can expire under load. */
const PRIORITY_FEE_LAMPORTS = 20_000n;
const USER_RECORD_SIZE = 100n;

// ---------------------------------------------------------------- client
let clientPromise: Promise<SprClient> | null = null;
let clientKey = "";
function getClient(e: RingEndpoints): Promise<SprClient> {
  const key = JSON.stringify(e);
  if (!clientPromise || key !== clientKey) {
    clientKey = key;
    clientPromise = createSprClient({
      solanaRpcUrl: e.rpcUrl,
      ...keyedServiceConfig(e),
      proverTee: SignedTeePolicy.forNetwork(e.network),
      priorityFeeLamports: PRIORITY_FEE_LAMPORTS,
    });
  }
  return clientPromise;
}

const txVersion = (messageBytes: Uint8Array): number | "legacy" => (messageBytes[0] & 0x80 ? messageBytes[0] & 0x7f : "legacy");

// ---------------------------------------------------------------- session
interface Session {
  endpoints: RingEndpoints;
  client: SprClient;
  mode: RingMode;
  walletAddress: Address;
  /** Solana address that owns the private balance: the wallet (A) or the vault (B) */
  ringAddress: Address;
  keys: LocalKeys;
  keypair?: ShieldedKeypair;
  vaultSigner?: TransactionPartialSigner;
  wallet: Wallet;
  cipher: WalletStateCipher;
  store: WalletStateStore;
  syncedSlot: bigint | null;
  registered: boolean | null;
}
let S: Session | null = null;
const pending = new Map<string, { tx: Transaction; signer: "wallet" | "vault"; kind: BuiltTx["summary"]["kind"] }>();
const meta = new Map<string, TokenInfo>();
const need = () => { if (!S) throw Object.assign(new Error("locked"), { code: "LOCKED" }); return S; };

async function unlock(p: { endpoints: RingEndpoints; mode: RingMode; walletAddress: string; seed: ArrayBuffer; resetDamaged?: boolean }) {
  lock();
  const client = await getClient(p.endpoints);
  const seed = new Uint8Array(p.seed);
  const walletAddress = address(p.walletAddress);
  let keys: LocalKeys | undefined, cipher: WalletStateCipher, ringAddress: Address, keypair: ShieldedKeypair | undefined, vaultSigner: TransactionPartialSigner | undefined;
  const drop = () => { try { keys?.destroy(); } catch {} try { keypair?.destroy(); } catch {} };
  try {
    if (p.mode === "A") {
      // exact SDK path: the signature over ed25519DerivationMessage(walletPubkey) is the derivation seed
      // (the SDK verifies it against the wallet key with strict ed25519)
      keys = LocalKeys.fromDerivationSeed({ solanaPublicKey: walletAddress, derivationSeed: seed }, client.proofService);
      cipher = keyedWalletSnapshotCipher(keys.address(), await walletSnapshotKey(await snapshotKeyMaterial(seed)));
      ringAddress = walletAddress;
    } else {
      // Mode B: the signature must be a real Ed25519 signature by this wallet over the vault message —
      // otherwise a broken wallet returning a constant "signature" would give every user the same vault key.
      if (seed.length !== 64 || seed.every((b) => b === 0)) throw Object.assign(new Error("bad vault signature"), { code: "BAD_VAULT_SIGNATURE" });
      const msg = vaultMessage();
      const ok = await verifySignature(await getPublicKeyFromAddress(walletAddress), seed as unknown as Parameters<typeof verifySignature>[1], msg).catch(() => false);
      if (!ok) throw Object.assign(new Error("bad vault signature"), { code: "BAD_VAULT_SIGNATURE" });
      // HKDF(signature) -> one Ed25519 seed for both the vault's Solana signer and its ShieldedKeypair
      const vaultSeed = await vaultSeedFromSignature(seed);
      keypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(vaultSeed as Bytes32));
      vaultSeed.fill(0);
      keys = LocalKeys.fromKeypair(keypair, client.proofService);
      cipher = walletSnapshotCipher(keypair);
      vaultSigner = keypair.toSolanaSigner();
      ringAddress = vaultSigner.address;
    }
  } catch (e) {
    drop();
    throw e;
  } finally {
    seed.fill(0);
  }
  try {
    // Key-drift check on every unlock: a registered owner must derive exactly the published keys.
    let registered: boolean | null = null;
    try {
      registered = (await buildRegistrationTransaction({ client, owner: ringAddress, address: keys.address() })) === undefined;
    } catch (e) {
      if (codesOf(e).some((c) => c === "WALLET_USER_RECORD_KEYS_MISMATCH" || c === "WALLET_REGISTERED_KEYPAIR_MISMATCH"))
        throw Object.assign(new Error("keys changed"), { code: "KEYS_CHANGED" });
      // network problems: can't verify now; continue (sync will surface the outage)
    }
    const store = idbSnapshotStore(await storeKey(p.endpoints.network, p.mode, ringAddress));
    let wallet: Wallet, damaged = false, restored = false;
    try {
      const w = await loadPersistedWallet({ store, cipher });
      restored = !!w;
      wallet = w ?? new Wallet({ identity: keys.address() });
    } catch (e) {
      if (!codesOf(e).includes("WALLET_SNAPSHOT")) throw e;
      // Only wipe the local snapshot when the keys are proven stable (registered match, or a fresh
      // double-signature check in this unlock); otherwise ask for that check first.
      if (!registered && !p.resetDamaged) throw Object.assign(new Error("snapshot unverified"), { code: "SNAPSHOT_UNVERIFIED" });
      damaged = true;
      await store.save("");
      wallet = new Wallet({ identity: keys.address() });
    }
    S = { endpoints: p.endpoints, client, mode: p.mode, walletAddress, ringAddress, keys, keypair, vaultSigner, wallet, cipher, store, syncedSlot: null, registered };
    return { ringAddress, mode: p.mode, restored, damaged };
  } catch (e) {
    drop();
    throw e;
  }
}

/** IndexedDB record name: a hash, so the device doesn't store wallet addresses in clear. */
async function storeKey(network: string, mode: RingMode, owner: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`crypsis/${network}/${mode}/${owner}`)));
  return Array.from(d.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

function lock() {
  if (S) { try { S.keys.destroy(); } catch {} try { S.keypair?.destroy(); } catch {} }
  S = null;
  pending.clear();
}

// ---------------------------------------------------------------- metadata (browser-side RPC only)
async function tokenInfo(client: SprClient, mint: string): Promise<TokenInfo> {
  const hit = meta.get(mint);
  if (hit) return hit;
  if (mint === SOL_MINT) {
    const sol = { mint, symbol: "SOL", name: "Solana", decimals: 9, tokenProgram: "", isPump: false, ringReady: true };
    meta.set(mint, sol);
    return sol;
  }
  const acc = await client.getAccount(address(mint));
  if (!acc) throw Object.assign(new Error("Unknown token"), { code: "UNKNOWN_MINT" });
  const base = decodeMintInfo(acc.data);
  let { symbol, name } = base;
  if (!symbol) {
    const mpl = await client.getAccount(await metaplexPda(mint)).catch(() => undefined);
    if (mpl) ({ symbol, name } = decodeMetaplex(mpl.data));
  }
  const [curve, reg] = await Promise.all([client.getAccount(await bondingCurvePda(mint)).catch(() => undefined), client.getAccount(await getSplAssetRegistryAddress(address(mint))).catch(() => undefined)]);
  const info: TokenInfo = { mint, symbol, name, decimals: base.decimals, tokenProgram: acc.owner as string, isPump: (curve?.owner as string | undefined) === PUMP_PROGRAM, ringReady: !!reg && reg.data.length > 0 };
  meta.set(mint, info);
  return info;
}
async function pda(program: string, seeds: Uint8Array[]): Promise<Address> {
  const { getProgramDerivedAddress } = await import("@solana/kit");
  return (await getProgramDerivedAddress({ programAddress: address(program), seeds }))[0];
}
const enc = new TextEncoder();
const metaplexPda = (mint: string) => pda("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", [enc.encode("metadata"), getAddressEncoder().encode(address("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")) as Uint8Array, getAddressEncoder().encode(address(mint)) as Uint8Array]);
const bondingCurvePda = (mint: string) => pda(PUMP_PROGRAM, [enc.encode("bonding-curve"), getAddressEncoder().encode(address(mint)) as Uint8Array]);

// ---------------------------------------------------------------- views
async function isRegistered(s: Session): Promise<boolean> {
  if (s.registered) return true;
  const rec = await s.client.getAccount(await getUserRecordAddress(s.ringAddress));
  s.registered = !!rec && rec.data.length > 0;
  return s.registered;
}

async function view(s: Session): Promise<WalletView> {
  const balances: PrivateBalance[] = [];
  for (const b of getPrivateTokenBalances(s.wallet)) {
    const info = await tokenInfo(s.client, b.mint as string).catch(() => ({ mint: b.mint as string, symbol: null, name: null, decimals: 0, tokenProgram: "", isPump: false, ringReady: true }));
    balances.push({ ...info, amount: b.amount.toString() });
  }
  const activity: ActivityItem[] = [];
  for (const t of getPrivateTransactions(s.wallet)) {
    const info = meta.get(t.asset as string);
    activity.push({ id: JSON.stringify(t.id, (_, v) => (typeof v === "bigint" ? v.toString() : v)), kind: t.kind, direction: t.direction, mint: t.asset as string, amount: t.amount.toString(), symbol: info?.symbol ?? null, decimals: info?.decimals ?? 0 });
  }
  const v: WalletView = { ringAddress: s.ringAddress, mode: s.mode, registered: await isRegistered(s), balances, activity: activity.reverse(), syncedSlot: s.syncedSlot?.toString() ?? null };
  if (s.mode === "B") v.vaultLamports = (await s.client.getBalance(s.ringAddress)).toString();
  return v;
}

async function sync(requireSlot?: string): Promise<WalletView> {
  const s = need();
  await syncPersistedWallet({ client: s.client, wallet: s.wallet, keys: s.keys, store: s.store, cipher: s.cipher, ...(requireSlot ? { config: { requireSlot: BigInt(requireSlot) } } : {}) });
  s.syncedSlot = requireSlot ? BigInt(requireSlot) : await s.client.getSlot();
  return view(s);
}

// ---------------------------------------------------------------- public tokens (deposit picker)
interface ParsedTokenAccount { pubkey: string; account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } }
async function publicTokens(owner: string): Promise<PublicToken[]> {
  const s = need();
  const out: PublicToken[] = [];
  const sol = await s.client.getBalance(address(owner));
  out.push({ ...(await tokenInfo(s.client, SOL_MINT)), tokenAccount: owner, amount: sol.toString() });
  for (const programId of ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]) {
    const r = (await s.client.solanaRpc.getTokenAccountsByOwner(address(owner), { programId: address(programId) }, { encoding: "jsonParsed" }).send()) as unknown as { value: ParsedTokenAccount[] };
    for (const a of r.value) {
      const info = a.account.data.parsed.info;
      if (info.tokenAmount.amount === "0") continue;
      const t = await tokenInfo(s.client, info.mint).catch(() => null);
      if (t) out.push({ ...t, tokenAccount: a.pubkey, amount: info.tokenAmount.amount });
    }
  }
  return out;
}

// ---------------------------------------------------------------- building
let seq = 0;
async function register(s: Session, tx: Transaction, extra: Omit<BuiltTx, "id" | "bytes" | "version" | "signer" | "feeLamports">): Promise<BuiltTx> {
  const id = `tx${++seq}`;
  // Mode B: every Ring transaction is paid and owned by the vault, signed here; the wallet never sees it
  const signer: BuiltTx["signer"] = s.mode === "B" && extra.summary.kind !== "fund" ? "vault" : "wallet";
  pending.set(id, { tx, signer, kind: extra.summary.kind });
  const sigs = BigInt(Object.keys(tx.signatures).length);
  return { id, bytes: new Uint8Array(getTransactionEncoder().encode(tx)), version: txVersion(tx.messageBytes as unknown as Uint8Array), signer, feeLamports: (BASE_FEE_LAMPORTS * sigs + PRIORITY_FEE_LAMPORTS).toString(), ...extra };
}

async function buildRegistration(): Promise<BuiltTx | null> {
  const s = need();
  const tx = await buildRegistrationTransaction({ client: s.client, owner: s.ringAddress, address: s.keys.address() });
  if (!tx) { s.registered = true; return null; }
  const rent = await s.client.solanaRpc.getMinimumBalanceForRentExemption(USER_RECORD_SIZE).send();
  return register(s, tx, { rentLamports: rent.toString(), summary: { kind: "register" } });
}

async function buildDeposit(p: { mint: string; amount: string; tokenAccount: string; tokenProgram: string }): Promise<BuiltTx> {
  const s = need();
  const isSol = p.mint === SOL_MINT;
  const info = isSol ? null : await tokenInfo(s.client, p.mint);
  const tx = await buildDepositTransaction({
    client: s.client, feePayer: s.ringAddress, recipient: s.keys.address(), amount: BigInt(p.amount),
    ...(isSol ? {} : { asset: address(p.mint), splTokenAccount: address(p.tokenAccount), splTokenProgram: address(p.tokenProgram) }),
  });
  // a first deposit creates the coin's Ring vault: registry (48 B) + vault token account rent
  let rent = 0n;
  if (info && !info.ringReady) {
    const [a, b] = await Promise.all([s.client.solanaRpc.getMinimumBalanceForRentExemption(48n).send(), s.client.solanaRpc.getMinimumBalanceForRentExemption(info.tokenProgram.startsWith("Tokenz") ? 182n : 165n).send()]);
    rent = a + b;
  }
  const di = info ?? (await tokenInfo(s.client, SOL_MINT));
  return register(s, tx, { rentLamports: rent.toString(), summary: { kind: "deposit", mint: p.mint, amount: p.amount, from: s.ringAddress, decimals: di.decimals, symbol: di.symbol, createsInterface: !!info && !info.ringReady } });
}

async function checkRecipient(addr: string): Promise<{ registered: boolean }> {
  const s = need();
  const rec = await s.client.getAccount(await getUserRecordAddress(address(addr)));
  return { registered: !!rec && rec.data.length > 0 };
}

async function buildTransfer(p: { recipient: string; mint: string; amount: string }): Promise<BuiltTx> {
  const s = need();
  if (!(await checkRecipient(p.recipient)).registered) throw Object.assign(new Error("recipient not registered"), { code: "WALLET_RECIPIENT_NOT_REGISTERED" });
  const tx = await buildTransferTransaction({ client: s.client, wallet: s.wallet, keys: s.keys, feePayer: s.ringAddress, recipient: address(p.recipient), amount: BigInt(p.amount), ...(p.mint === SOL_MINT ? {} : { asset: address(p.mint) }) });
  const ti = await tokenInfo(s.client, p.mint);
  return register(s, tx, { rentLamports: "0", summary: { kind: "transfer", mint: p.mint, amount: p.amount, recipient: p.recipient, from: s.ringAddress, decimals: ti.decimals, symbol: ti.symbol } });
}

async function buildWithdraw(p: { recipient: string; mint: string; amount: string }): Promise<BuiltTx> {
  const s = need();
  const isSol = p.mint === SOL_MINT;
  const info = isSol ? null : await tokenInfo(s.client, p.mint);
  const tx = await buildWithdrawalTransaction({
    client: s.client, wallet: s.wallet, keys: s.keys, feePayer: s.ringAddress, recipient: address(p.recipient), amount: BigInt(p.amount),
    ...(isSol ? {} : { asset: address(p.mint), splTokenProgram: address(info!.tokenProgram) }),
  });
  const wi = info ?? (await tokenInfo(s.client, SOL_MINT));
  return register(s, tx, { rentLamports: "0", summary: { kind: "withdraw", mint: p.mint, amount: p.amount, recipient: p.recipient, from: s.ringAddress, decimals: wi.decimals, symbol: wi.symbol } });
}

/** Mode B: an ordinary (v0) transaction from the main wallet to the vault: SOL for fees and/or tokens. */
async function buildFundVault(p: { from: string; lamports: string; token?: { mint: string; amount: string; tokenAccount: string; tokenProgram: string; decimals: number } }): Promise<BuiltTx> {
  const s = need();
  if (s.mode !== "B") throw new Error("funding is for Crypsis vault mode");
  const from = createNoopSigner(address(p.from));
  const ixs: Instruction[] = [];
  if (BigInt(p.lamports) > 0n) ixs.push(getTransferSolInstruction({ source: from, destination: s.ringAddress, amount: BigInt(p.lamports) }));
  if (p.token && BigInt(p.token.amount) > 0n) {
    const mint = address(p.token.mint), tokenProgram = address(p.token.tokenProgram);
    const [ata] = await findAssociatedTokenPda({ owner: s.ringAddress, mint, tokenProgram });
    ixs.push(await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: from, owner: s.ringAddress, mint, tokenProgram }));
    ixs.push(getTransferCheckedInstruction({ source: address(p.token.tokenAccount), mint, destination: ata, authority: from, amount: BigInt(p.token.amount), decimals: p.token.decimals }, { programAddress: tokenProgram }));
  }
  const { value: bh } = await s.client.solanaRpc.getLatestBlockhash().send();
  const msg = pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayer(address(p.from), m), (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m), (m) => appendTransactionMessageInstructions(ixs, m));
  const tx = compileTransaction(msg);
  const id = `tx${++seq}`;
  pending.set(id, { tx, signer: "wallet", kind: "fund" });
  return { id, bytes: new Uint8Array(getTransactionEncoder().encode(tx)), version: 0, signer: "wallet", feeLamports: BASE_FEE_LAMPORTS.toString(), rentLamports: "0", summary: { kind: "fund", lamports: p.lamports, from: p.from, recipient: s.ringAddress, ...(p.token ? { mint: p.token.mint, amount: p.token.amount, decimals: p.token.decimals, symbol: meta.get(p.token.mint)?.symbol ?? null } : {}) } };
}

// ---------------------------------------------------------------- submit
/**
 * Legacy / v0 wire: shortvec(signature count) || 64-byte signatures || message.
 * v1 wire (Ring transactions): message || 64-byte signatures (count = the message's required signers).
 */
function splitWire(bytes: Uint8Array): { sigs: Uint8Array[]; message: Uint8Array } {
  if ((bytes[0] & 0x80) && (bytes[0] & 0x7f) === 1) {
    const v1Signers = bytes[1]; // header: required signatures
    const start = bytes.length - 64 * v1Signers;
    return { sigs: Array.from({ length: v1Signers }, (_, i) => bytes.slice(start + 64 * i, start + 64 * (i + 1))), message: bytes.subarray(0, start) };
  }
  let count = 0, size = 0;
  for (;;) { const b = bytes[size]; count |= (b & 0x7f) << (7 * size); size++; if (!(b & 0x80)) break; }
  const sigs = Array.from({ length: count }, (_, i) => bytes.slice(size + 64 * i, size + 64 * (i + 1)));
  return { sigs, message: bytes.subarray(size + 64 * count) };
}

async function submit(p: { txId: string; signedBytes?: Uint8Array; sync: boolean }): Promise<SubmitResult> {
  const s = need();
  const entry = pending.get(p.txId);
  if (!entry) throw new Error("This transaction expired. Build it again.");
  pending.delete(p.txId);
  let wire: string, signature: string;
  if (entry.signer === "vault") {
    const tx = await partiallySignTransactionWithSigners([s.vaultSigner!], entry.tx);
    wire = getBase64EncodedWireTransaction(tx);
    signature = getSignatureFromTransaction(tx as Parameters<typeof getSignatureFromTransaction>[0]);
  } else {
    if (!p.signedBytes) throw new Error("missing wallet signature");
    const { sigs, message } = splitWire(p.signedBytes);
    const original = entry.tx.messageBytes as unknown as Uint8Array;
    const same = message.length === original.length && message.every((b, i) => b === original[i]);
    if (same) {
      // put the wallet's signatures back into our own transaction object, in signer order
      const signers = Object.keys(entry.tx.signatures) as Address[];
      const signatures = { ...entry.tx.signatures } as Record<string, unknown>;
      signers.forEach((a, i) => { const sig = sigs[i]; if (sig && sig.some((b) => b !== 0)) signatures[a] = sig; });
      const tx = { ...entry.tx, signatures } as unknown as Transaction;
      wire = getBase64EncodedWireTransaction(tx);
      signature = getSignatureFromTransaction(tx as Parameters<typeof getSignatureFromTransaction>[0]);
    } else if (entry.kind === "fund") {
      // ordinary transfer: wallets may add priority fees; send exactly what the wallet signed
      wire = btoa(String.fromCharCode(...p.signedBytes));
      signature = getBase58Decoder().decode(sigs[0]);
    } else {
      throw Object.assign(new Error("The wallet changed the transaction before signing."), { code: "WALLET_ALTERED_TX" });
    }
  }
  await s.client.solanaRpc.sendTransaction(wire as Parameters<typeof s.client.solanaRpc.sendTransaction>[0], { encoding: "base64", preflightCommitment: "confirmed" }).send();
  // From here on the transaction IS sent: every outcome carries the signature, never "nothing was sent".
  let slot: bigint;
  try {
    slot = await s.client.confirmTransaction(signature as Parameters<typeof s.client.confirmTransaction>[0]);
  } catch (e) {
    throw Object.assign(new Error("sent, not confirmed yet"), { code: "SENT_UNCONFIRMED", signature, cause: e });
  }
  if (entry.kind === "register") s.registered = true;
  // never build the next private spend before syncing past this transaction
  if (!p.sync) return { signature, slot: slot.toString() };
  try {
    return { signature, slot: slot.toString(), view: await sync(slot.toString()) };
  } catch {
    return { signature, slot: slot.toString(), syncFailed: true };
  }
}

// ---------------------------------------------------------------- phase-0 helpers
async function selftest(endpoints: RingEndpoints): Promise<SelftestResult> {
  const t0 = performance.now();
  const client = await createSprClient({ solanaRpcUrl: endpoints.rpcUrl });
  const t1 = performance.now();
  const kp = await generateKeyPair();
  const owner = await getAddressFromPublicKey(kp.publicKey);
  const msg = ed25519DerivationMessage(getAddressEncoder().encode(owner) as unknown as Bytes32);
  const seed = new Uint8Array(await signBytes(kp.privateKey, msg));
  const keys = LocalKeys.fromDerivationSeed({ solanaPublicKey: owner, derivationSeed: seed }, client.proofService);
  const material = await snapshotKeyMaterial(seed);
  seed.fill(0);
  const t2 = performance.now();
  const tx = await buildDepositTransaction({ client, feePayer: owner, recipient: keys.address(), amount: 1_000_000n });
  const t3 = performance.now();
  const wallet = new Wallet({ identity: keys.address() });
  const cipher = keyedWalletSnapshotCipher(keys.address(), await walletSnapshotKey(material));
  const sealed = await cipher.seal(serializeWallet(wallet));
  const reopened = deserializeWallet(await cipher.open(sealed));
  const a = reopened.identity.toBytes(), b = keys.address().toBytes();
  const snapshotRoundtrip = a.length === b.length && a.every((x, i) => x === b[i]) && !sealed.includes(owner);
  let indexedDb = false;
  try {
    const st = idbSnapshotStore("selftest");
    await st.save("x");
    indexedDb = (await st.load()) === "x";
    await st.save("");
  } catch { indexedDb = false; }
  keys.destroy();
  return { poseidonMs: Math.round(t1 - t0), deriveMs: Math.round(t2 - t1), buildMs: Math.round(t3 - t2), txBytes: getTransactionEncoder().encode(tx).length, txVersion: txVersion(tx.messageBytes as unknown as Uint8Array), shieldedAddress: keys.address().solanaAddress(), snapshotRoundtrip, indexedDb };
}

async function probeTransaction(endpoints: RingEndpoints, owner: string): Promise<ProbeTx> {
  const client = await createSprClient({ solanaRpcUrl: endpoints.rpcUrl });
  const recipient = ShieldedKeypair.generate();
  const tx = await buildDepositTransaction({ client, feePayer: address(owner), recipient: recipient.shieldedAddress(), amount: 1_000n });
  recipient.destroy();
  return { bytes: new Uint8Array(getTransactionEncoder().encode(tx)), version: txVersion(tx.messageBytes as unknown as Uint8Array) };
}

/** Prover attestation + indexer reachability, for the status indicator (R11). */
async function health(endpoints: RingEndpoints): Promise<{ prover: boolean; indexer: boolean; rpc: boolean }> {
  const client = await getClient(endpoints);
  const [rpc, prover, indexer] = await Promise.all([
    client.getSlot().then(() => true, () => false),
    client.attestProver().then(() => true, () => false),
    client.getUserRecords([address("11111111111111111111111111111111")]).then(() => true, () => false),
  ]);
  return { prover, indexer, rpc };
}

// ---------------------------------------------------------------- errors
function codesOf(e: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && i < 8; i++) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === "string") out.push(c);
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}
function errorPayload(e: unknown): RingErrorPayload {
  const codes = codesOf(e);
  const text = (() => {
    let m = ""; let cur: unknown = e;
    for (let i = 0; cur && i < 8; i++) {
      m += ` ${(cur as Error).message ?? ""}`;
      const ctx = (cur as { context?: Record<string, unknown> }).context;
      if (ctx) { try { m += ` ${JSON.stringify(ctx, (_, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 2000)}`; } catch {} }
      cur = (cur as { cause?: unknown }).cause;
    }
    return m;
  })();
  // @solana/kit errors: numeric codes in context.__code, along the cause chain
  let kitCustom: number | undefined;
  for (let cur: unknown = e, i = 0; cur && i < 8; i++, cur = (cur as { cause?: unknown }).cause) {
    const ctx = (cur as { context?: { __code?: number; code?: number } }).context;
    if (ctx?.__code === undefined) continue;
    codes.push(`SOLANA_${ctx.__code}`);
    if (ctx.__code === 4615026 && typeof ctx.code === "number") kitCustom = ctx.code; // INSTRUCTION_ERROR__CUSTOM
  }
  const has = (n: number) => codes.includes(`SOLANA_${n}`);
  if ([7050003, 7050005, 7050006, 7050031, 4615006].some(has) || /AccountNotFound|InsufficientFundsForFee|no record of a prior credit/i.test(text)) codes.push("INSUFFICIENT_SOL");
  if (has(7050008)) codes.push("BLOCKHASH_EXPIRED");
  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);
  const num = text.match(/"Custom":\s*(\d+)/);
  const custom = kitCustom ?? (hex ? parseInt(hex[1], 16) : num ? Number(num[1]) : undefined);
  const signature = (e as { signature?: string })?.signature;
  return { ...(signature ? { signature } : {}), code: codes[0], codes, message: String((e as Error)?.message ?? e).replace(/api-key=[^&\s"]+/g, "api-key=***").slice(0, 300), ...(custom !== undefined ? { custom } : {}) };
}

// ---------------------------------------------------------------- dispatch
self.onmessage = async (ev: MessageEvent<RingRequest>) => {
  const req = ev.data;
  const reply = (r: RingResponse, transfer: Transferable[] = []) => self.postMessage(r, transfer);
  try {
    let result: unknown;
    const transfer: Transferable[] = [];
    switch (req.method) {
      case "selftest": result = await selftest(req.params.endpoints); break;
      case "probeTransaction": { const r = await probeTransaction(req.params.endpoints, req.params.owner); transfer.push(r.bytes.buffer as ArrayBuffer); result = r; break; }
      case "health": result = await health(req.params.endpoints); break;
      case "unlock": result = await unlock(req.params); break;
      case "sync": result = await sync(req.params.requireSlot); break;
      case "view": result = await view(need()); break;
      case "publicTokens": result = await publicTokens(req.params.owner); break;
      case "checkRecipient": result = await checkRecipient(req.params.address); break;
      case "buildRegistration": result = await buildRegistration(); break;
      case "buildDeposit": result = await buildDeposit(req.params); break;
      case "buildTransfer": result = await buildTransfer(req.params); break;
      case "buildWithdraw": result = await buildWithdraw(req.params); break;
      case "buildFundVault": result = await buildFundVault(req.params); break;
      case "submit": result = await submit(req.params); break;
      case "discard": pending.delete(req.params.txId); result = true; break;
      case "lock": lock(); result = true; break;
    }
    reply({ id: req.id, ok: true, result }, transfer);
  } catch (e) {
    reply({ id: req.id, ok: false, error: errorPayload(e) });
  }
};
