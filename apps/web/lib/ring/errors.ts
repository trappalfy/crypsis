// Typed SDK / program / wallet errors -> human messages (brief §8.4). Pure, unit-tested.
import type { RingErrorPayload } from "./protocol";

export interface FriendlyError { message: string; action?: "modeB" | "resync" | "help" | "invite"; retry?: boolean }

const PROVER = "The Ring prover is unavailable right now. Try again in a minute.";

export function friendlyError(e: Partial<RingErrorPayload> & { message?: string; name?: string }): FriendlyError {
  const codes = e.codes ?? (e.code ? [e.code] : []);
  const has = (c: string) => codes.includes(c);
  const msg = e.message ?? "";
  if (has("SENT_UNCONFIRMED")) return { message: "Sent, but not confirmed yet. Check the transaction link before trying again — don't send it twice." };
  if (has("KEYS_CHANGED")) return { message: "This wallet produced different private keys than the ones registered for it. It can't derive stable private keys." };
  if (has("BAD_VAULT_SIGNATURE")) return { message: "Your wallet returned an invalid signature, so a Crypsis vault can't be derived." };
  if (has("WALLET_RECIPIENT_NOT_REGISTERED")) return { message: "This address hasn't activated Crypsis yet.", action: "invite" };
  if (has("WALLET_USER_RECORD_KEYS_MISMATCH") || has("WALLET_REGISTERED_KEYPAIR_MISMATCH")) return { message: "This wallet is registered with different private keys.", action: "help" };
  if (has("WALLET_SNAPSHOT")) return { message: "Local data looks damaged. Resyncing from chain.", action: "resync" };
  if (e.custom === 7039 || /UnsupportedToken2022Extension/.test(msg)) return { message: "This coin can't enter the Ring." };
  if (has("WALLET_SPL_INTERFACE_CREATION_RESTRICTED")) return { message: "This coin can't be made Ring-ready right now." };
  if (has("CLIENT_PROVING_KEY_SET") || codes.some((c) => c.startsWith("CLIENT_PROVER") || c.startsWith("CLIENT_PROVING_KEY"))) return { message: PROVER, retry: true };
  if (codes.some((c) => c.startsWith("CLIENT_INDEXER")) || (has("WALLET_SYNC") && (has("CLIENT_REQUEST") || has("API_REQUEST") || has("CLIENT_TIMEOUT")))) return { message: "The Ring indexer is unavailable right now. Try again in a minute.", retry: true };
  if (has("WALLET_INSUFFICIENT_BALANCE")) return { message: "Not enough private balance for this amount." };
  if (has("WALLET_TOO_MANY_INPUTS")) return { message: "This balance is split into too many pieces for one transaction. Try a smaller amount." };
  if (has("WALLET_INVALID_ADDRESS")) return { message: "That isn't a valid Solana address." };
  if (has("WALLET_INVALID_AMOUNT")) return { message: "Enter an amount greater than zero." };
  if (has("NO_V1") || has("NO_SIGN_TRANSACTION") || /transaction version|unsupported.*version|versioned/i.test(msg)) return { message: "Your wallet can't sign Ring transactions yet. Switch to a Crypsis vault to continue.", action: "modeB" };
  if (has("WALLET_ALTERED_TX")) return { message: "Your wallet changed this Ring transaction, so it can't be sent. Try a Crypsis vault.", action: "modeB" };
  if (has("MESSAGE_ALTERED")) return { message: "This wallet changed the message before signing, so it can't derive Ring keys." };
  if (has("NONDETERMINISTIC")) return { message: "This wallet can't derive stable private keys." };
  if (has("NO_RESPONSE")) return { message: "Your wallet didn't respond. Open it and try again." };
  if (/reject|denied|cancel|declined/i.test(msg) || e.name === "WalletSignTransactionError") return { message: "Request cancelled in your wallet." };
  if (has("INSUFFICIENT_SOL") || /insufficient (funds|lamports)|debit an account/i.test(msg)) return { message: "Not enough SOL to pay the network fee." };
  if (has("BLOCKHASH_EXPIRED") || /blockhash not found|expired/i.test(msg)) return { message: "The transaction expired before it landed. Try again.", retry: true };
  if (has("LOCKED")) return { message: "Unlock your private balance first." };
  if ((e as { signature?: string }).signature) return { message: "Sent, but something failed afterwards. Check the transaction link before trying again." };
  // RPC transport failures (HTTP 429 rate limit, timeouts, outages) — after every specific RPC-borne error above
  if (has("CLIENT_RPC") || codes.some((c) => c.startsWith("SOLANA_81")) || /\b429\b|too many requests/i.test(msg)) return { message: "The Solana network is busy or unreachable right now. Try again in a moment.", retry: true };
  return { message: "Something went wrong. Try again.", retry: true };
}
