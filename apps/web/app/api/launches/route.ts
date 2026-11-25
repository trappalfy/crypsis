import { revalidateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { coins, getDb, launches } from "@crypsis/db";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { serverRpcUrl } from "@/lib/server/rpc";
import { makeRpc, getMultipleAccounts, getTransaction } from "@/lib/indexer/rpc";
import { accountKeysOf, parseRingTransaction } from "@/lib/indexer/parse";
import { bondingCurveAddress, decodeBondingCurve, vaultAddress } from "@/lib/indexer/accounts";
import { PUMP_PROGRAM, TOKEN_2022_PROGRAM } from "@/lib/indexer/constants";
import { LAUNCH_MEMO } from "@/lib/pump/launch";

// POST /api/launches {mint, createSig, ringSig?} — record a launch made on crypsis.fun (mainnet only).
// Nothing is trusted from the client: both transactions are read from chain. "Launched on Crypsis" is set
// only when the Ring-ready transaction carries the Crypsis memo for this mint, signed by the coin's creator.
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/, ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(req: Request) {
  if (!rateLimit(`launch:${clientKey(req)}`, 20, 60 * 60 * 1000)) return Response.json({ error: "rate limited" }, { status: 429 });
  if (!process.env.DATABASE_URL) return Response.json({ recorded: false, reason: "no database" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { mint?: string; createSig?: string; ringSig?: string } | null;
  if (!b?.mint || !ADDR.test(b.mint) || !b.createSig || !SIG.test(b.createSig) || (b.ringSig && !SIG.test(b.ringSig))) return Response.json({ error: "bad request" }, { status: 400 });
  // the tracker is mainnet-only: a devnet deployment must never write launches into it
  if (process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "mainnet") return Response.json({ recorded: false, reason: "devnet" });
  const rpc = makeRpc(serverRpcUrl("mainnet"));

  // create: a successful create_v2 in which the mint itself signed (only the real launch can produce that)
  const create = await getTransaction(rpc, b.createSig);
  if (!create?.meta || create.meta.err) return Response.json({ error: "create transaction not found or failed" }, { status: 422 });
  const ck = accountKeysOf(create);
  const signers = ck.slice(0, create.transaction.message.header?.numRequiredSignatures ?? 1);
  const creator = ck[0];
  const logs = create.meta.logMessages ?? [];
  if (!signers.includes(b.mint) || !ck.includes(PUMP_PROGRAM) || !logs.some((l) => /Instruction: CreateV2/i.test(l))) return Response.json({ error: "not the create_v2 of this mint" }, { status: 422 });
  // creator must match the coin's bonding curve
  const [curve] = await getMultipleAccounts(rpc, [bondingCurveAddress(b.mint)]);
  const decoded = curve && curve.owner === PUMP_PROGRAM ? decodeBondingCurve(curve.data) : null;
  if (!decoded || decoded.creator !== creator) return Response.json({ error: "creator mismatch" }, { status: 422 });

  // "Launched on Crypsis": the creator's Ring-ready transaction actually created this mint's vault and carries our memo
  let viaCrypsis = false;
  if (b.ringSig) {
    const ring = await getTransaction(rpc, b.ringSig);
    const memo = `${LAUNCH_MEMO} ${b.mint}`;
    viaCrypsis = !!ring?.meta && !ring.meta.err && accountKeysOf(ring)[0] === creator
      && (ring.meta.logMessages ?? []).some((l) => l.includes(memo))
      && parseRingTransaction(ring).some((e) => e.kind === "interface_created" && e.mint === b.mint);
  }

  const db = getDb();
  await db.insert(launches).values({ mint: b.mint, creator, createSig: b.createSig, interfaceSig: viaCrypsis ? b.ringSig! : null })
    .onConflictDoUpdate({ target: launches.mint, set: { interfaceSig: sql`coalesce(${launches.interfaceSig}, excluded.interface_sig)` } });
  if (viaCrypsis) {
    await db.insert(coins).values({ mint: b.mint, tokenProgram: TOKEN_2022_PROGRAM, decimals: 6, vault: vaultAddress(b.mint), isPump: true, launchedViaCrypsis: true, creator, createdAt: create.blockTime ? new Date(create.blockTime * 1000) : null })
      .onConflictDoUpdate({ target: coins.mint, set: { launchedViaCrypsis: true, creator: sql`coalesce(${coins.creator}, excluded.creator)` } });
    revalidateTag("tracker", "max");
  }
  return Response.json({ recorded: true, launchedViaCrypsis: viaCrypsis });
}
