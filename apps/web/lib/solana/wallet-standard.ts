"use client";
// Thin Wallet Standard layer. The only place the app touches wallet objects.
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
  type StandardEventsFeature,
} from "@wallet-standard/features";
import {
  SolanaSignMessage,
  SolanaSignTransaction,
  SolanaSignAndSendTransaction,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature,
  type SolanaTransactionVersion,
} from "@solana/wallet-standard-features";

export type SolanaChain = "solana:mainnet" | "solana:devnet";

export interface WalletCapabilities {
  name: string;
  icon: string;
  connect: boolean;
  signMessage: boolean;
  signTransaction: boolean;
  signAndSend: boolean;
  /** Transaction versions the wallet says it can sign. Ring needs 1. */
  txVersions: readonly SolanaTransactionVersion[];
  signsV1: boolean;
  chains: readonly string[];
}

export function isSolanaWallet(w: Wallet): boolean {
  return w.chains.some((c) => c.startsWith("solana:")) && StandardConnect in w.features && SolanaSignMessage in w.features;
}

export function capabilities(w: Wallet): WalletCapabilities {
  const st = w.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
  const txVersions = st?.supportedTransactionVersions ?? [];
  return {
    name: w.name,
    icon: w.icon,
    connect: StandardConnect in w.features,
    signMessage: SolanaSignMessage in w.features,
    signTransaction: !!st,
    signAndSend: SolanaSignAndSendTransaction in w.features,
    txVersions,
    signsV1: txVersions.includes(1),
    chains: w.chains,
  };
}

/** Subscribe to the registry of installed Wallet Standard wallets. */
export function watchWallets(cb: (wallets: readonly Wallet[]) => void): () => void {
  const api = getWallets();
  const emit = () => cb(api.get().filter(isSolanaWallet));
  emit();
  const offA = api.on("register", emit);
  const offB = api.on("unregister", emit);
  return () => { offA(); offB(); };
}

export async function connect(w: Wallet, silent = false): Promise<WalletAccount> {
  const f = w.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
  // a wallet that never answers (MetaMask with a hidden approval window) must not leave the app "connecting"
  const { accounts } = await withTimeout(f.connect(silent ? { silent: true } : undefined), silent ? 10_000 : SIGN_TIMEOUT_MS);
  const acc = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
  if (!acc) throw new Error("The wallet returned no account.");
  return acc;
}

export async function disconnect(w: Wallet): Promise<void> {
  const f = w.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect] | undefined;
  await f?.disconnect();
}

export function onWalletChange(w: Wallet, cb: () => void): () => void {
  const f = w.features[StandardEvents] as StandardEventsFeature[typeof StandardEvents] | undefined;
  return f ? f.on("change", cb) : () => {};
}

/**
 * Sign exact bytes. Returns the signature only if the wallet signed exactly `message`
 * (some wallets wrap or prefix messages, which breaks Ring key derivation).
 */
export async function signExactMessage(w: Wallet, account: WalletAccount, message: Uint8Array, timeoutMs = SIGN_TIMEOUT_MS): Promise<Uint8Array> {
  const f = w.features[SolanaSignMessage] as SolanaSignMessageFeature[typeof SolanaSignMessage];
  const [out] = await withTimeout(f.signMessage({ account, message }), timeoutMs);
  if (!out) throw new Error("The wallet returned no signature.");
  const same = out.signedMessage.length === message.length && out.signedMessage.every((b, i) => b === message[i]);
  if (!same) {
    out.signature.fill(0);
    throw new WalletCapabilityError("MESSAGE_ALTERED", "This wallet changed the message before signing, so it can't derive Ring keys.");
  }
  return out.signature;
}

/** Ask the wallet to sign (not send) serialized transaction bytes. */
export async function signTransactionBytes(w: Wallet, account: WalletAccount, tx: Uint8Array, chain: SolanaChain): Promise<Uint8Array> {
  const f = w.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
  if (!f) throw new WalletCapabilityError("NO_SIGN_TRANSACTION", "This wallet can't sign transactions without sending them.");
  const [out] = await withTimeout(f.signTransaction({ account, transaction: tx, chain }), SIGN_TIMEOUT_MS);
  if (!out) throw new Error("The wallet returned no transaction.");
  return out.signedTransaction;
}

export class WalletCapabilityError extends Error {
  constructor(readonly code: "MESSAGE_ALTERED" | "NO_SIGN_TRANSACTION" | "NO_V1" | "NONDETERMINISTIC" | "NO_RESPONSE", message: string) {
    super(message);
    this.name = "WalletCapabilityError";
  }
}

/** A signature request nobody answers (e.g. a wallet that never opens its popup) must not hang the app. */
export const SIGN_TIMEOUT_MS = 180_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new WalletCapabilityError("NO_RESPONSE", "Your wallet didn't respond. Open it and try again.")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** The person said no in the wallet (as opposed to the wallet being unable to do it). */
export function isUserRejection(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown; name?: unknown } | null;
  if (!err) return false;
  if (err.code === 4001) return true;
  return /reject|denied|cancel|declined/i.test(String(err.message ?? "")) || err.name === "WalletSignTransactionError";
}

/**
 * Mode A needs the wallet to sign the Ring SDK's exact off-chain message envelope. Some wallets refuse it
 * outright (Phantom: "You cannot sign solana transactions using sign message") or rewrite it; those use
 * Mode B. A user's "no" and a wallet that never answers are not refusals.
 */
export function walletRefusedEnvelope(e: unknown): boolean {
  if (e instanceof WalletCapabilityError) return e.code === "MESSAGE_ALTERED";
  return !isUserRejection(e);
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const chainFor = (network: "mainnet" | "devnet"): SolanaChain => (network === "mainnet" ? "solana:mainnet" : "solana:devnet");

/** Sign several transactions in one wallet prompt where the wallet supports it (multiple inputs). */
export async function signTransactionsBytes(w: Wallet, account: WalletAccount, txs: Uint8Array[], chain: SolanaChain): Promise<Uint8Array[]> {
  const f = w.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
  if (!f) throw new WalletCapabilityError("NO_SIGN_TRANSACTION", "This wallet can't sign transactions without sending them.");
  const out = await withTimeout(f.signTransaction(...txs.map((transaction) => ({ account, transaction, chain }))), SIGN_TIMEOUT_MS);
  if (out.length !== txs.length) throw new Error("The wallet returned a different number of transactions.");
  return out.map((o) => o.signedTransaction);
}
