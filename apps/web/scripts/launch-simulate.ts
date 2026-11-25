// Brief §2.5/§13: mainnet READ-ONLY simulation of the launch transactions. Never signs with a real key,
// never sends. simulateTransaction with sigVerify:false + replaceRecentBlockhash.
// usage: tsx scripts/launch-simulate.ts [--user <funded mainnet address>] [--existing <create_v2 mint without a Ring vault>]
import { Connection, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { buildLaunch, NAME_MAX, ringReadyInstructions, SYMBOL_MAX, toV0 } from "../lib/pump/launch";

const RPC = process.env.MAINNET_RPC_URL || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "https://api.mainnet-beta.solana.com");
const conn = new Connection(RPC, "confirmed");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const URI = "https://ipfs.io/ipfs/bafkreibd6f6szmppui7vt72xz3s4nn4av3w7x3cez4btq5abnofgkef6ee";

async function main() {
  const global = await new OnlinePumpSdk(conn).fetchGlobal();
  const user = new PublicKey(arg("--user") ?? global.feeRecipient.toBase58()); // any funded system account
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
