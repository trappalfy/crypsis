// One snapshot pass (same as the cron's last step). usage: DATABASE_URL=... tsx scripts/snapshot.ts
import { closeDb, getDb } from "@crypsis/db";
import { makeRpc } from "../lib/indexer/rpc";
import { takeSnapshots } from "../lib/indexer/sync";
const rpcUrl = process.env.MAINNET_RPC_URL ?? (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "https://api.mainnet-beta.solana.com");
console.log("snapshots", await takeSnapshots(getDb(), makeRpc(rpcUrl)));
await closeDb();
