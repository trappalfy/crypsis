import { SITE } from "@/lib/site";
import type { RingEndpoints } from "./protocol";
import { apiKeyFromUrl } from "./api-key";

// Browser-side endpoints. NEXT_PUBLIC_HELIUS_RPC_URL must be a domain-restricted key (brief §3, R9).
// With a Helius RPC root URL the SDK serves the Ring indexer and prover from its `/v1/spr` gateway on the
// same host and key (verified on mainnet and devnet 2026-11-25). The CloudFront hosts from the SDK README
// answer 403 to keyed requests, so explicit indexer/prover URLs are only an override.
const PUBLIC_RPC = { mainnet: "https://api.mainnet-beta.solana.com", devnet: "https://api.devnet.solana.com" } as const;

export function ringEndpoints(): RingEndpoints {
  const n = SITE.network;
  const indexerUrl = process.env.NEXT_PUBLIC_SPR_INDEXER_URL || undefined;
  const proverUrl = process.env.NEXT_PUBLIC_SPR_PROVER_URL || undefined;
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || apiKeyFromUrl(process.env.NEXT_PUBLIC_HELIUS_RPC_URL);
  return {
    network: n,
    rpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL || PUBLIC_RPC[n],
    ...(indexerUrl ? { indexerUrl } : {}),
    ...(proverUrl ? { proverUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}
