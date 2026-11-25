// Saves public mainnet Ring transactions as test fixtures (read-only).
import { writeFileSync } from "node:fs";
const RPC = process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const out = new URL("../../apps/web/tests/fixtures/ring-txs/", import.meta.url);
const call = async (m, p) => { for (let i = 0; i < 5; i++) { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500)); continue; } return (await r.json()).result; } };
const vault = process.argv[2] ?? "2h38rUR31QTi7kX9wAhP4jx1Hbqkt6SmDncUiaD6eroD";
const sigs = await call("getSignaturesForAddress", [vault, { limit: 50 }]);
let n = 0;
for (const s of sigs.reverse()) {
  if (s.err) continue;
  const tx = await call("getTransaction", [s.signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
  writeFileSync(new URL(`${s.signature.slice(0, 16)}.json`, out), JSON.stringify(tx));
  const keys = tx.transaction.message.accountKeys;
  const tb = (arr) => (arr ?? []).map((b) => `${keys[b.accountIndex].slice(0, 6)}(${b.owner.slice(0, 6)}) ${b.uiTokenAmount.amount}`).join(" | ");
  console.log(s.signature.slice(0, 16), "\n  pre:", tb(tx.meta.preTokenBalances), "\n  post:", tb(tx.meta.postTokenBalances), "\n  logs:", tx.meta.logMessages.filter((l) => /Instruction|ring1/.test(l)).slice(0, 4).join(" ; "));
  if (++n >= 6) break;
  await new Promise((r) => setTimeout(r, 300));
}
