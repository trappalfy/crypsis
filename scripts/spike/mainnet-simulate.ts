// Phase 0 / R3 — mainnet READ-ONLY checks. Never signs, never sends.
// Only RPC reads and simulateTransaction with sigVerify:false.
// usage: pnpm --filter @crypsis/scripts spike:simulate   (MAINNET_RPC_URL optional)
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Transaction,
} from "@solana/kit";
import {
  createSprClient,
  buildDepositTransaction,
  ShieldedKeypair,
  SHIELDED_POOL_PROGRAM_ID,
} from "@heliuslabs/spr";
import { getProtocolConfigAddress, getSplAssetRegistryAddress, getSplAssetVaultAddress } from "@heliuslabs/spr/addresses";
import { getCreateSplInterfaceInstructionAsync } from "@heliuslabs/spr/instructions";
import { decodeProtocolConfig, decodeShieldedPoolError, decodeSplAssetRegistry } from "@heliuslabs/spr/interface";
import { writeFileSync, mkdirSync } from "node:fs";

const RPC = process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const rpc = createSolanaRpc(RPC);
const out: Record<string, unknown> = { rpc: RPC.replace(/api-key=[^&]+/, "api-key=***"), at: new Date().toISOString() };
const log = (k: string, v: unknown) => {
  out[k] = v;
  console.log(`\n## ${k}\n`, typeof v === "string" ? v : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function accountOwner(a: string) {
  const r = await rpc.getAccountInfo(address(a), { encoding: "base64" }).send();
  return r.value ? { owner: r.value.owner as string, lamports: r.value.lamports, len: Buffer.from(r.value.data[0], "base64").length } : null;
}

async function simulate(tx: Transaction) {
  const b64 = getBase64EncodedWireTransaction(tx);
  try {
    const r = await rpc
      .simulateTransaction(b64, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" })
      .send();
    const err = r.value.err as unknown;
    let decoded: unknown = null;
    const custom = JSON.stringify(err ?? null).match(/"Custom":(\d+)/);
    if (custom) {
      try { decoded = decodeShieldedPoolError(Number(custom[1])); } catch { decoded = `custom ${custom[1]} (not a Ring error)`; }
    }
    return { err, decoded, unitsConsumed: r.value.unitsConsumed, logs: (r.value.logs ?? []).slice(-12) };
  } catch (e) {
    return { rpcError: String((e as Error).message ?? e).slice(0, 400) };
  }
}

async function main() {
  const client = await createSprClient({ solanaRpcUrl: RPC });

  // 1. Protocol config: is createSplInterface permissionless on mainnet?
  const cfgAddr = await getProtocolConfigAddress();
  const cfgAcc = await client.getAccount(cfgAddr);
  if (!cfgAcc) throw new Error("protocol config missing");
  const cfg = decodeProtocolConfig(cfgAcc.data) as unknown as Record<string, unknown>;
  log("protocolConfig", { address: cfgAddr, splInterfaceCreationIsPermissionless: cfg.splInterfaceCreationIsPermissionless, authority: cfg.authority });

  // 2. Ring-ready mints (asset registries), and what the vault PDA is
  let regs: readonly { mint: Address; assetId: bigint }[] = [];
  try {
    // same filters the SDK uses internally (not exported): dataSize 48 + discriminator 5 at offset 0
    const accs = await rpc
      .getProgramAccounts(SHIELDED_POOL_PROGRAM_ID, {
        encoding: "base64",
        filters: [{ dataSize: 48n }, { memcmp: { offset: 0n, encoding: "base58", bytes: "6" as never } }],
      })
      .send();
    regs = (accs as unknown as { account: { data: [string, string] } }[]).map((a) => decodeSplAssetRegistry(Buffer.from(a.account.data[0], "base64")));
    log("registries", { count: regs.length, sample: regs.slice(0, 10).map((r) => ({ mint: r.mint, assetId: r.assetId })) });
  } catch (e) {
    log("registries", { error: String((e as Error).message).slice(0, 300) });
  }
  const vaults = [];
  for (const r of regs.slice(0, 5)) {
    const vault = await getSplAssetVaultAddress(r.mint);
    const [v, m] = [await accountOwner(vault), await accountOwner(r.mint)];
    let tokenAmount: string | null = null;
    try { tokenAmount = (await rpc.getTokenAccountBalance(vault).send()).value.amount; } catch { /* not a token account */ }
    vaults.push({ mint: r.mint, mintProgram: m?.owner, vault, vaultOwner: v?.owner, vaultLen: v?.len, tokenAmount });
  }
  log("vaultShape", vaults);

  // 3. Find live pump.fun coins from recent pump program activity (raw JSON-RPC, gentle on public RPC)
  const raw = async (method: string, params: unknown[]) => {
    for (let i = 0; i < 4; i++) {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
      const j = (await r.json()) as { result?: any; error?: unknown };
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.result;
    }
    throw new Error("rate limited");
  };
  type Cand = { mint: string; program: string; holder: string; tokenAccount: string; amount: string; ringReady: boolean };
  const cands: Cand[] = [];
  let before: string | undefined;
  const PUMP_AMM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
  for (const [prog, pages] of [[PUMP, 3], [PUMP_AMM, 8]] as const) { before = undefined;
  for (let page = 0; page < pages && !(cands.some((c) => c.program === TOKEN22) && cands.some((c) => c.program === TOKEN)); page++) {
    const sigs = (await raw("getSignaturesForAddress", [prog, { limit: 40, ...(before ? { before } : {}) }])) as { signature: string; err: unknown }[];
    before = sigs.at(-1)?.signature;
    for (const s of sigs) {
      if (s.err) continue;
      if (cands.some((c) => c.program === TOKEN22) && cands.some((c) => c.program === TOKEN)) break;
      let tx: any;
      try { tx = await raw("getTransaction", [s.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]); } catch { continue; }
      if (!tx?.meta) continue;
      const keys = tx.transaction.message.accountKeys as { pubkey: string; signer: boolean }[];
      const payer = keys.find((k) => k.signer)?.pubkey;
      for (const b of tx.meta.postTokenBalances ?? []) {
        const mint = b.mint as string;
        if (!mint.endsWith("pump") || b.owner !== payer || BigInt(b.uiTokenAmount.amount) === 0n) continue;
        const program = b.programId as string;
        if (cands.some((c) => c.mint === mint || c.program === program)) continue;
        const reg = await client.getAccount(await getSplAssetRegistryAddress(address(mint)));
        cands.push({ mint, program, holder: payer!, tokenAccount: keys[b.accountIndex].pubkey, amount: b.uiTokenAmount.amount, ringReady: !!reg && reg.data.length > 0 });
      }
      await sleep(250);
    }
  }
  }
  log("pumpCandidates", cands);

  // 4. Simulate (a) createSplInterface alone (v0 tx), (b) SDK deposit (v1 tx) incl. interface creation
  const recipient = ShieldedKeypair.generate().shieldedAddress();
  const sims: Record<string, unknown> = {};
  for (const c of cands) {
    const label = c.program === TOKEN22 ? "token2022_create_v2" : "spl_legacy";
    const { value: bh } = await rpc.getLatestBlockhash().send();
    const ix = await getCreateSplInterfaceInstructionAsync({ authority: address(c.holder), mint: address(c.mint), tokenProgram: address(c.program) });
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(address(c.holder), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
      (m) => appendTransactionMessageInstruction(ix, m),
    );
    const ifaceSim = c.ringReady ? { skipped: "mint already Ring-ready" } : await simulate(compileTransaction(msg));
    let depSim: unknown;
    try {
      const dep = await buildDepositTransaction({
        client,
        feePayer: address(c.holder),
        recipient,
        asset: address(c.mint),
        splTokenAccount: address(c.tokenAccount),
        splTokenProgram: address(c.program),
        amount: 1n,
      });
      depSim = await simulate(dep);
    } catch (e) {
      depSim = { buildError: String((e as Error).message).slice(0, 400), code: (e as { code?: string }).code };
    }
    sims[label] = { mint: c.mint, createSplInterface: ifaceSim, depositV1: depSim };
  }
  log("simulations", sims);

  mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./out/mainnet-simulate.json", import.meta.url), JSON.stringify(out, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));
  console.log("\nsaved spike/out/mainnet-simulate.json");
}

main().catch((e) => { console.error("FAILED", e); process.exit(1); });
