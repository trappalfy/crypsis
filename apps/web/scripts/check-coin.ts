// Read-only: decode one coin's public accounts (debug helper). usage: tsx scripts/check-coin.ts <mint>
import { makeRpc, getMultipleAccounts } from "../lib/indexer/rpc";
import * as A from "../lib/indexer/accounts";
const rpc = makeRpc(process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com");
for (const mint of process.argv.slice(2)) {
  const [m] = await getMultipleAccounts(rpc, [mint]);
  const tokenProgram = m!.owner;
  const curve = A.bondingCurveAddress(mint), pool = A.pumpPoolAddress(mint);
  const addrs = [A.vaultAddress(mint), curve, A.ataOf(curve, mint, tokenProgram), A.ataOf(pool, mint, tokenProgram), A.metaplexMetadataAddress(mint), pool];
  const [vault, c, curveAta, poolAta, mpl, poolAcc] = await getMultipleAccounts(rpc, addrs);
  console.log({
    mint, tokenProgram, ...A.decodeMint(m!.data),
    meta2022: A.decodeToken2022Metadata(m!.data), metaplex: mpl ? A.decodeMetaplexMetadata(mpl.data) : null,
    vault: vault ? A.decodeTokenAmount(vault.data) : null,
    curve: c ? { owner: c.owner, ...A.decodeBondingCurve(c.data) } : null,
    curveAta: curveAta ? A.decodeTokenAmount(curveAta.data) : null,
    pool: poolAcc ? poolAcc.owner : null, poolAta: poolAta ? A.decodeTokenAmount(poolAta.data) : null,
  });
}
