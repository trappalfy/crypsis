// Phase 0 / step 2 — full Ring cycle on DEVNET with local keypairs (devnet only, never mainnet).
// register -> deposit SOL -> deposit SPL -> private transfer -> recipient sync -> withdraw -> sync
//
// Exercises both key modes of the app:
//   payer     = Mode A: keys derived from the wallet's signature over ed25519DerivationMessage
//   recipient = Mode B: one seed for both the Solana signer and the ShieldedKeypair
//
// env (scripts/.env or shell):
//   DEVNET_RPC_URL       https://devnet.helius-rpc.com/?api-key=...   (required by the Ring indexer/prover)
//   SPR_INDEXER_URL      optional override; default: the Helius RPC host's /v1/spr gateway
//   SPR_PROVER_URL       optional override; default: the Helius RPC host's /v1/spr gateway
//   HELIUS_API_KEY       Ring indexer/prover key; defaults to the api-key in DEVNET_RPC_URL
// keys: .secrets/devnet-payer.json, .secrets/devnet-recipient.json (solana-keygen format, gitignored)
// Logs never print key material or signatures used as seeds.
import { readFileSync } from "node:fs";
import {
  createKeyPairFromBytes,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  signBytes,
  signTransactionWithSigners,
  type Address,
  type KeyPairSigner,
  type Transaction,
  type TransactionSigner,
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
  getPrivateTokenBalances,
  getPrivateTransactions,
  syncWallet,
  type Bytes32,
} from "@heliuslabs/spr";
import { SignedTeePolicy } from "@heliuslabs/spr/client";
import { ed25519DerivationMessage } from "@heliuslabs/spr/keypair";
import { apiKeyFromUrl, keyedServiceConfig } from "../../apps/web/lib/ring/api-key.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const RPC: string = process.env.DEVNET_RPC_URL ?? "";
if (!RPC) throw new Error("DEVNET_RPC_URL is required (Helius devnet RPC with api-key)");
if (/mainnet/.test(RPC)) throw new Error("refusing to run against mainnet");
const INDEXER = process.env.SPR_INDEXER_URL || undefined;
const PROVER = process.env.SPR_PROVER_URL || undefined;

const root = new URL("../../", import.meta.url);
const readKey = (name: string) => Uint8Array.from(JSON.parse(readFileSync(new URL(`.secrets/${name}`, root), "utf8")) as number[]);
const step = (s: string) => console.log(`\n▶ ${s}`);
const t0 = Date.now();
const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

async function main() {
  const client = await createSprClient({
    solanaRpcUrl: RPC,
    ...keyedServiceConfig({ indexerUrl: INDEXER, proverUrl: PROVER, apiKey: process.env.HELIUS_API_KEY || apiKeyFromUrl(RPC) }),
    proverTee: SignedTeePolicy.forNetwork("devnet"),
  });

  step("prover readiness");
  const att = await client.attestProver();
  console.log("attested prover:", Object.keys(att as object).join(","));
  const pk = await client.checkProverProvingKeys();
  console.log("proving keys report ok:", JSON.stringify(pk, (_, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 200));

  // --- payer: Mode A (derivation signature) -----------------------------------------
  const payerBytes = readKey("devnet-payer.json");
  const payerSigner = await createKeyPairSignerFromBytes(payerBytes);
  const payerKp = await createKeyPairFromBytes(payerBytes);
  const pubBytes = getAddressEncoder().encode(payerSigner.address) as Bytes32;
  const derivationMessage = ed25519DerivationMessage(pubBytes as Bytes32);
  const sigA = new Uint8Array(await signBytes(payerKp.privateKey, derivationMessage));
  const sigB = new Uint8Array(await signBytes(payerKp.privateKey, derivationMessage));
  console.log("determinism check:", sigA.every((b, i) => b === sigB[i]) ? "stable" : "UNSTABLE");
  sigB.fill(0);
  const payerKeys = LocalKeys.fromDerivationSeed({ solanaPublicKey: payerSigner.address, derivationSeed: sigA }, client.proofService);
  sigA.fill(0);
  const payerWallet = new Wallet({ identity: payerKeys.address() });

  // --- recipient: Mode B (one seed) --------------------------------------------------
  const recBytes = readKey("devnet-recipient.json");
  const recSeed = recBytes.slice(0, 32) as Bytes32;
  const recSigner = await createKeyPairSignerFromPrivateKeyBytes(recSeed.slice() as Bytes32);
  const recKeypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(recSeed));
  const recKeys = LocalKeys.fromKeypair(recKeypair, client.proofService);
  const recWallet = new Wallet({ identity: recKeypair.shieldedAddress() });
  console.log("payer", payerSigner.address, "recipient", recSigner.address);

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc: client.solanaRpc, rpcSubscriptions: client.solanaRpcSubscriptions });
  const submit = async (tx: Transaction, signers: readonly TransactionSigner[]) => {
    const signed = await signTransactionWithSigners(signers as KeyPairSigner[], tx);
    await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: "confirmed" });
    const sig = getSignatureFromTransaction(signed);
    const slot = await client.confirmTransaction(sig);
    console.log(`  tx ${sig} slot ${slot} (${ms()})`);
    return slot;
  };

  step("initial sync");
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys });
  await syncWallet({ client, wallet: recWallet, keys: recKeys });

  step("register both (idempotent)");
  for (const [who, owner, addr, signer] of [
    ["payer", payerSigner.address, payerKeys.address(), payerSigner],
    ["recipient", recSigner.address, recKeypair.shieldedAddress(), recSigner],
  ] as const) {
    const reg = await buildRegistrationTransaction({ client, owner, address: addr });
    if (reg) await submit(reg, [signer]);
    else console.log(`  ${who} already registered`);
  }

  step("deposit 0.05 SOL");
  let slot = await submit(
    await buildDepositTransaction({ client, feePayer: payerSigner.address, recipient: payerKeys.address(), amount: 50_000_000n }),
    [payerSigner],
  );
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys, config: { requireSlot: slot } });

  step("create devnet SPL mint + deposit 1000 tokens (interface auto-created on first deposit)");
  const conn = new Connection(RPC, "confirmed");
  const payerWeb3 = Keypair.fromSecretKey(payerBytes);
  const mint = await createMint(conn, payerWeb3, payerWeb3.publicKey, null, 6);
  const ata = await getOrCreateAssociatedTokenAccount(conn, payerWeb3, mint, payerWeb3.publicKey);
  await mintTo(conn, payerWeb3, mint, ata.address, payerWeb3, 5_000_000_000n);
  slot = await submit(
    await buildDepositTransaction({
      client,
      feePayer: payerSigner.address,
      recipient: payerKeys.address(),
      asset: mint.toBase58() as Address,
      splTokenAccount: ata.address.toBase58() as Address,
      amount: 1_000_000_000n,
    }),
    [payerSigner],
  );
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys, config: { requireSlot: slot } });
  console.log("  payer balances:", getPrivateTokenBalances(payerWallet).map((b) => `${b.mint.slice(0, 6)}…=${b.amount}`).join(", "));

  step("private transfer 250 tokens payer -> recipient");
  slot = await submit(
    await buildTransferTransaction({
      client, wallet: payerWallet, keys: payerKeys, feePayer: payerSigner.address,
      recipient: recSigner.address, asset: mint.toBase58() as Address, amount: 250_000_000n,
    }),
    [payerSigner],
  );
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys, config: { requireSlot: slot } });
  await syncWallet({ client, wallet: recWallet, keys: recKeys, config: { requireSlot: slot } });
  console.log("  recipient sees:", getPrivateTokenBalances(recWallet).map((b) => `${b.mint.slice(0, 6)}…=${b.amount}`).join(", "));

  step("withdraw 0.01 SOL to payer's public address");
  slot = await submit(
    await buildWithdrawalTransaction({
      client, wallet: payerWallet, keys: payerKeys, feePayer: payerSigner.address,
      recipient: payerSigner.address, amount: 10_000_000n,
    }),
    [payerSigner],
  );
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys, config: { requireSlot: slot } });

  step("final state");
  console.log("  payer SOL private:", payerWallet.balance(SOL_MINT).amount.toString());
  console.log("  payer history kinds:", getPrivateTransactions(payerWallet).map((t) => `${t.kind}/${t.direction}`).join(", "));
  console.log("  recipient history:", getPrivateTransactions(recWallet).map((t) => `${t.kind}/${t.direction}`).join(", "));
  payerKeys.destroy(); recKeys.destroy(); recKeypair.destroy();
  console.log(`\nOK in ${ms()} — mint ${new PublicKey(mint).toBase58()}`);
}

main().catch((e) => { if (process.env.DEBUG) console.error(e);
  console.error("FAILED:", (e as { code?: string }).code ?? "", (e as Error).message);
  process.exit(1);
});
