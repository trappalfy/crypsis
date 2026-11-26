// Brief §2.5/§13: mainnet READ-ONLY simulation of the launch transactions. Never signs with a real key,
// never sends. simulateTransaction with sigVerify:false + replaceRecentBlockhash.
// usage: tsx scripts/launch-simulate.ts [--user <funded mainnet address>] [--existing <create_v2 mint without a Ring vault>]
import { Connection, PublicKey, SystemProgram, type VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { buildLaunch, NAME_MAX, ringReadyInstructions, SYMBOL_MAX, toV0 } from "../lib/pump/launch";

const RPC = process.env.MAINNET_RPC_URL || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "https://api.mainnet-beta.solana.com");
const conn = new Connection(RPC, "confirmed");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const URI = "https://ipfs.io/ipfs/bafkreibd6f6szmppui7vt72xz3s4nn4av3w7x3cez4btq5abnofgkef6ee";

// The fee payer must be a system-owned account with SOL. pump.fun's fee recipients moved under its fee program
// (2026-11), so they can no longer pay fees: take the first candidate that still can.
async function fundedPayer(candidates: (PublicKey | string | undefined)[]): Promise<PublicKey> {
  for (const c of candidates) {
    if (!c) continue;
    const key = new PublicKey(c);
    const info = await conn.getAccountInfo(key);
    if (info && info.owner.equals(SystemProgram.programId) && info.lamports >= 50_000_000) return key;
  }
  throw new Error("no funded system account among the candidates — pass --user <funded mainnet address>");
}

async function main() {
  const global = await new OnlinePumpSdk(conn).fetchGlobal();
  const user = await fundedPayer([arg("--user"), global.authority, global.feeRecipient, ...(global.feeRecipients ?? [])]);
  console.log("simulated creator:", user.toBase58());
  let ok = true;
  const sim = async (label: string, tx: VersionedTransaction) => {
    const r = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    console.log(`## ${label}: ${r.value.err ? "FAIL " + JSON.stringify(r.value.err) : "OK"} — ${r.value.unitsConsumed} CU, ${tx.serialize().length} bytes`);
    if (r.value.err) { console.log((r.value.logs ?? []).slice(-12).join("\n")); ok = false; }
  };
  for (const [label, name, symbol, buy] of [
    ["no dev buy", "Simulation Only", "SIM", 0n],
    ["0.01 SOL dev buy", "Simulation Only", "SIM", 10_000_000n],
    ["0.01 SOL dev buy, max-length name/ticker", "N".repeat(NAME_MAX), "S".repeat(SYMBOL_MAX), 10_000_000n],
  ] as const) {
    const b = await buildLaunch({ connection: conn, user, name, symbol, uri: URI, devBuyLamports: buy, ringReady: true });
    console.log(`\n# ${label}: ${b.txs.map((t) => t.label).join(" -> ")}${b.buySplit ? " (dev buy split)" : ""}; tokens ${b.expectedTokens}; Ring rent ${b.ringRentLamports / 1e9} SOL`);
    for (const t of b.txs.filter((x) => x.label !== "ringReady" && x.label !== "buy")) await sim(`Tx1 ${t.label}`, t.tx);
  }
  // Tx2 needs an existing mint: prove createSplInterface + memo on a live create_v2 coin that isn't Ring-ready
  const existing = arg("--existing");
  if (existing) await sim("Tx2 createSplInterface + memo on " + existing, await toV0(conn, user, await ringReadyInstructions(user, new PublicKey(existing))));
  else console.log("\n(pass --existing <mint> to simulate Tx2 on a live create_v2 coin)");
  console.log(ok ? "\nALL SIMULATIONS PASSED" : "\nSIMULATION FAILURES — see above");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
