// pump.fun launch builders (brief §2.5, §6 /launch). Runs in the browser (/launch only) and in node scripts.
// pump-sdk is web3.js v1 + Anchor; the Ring SDK is @solana/kit. This file is the thin adapter between them:
// kit instructions -> web3 TransactionInstruction, nothing else mixes the two.
import BN from "bn.js";
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import type { Instruction as KitInstruction } from "@solana/kit";

/** pump.fun UI limits. [VERIFY against pump.fun when they change] */
export const NAME_MAX = 32;
export const SYMBOL_MAX = 10;
export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
/** Public onchain marker so the tracker can verify "Launched on Crypsis" without trusting the client. */
export const LAUNCH_MEMO = "crypsis.fun/launch/v1";
export const CREATE_CU_LIMIT = 500_000;

export function kitToWeb3(ix: KitInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      // kit AccountRole: 0 readonly, 1 writable, 2 readonly signer, 3 writable signer
      isSigner: a.role >= 2,
      isWritable: a.role === 1 || a.role === 3,
    })),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

export function memoInstruction(text: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: signer, isSigner: true, isWritable: false }], data: Buffer.from(text, "utf8") });
}

export interface LaunchParams {
  connection: Connection;
  user: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  /** dev buy in lamports; 0 = create only */
  devBuyLamports: bigint;
  /** slippage percent for the first buy (pump-sdk default 1) */
  slippage?: number;
}

export function validateLaunch(name: string, symbol: string): string | null {
  if (!name.trim()) return "Name is required.";
  if (name.length > NAME_MAX) return `Name is at most ${NAME_MAX} characters.`;
  if (!symbol.trim()) return "Ticker is required.";
  if (symbol.length > SYMBOL_MAX) return `Ticker is at most ${SYMBOL_MAX} characters.`;
  return null;
}

export const TX_SIZE_LIMIT = 1232;

/**
 * Tx1 instructions. create_v2 (Token-2022) [+ first buy]. Fetches fresh global/feeConfig before every build.
 * With a dev buy we use pump-sdk's createV2AndBuyInstructions (legacy SOL-quoted buy): create_v2 + buy_v2
 * needs ~33 accounts and can't fit 1232 bytes without a lookup table. No compute-budget instruction:
 * the default 200k CU per instruction covers create + ATA + buy.
 */
export async function launchInstructions(p: LaunchParams): Promise<{ create: TransactionInstruction[]; buy: TransactionInstruction[]; expectedTokens: bigint }> {
  const online = new OnlinePumpSdk(p.connection);
  const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
  if (p.devBuyLamports <= 0n) {
    return { create: [ComputeBudgetProgram.setComputeUnitLimit({ units: CREATE_CU_LIMIT }), await PUMP_SDK.createV2Instruction({ mint: p.mint, name: p.name, symbol: p.symbol, uri: p.uri, creator: p.user, user: p.user, mayhemMode: false })], buy: [], expectedTokens: 0n };
  }
  const solAmount = new BN(p.devBuyLamports.toString());
  const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT });
  // never pass cashback (create_v2 rejects it with 6082); no holderReward / creatorFeeBps in v1 [OWNER]
  const ixs = await PUMP_SDK.createV2AndBuyInstructions({ global, mint: p.mint, name: p.name, symbol: p.symbol, uri: p.uri, creator: p.user, user: p.user, amount, solAmount, mayhemMode: false });
  return { create: ixs.slice(0, 1), buy: ixs.slice(1), expectedTokens: BigInt(amount.toString()) };
}

/** Tx2: open the coin's Ring vault (permissionless; the payer pays rent) + the Crypsis launch memo, signed by the creator. */
export async function ringReadyInstructions(user: PublicKey, mint: PublicKey, tokenProgram = TOKEN_2022_PROGRAM_ID, memo = true): Promise<TransactionInstruction[]> {
  const { getCreateSplInterfaceInstructionAsync } = await import("@heliuslabs/spr/instructions");
  const { address } = await import("@solana/kit");
  const ix = kitToWeb3(await getCreateSplInterfaceInstructionAsync({ authority: address(user.toBase58()), mint: address(mint.toBase58()), tokenProgram: address(tokenProgram.toBase58()) }));
  return memo ? [ix, memoInstruction(`${LAUNCH_MEMO} ${mint.toBase58()}`, user)] : [ix];
}

export async function toV0(connection: Connection, payer: PublicKey, ixs: TransactionInstruction[], blockhash?: string): Promise<VersionedTransaction> {
  const bh = blockhash ?? (await connection.getLatestBlockhash("confirmed")).blockhash;
  return new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: bh, instructions: ixs }).compileToV0Message());
}
export function fits(tx: VersionedTransaction): boolean {
  try { return tx.serialize().length <= TX_SIZE_LIMIT; } catch { return false; }
}

export interface BuiltLaunch {
  mint: Keypair;
  /** in send order: create(+buy) [, buy] [, ring-ready]; the mint keypair has already signed the create */
  txs: { label: "create" | "buy" | "ringReady"; tx: VersionedTransaction }[];
  /** true when the dev buy didn't fit next to create and goes in its own transaction right after it */
  buySplit: boolean;
  expectedTokens: bigint;
  /** registry + vault token account rent for Tx2 */
  ringRentLamports: number;
}

export async function buildLaunch(p: Omit<LaunchParams, "mint"> & { ringReady: boolean; mint?: Keypair }): Promise<BuiltLaunch> {
  const mint = p.mint ?? Keypair.generate(); // generated in the browser; signs create_v2 and is then dropped
  const { create, buy, expectedTokens } = await launchInstructions({ ...p, mint: mint.publicKey });
  const { blockhash } = await p.connection.getLatestBlockhash("confirmed");
  const txs: BuiltLaunch["txs"] = [];
  let buySplit = false;
  const together = await toV0(p.connection, p.user, [...create, ...buy], blockhash);
  if (fits(together)) txs.push({ label: "create", tx: together });
  else {
    buySplit = true;
    txs.push({ label: "create", tx: await toV0(p.connection, p.user, [ComputeBudgetProgram.setComputeUnitLimit({ units: CREATE_CU_LIMIT }), ...create], blockhash) });
    txs.push({ label: "buy", tx: await toV0(p.connection, p.user, buy, blockhash) });
  }
  txs[0].tx.sign([mint]);
  let ringRentLamports = 0;
  if (p.ringReady) {
    txs.push({ label: "ringReady", tx: await toV0(p.connection, p.user, await ringReadyInstructions(p.user, mint.publicKey), blockhash) });
    const [a, b] = await Promise.all([p.connection.getMinimumBalanceForRentExemption(48), p.connection.getMinimumBalanceForRentExemption(182)]);
    ringRentLamports = a + b;
  }
  return { mint, txs, buySplit, expectedTokens, ringRentLamports };
}

export const shareOnXUrl = (mint: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(`Just launched on pump.fun via @crypsisfun. Ring-ready from block one. https://pump.fun/coin/${mint}`)}`;
