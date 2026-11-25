// Full private cycle on MAINNET with two dedicated test keys (never the owner's own wallets).
// Runs only with an explicit `--send` after the owner's "yes" in chat (brief: no mainnet tx without it).
// Without `--send` it is a dry run: builds the first transaction and simulates it (sigVerify: false).
//
//   payer     = Mode A: Ring keys derived from the key's signature over ed25519DerivationMessage
//   recipient = Mode B exactly as the app does it for Phantom / MetaMask: the wallet key signs the plain-text
//               vault message, HKDF -> vault seed -> vault Solana signer + ShieldedKeypair
//
// Cycle (SOL only): register payer -> register recipient vault (sponsored) -> deposit 0.01 SOL ->
// private transfer 0.004 SOL -> recipient sees it -> recipient withdraws to payer (sponsored) ->
// payer withdraws the rest. Then: privacy check of the transfer transaction and a cost report.
//
// Safety: aborts before any send if the payer can't cover the plan, and after any step if the net spend
// (everything not recoverable: rent, fees) passes MAX_NET_SPEND.
//
// env: HELIUS_API_KEY (server key; falls back to .secrets/owner-keys.env HELIUS_SERVER_KEY)
// keys: .secrets/mainnet-test-payer.json, .secrets/mainnet-test-recipient-wallet.json (gitignored)
// Logs never print key material, seeds, or the API key.
import { readFileSync } from "node:fs";
import {
  createKeyPairFromBytes,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
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
  getPrivateTransactions,
  syncWallet,
  type Bytes32,
} from "@heliuslabs/spr";
import { SignedTeePolicy } from "@heliuslabs/spr/client";
import { ed25519DerivationMessage } from "@heliuslabs/spr/keypair";
import { vaultMessage } from "../../apps/web/lib/ring/derivation.js";
import { vaultSeedFromSignature } from "../../apps/web/lib/ring/snapshot-key.js";

const SEND = process.argv.includes("--send");
const LAMPORTS = 1_000_000_000n;
const DEPOSIT = 10_000_000n; // 0.01 SOL, comes back at the end
const TRANSFER = 4_000_000n; // 0.004 SOL, comes back at the end
const PRIORITY_FEE = 20_000n; // per transaction (v1 carries it in the message)
const MAX_NET_SPEND = 15_000_000n; // 0.015 SOL hard stop for rent + fees
const NEEDED = 25_000_000n; // the payer must hold this before anything is sent

const root = new URL("../../", import.meta.url);
const ownerKeys = (() => {
  try {
    return Object.fromEntries(readFileSync(new URL(".secrets/owner-keys.env", root), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  } catch { return {} as Record<string, string>; }
})();
const KEY = process.env.HELIUS_API_KEY || ownerKeys.HELIUS_SERVER_KEY;
if (!KEY) throw new Error("HELIUS_API_KEY (server key) is required");
const RPC = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const redact = (s: string) => s.split(KEY).join("***");
const readKey = (name: string) => Uint8Array.from(JSON.parse(readFileSync(new URL(`.secrets/${name}`, root), "utf8")) as number[]);
const sol = (l: bigint) => `${Number(l) / 1e9} SOL`;
const step = (s: string) => console.log(`\n▶ ${s}`);
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
const signatures: { what: string; sig: string }[] = [];

async function main() {
  const client = await createSprClient({ solanaRpcUrl: RPC, proverTee: SignedTeePolicy.forNetwork("mainnet"), priorityFeeLamports: PRIORITY_FEE });
  const rpc = client.solanaRpc;
  const balance = async (a: Address) => BigInt((await rpc.getBalance(a, { commitment: "confirmed" }).send()).value);

  // --- payer: Mode A ---------------------------------------------------------------------
  const payerBytes = readKey("mainnet-test-payer.json");
  const payer = await createKeyPairSignerFromBytes(payerBytes);
  const payerKp = await createKeyPairFromBytes(payerBytes);
  const derivation = ed25519DerivationMessage(getAddressEncoder().encode(payer.address) as Bytes32);
  const sigA = new Uint8Array(await signBytes(payerKp.privateKey, derivation));
  const payerKeys = LocalKeys.fromDerivationSeed({ solanaPublicKey: payer.address, derivationSeed: sigA }, client.proofService);
  sigA.fill(0);
  const payerWallet = new Wallet({ identity: payerKeys.address() });

  // --- recipient: Mode B, the app's exact derivation ----------------------------------------
  const recWalletKp = await createKeyPairFromBytes(readKey("mainnet-test-recipient-wallet.json"));
  const vaultSig = new Uint8Array(await signBytes(recWalletKp.privateKey, vaultMessage()));
  const vaultSeed = await vaultSeedFromSignature(vaultSig);
  vaultSig.fill(0);
  const vault = await createKeyPairSignerFromPrivateKeyBytes(vaultSeed.slice() as Bytes32);
  const recKeypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(vaultSeed as Bytes32));
  vaultSeed.fill(0);
  const recKeys = LocalKeys.fromKeypair(recKeypair, client.proofService);
  const recWallet = new Wallet({ identity: recKeypair.shieldedAddress() });

  console.log(`mode: ${SEND ? "SEND (real mainnet transactions)" : "dry run (nothing is sent)"}`);
  console.log("payer (Mode A)        ", payer.address);
  console.log("recipient vault (Mode B)", vault.address);

  step("preflight");
  const att = await client.attestProver();
  console.log("  prover attested:", Object.keys(att as object).length > 0 ? "yes" : "no");
  const p0 = await balance(payer.address);
  const v0 = await balance(vault.address);
  console.log(`  payer public balance: ${sol(p0)}; plan needs ${sol(NEEDED)}; hard stop at net spend ${sol(MAX_NET_SPEND)}`);

  if (!SEND) {
    step("dry run: build + simulate the payer's registration (sigVerify: false)");
    const reg = await buildRegistrationTransaction({ client, owner: payer.address, address: payerKeys.address() });
    if (!reg) { console.log("  payer already registered"); }
    else {
      const wire = getBase64EncodedWireTransaction(reg);
      const sim = await rpc.simulateTransaction(wire, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" }).send();
      console.log("  built:", wire.length, "base64 chars; simulation:", sim.value.err ? `error ${JSON.stringify(sim.value.err)}` : "OK", `(${sim.value.unitsConsumed ?? "?"} CU)`);
      if (sim.value.err && p0 === 0n) console.log("  (expected while the payer holds no SOL)");
    }
    console.log("\nDry run done. Nothing was sent. Re-run with --send after the owner's explicit yes.");
    return;
  }
  if (p0 < NEEDED) throw new Error(`payer holds ${sol(p0)}, needs ${sol(NEEDED)} — nothing sent`);

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc: client.solanaRpc, rpcSubscriptions: client.solanaRpcSubscriptions });
  const privateSol = (w: Wallet) => w.balance(SOL_MINT).amount;
  const netSpend = async () => p0 + v0 - (await balance(payer.address)) - (await balance(vault.address)) - privateSol(payerWallet) - privateSol(recWallet);
  const guard = async () => {
    const spent = await netSpend();
    console.log(`  net spend so far: ${sol(spent)}`);
    if (spent > MAX_NET_SPEND) throw new Error(`net spend ${sol(spent)} passed the hard stop ${sol(MAX_NET_SPEND)} — stopped`);
  };
  const submit = async (what: string, tx: Transaction, signers: readonly TransactionSigner[]) => {
    const signed = await signTransactionWithSigners(signers as KeyPairSigner[], tx);
    await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: "confirmed" });
    const sig = getSignatureFromTransaction(signed);
    const slot = await client.confirmTransaction(sig);
    signatures.push({ what, sig });
    console.log(`  ✓ ${what}: https://solscan.io/tx/${sig} (${secs()})`);
    return slot;
  };

  step("initial sync");
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys });
  await syncWallet({ client, wallet: recWallet, keys: recKeys });

  step("register payer (Mode A) and recipient vault (Mode B, rent paid by the payer)");
  const regP = await buildRegistrationTransaction({ client, owner: payer.address, address: payerKeys.address() });
  if (regP) await submit("register payer", regP, [payer]); else console.log("  payer already registered");
  const regR = await buildRegistrationTransaction({ client, owner: vault.address, address: recKeypair.shieldedAddress(), payer: payer.address });
  if (regR) await submit("register recipient vault", regR, [payer, vault]); else console.log("  recipient already registered");
  await guard();

  step(`deposit ${sol(DEPOSIT)} into the payer's private balance`);
  let slot = await submit("deposit", await buildDepositTransaction({ client, feePayer: payer.address, recipient: payerKeys.address(), amount: DEPOSIT }), [payer]);
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys, config: { requireSlot: slot } });
  console.log(`  payer private SOL: ${sol(privateSol(payerWallet))}`);
  await guard();

  step(`private transfer ${sol(TRANSFER)} payer -> recipient vault`);
  slot = await submit("private transfer", await buildTransferTransaction({ client, wallet: payerWallet, keys: payerKeys, feePayer: payer.address, recipient: vault.address, amount: TRANSFER }), [payer]);
  const transferSig = signatures[signatures.length - 1].sig;
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys, config: { requireSlot: slot } });
  await syncWallet({ client, wallet: recWallet, keys: recKeys, config: { requireSlot: slot } });
  console.log(`  recipient sees privately: ${sol(privateSol(recWallet))} (expected ${sol(TRANSFER)})`);
  if (privateSol(recWallet) !== TRANSFER) throw new Error("recipient balance does not match the transfer");
  await guard();

  step("privacy check: what the chain shows for the private transfer");
  const raw = await rpc.getTransaction(transferSig as Parameters<typeof rpc.getTransaction>[0], { maxSupportedTransactionVersion: 1 as never, encoding: "json", commitment: "confirmed" }).send();
  const meta = raw?.meta;
  const tokenMoves = (meta?.preTokenBalances?.length ?? 0) + (meta?.postTokenBalances?.length ?? 0);
  const lamportMoves = (meta?.preBalances ?? []).map((b, i) => BigInt(meta!.postBalances[i]) - BigInt(b)).filter((d) => d !== 0n);
  console.log(`  token balance entries: ${tokenMoves} (expected 0)`);
  console.log(`  lamport changes: ${lamportMoves.map(String).join(", ")} (only the fee payer's fee expected)`);
  console.log(`  transfer amount ${TRANSFER} visible in balances: ${lamportMoves.some((d) => d === TRANSFER || d === -TRANSFER) ? "YES — PROBLEM" : "no"}`);

  step(`recipient withdraws ${sol(TRANSFER)} to the payer's public address (fee paid by the payer)`);
  slot = await submit("recipient withdraw", await buildWithdrawalTransaction({ client, wallet: recWallet, keys: recKeys, feePayer: payer.address, recipient: payer.address, amount: TRANSFER }), [payer, vault]);
  await syncWallet({ client, wallet: recWallet, keys: recKeys, config: { requireSlot: slot } });
  await guard();

  const rest = privateSol(payerWallet);
  step(`payer withdraws the rest (${sol(rest)})`);
  slot = await submit("payer withdraw", await buildWithdrawalTransaction({ client, wallet: payerWallet, keys: payerKeys, feePayer: payer.address, recipient: payer.address, amount: rest }), [payer]);
  await syncWallet({ client, wallet: payerWallet, keys: payerKeys, config: { requireSlot: slot } });

  step("result");
  const spent = await netSpend();
  console.log(`  payer public: ${sol(await balance(payer.address))}; private left: payer ${sol(privateSol(payerWallet))}, recipient ${sol(privateSol(recWallet))}`);
  console.log(`  net cost of the whole cycle (rent + fees): ${sol(spent)}`);
  console.log("  payer history:", getPrivateTransactions(payerWallet).map((t) => `${t.kind}/${t.direction}`).join(", "));
  console.log("  recipient history:", getPrivateTransactions(recWallet).map((t) => `${t.kind}/${t.direction}`).join(", "));
  console.log(`\nOK in ${secs()}`);
  payerKeys.destroy(); recKeys.destroy(); recKeypair.destroy();
}

main().catch((e) => {
  if (process.env.DEBUG) console.error(e);
  console.error("\nFAILED:", redact(String((e as { code?: string }).code ?? "")), redact(String((e as Error).message)));
  if (signatures.length) console.error("sent so far:", signatures.map((s) => `${s.what} ${s.sig}`).join("; "));
  process.exit(1);
});
