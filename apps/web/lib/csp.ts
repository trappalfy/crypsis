// Content-Security-Policy (brief §10). connect-src: only Solana RPC/WS, the Ring indexer + prover (+ its TEE
// policy host) and our own API. img-src: self, data/blob, one IPFS gateway. No third-party scripts anywhere.
const host = (u?: string) => { try { return u ? new URL(u).origin : null; } catch { return null; } };
const wsOf = (u?: string) => { const h = host(u); return h ? h.replace(/^http/, "ws") : null; };

export function connectSources(): string[] {
  const env = process.env;
  const list = [
    "'self'",
    host(env.NEXT_PUBLIC_HELIUS_RPC_URL), wsOf(env.NEXT_PUBLIC_HELIUS_RPC_URL), host(env.NEXT_PUBLIC_HELIUS_WS_URL),
    host(env.NEXT_PUBLIC_SPR_INDEXER_URL), host(env.NEXT_PUBLIC_SPR_PROVER_URL),
    // defaults used when the env is empty (lib/ring/endpoints.ts); the Ring indexer and prover live on the
    // Helius RPC host (`/v1/spr`), so they are covered by the RPC origin above
    "https://api.devnet.solana.com", "wss://api.devnet.solana.com", "https://api.mainnet-beta.solana.com", "wss://api.mainnet-beta.solana.com",
    "https://d3gbdb0egjwcw9.cloudfront.net", // signed TEE policy for the prover (@heliuslabs/spr SignedTeePolicy)
  ];
  return [...new Set(list.filter(Boolean) as string[])];
}

export function buildCsp(opts: { nonce?: string; dev?: boolean }): string {
  const { nonce, dev = false } = opts;
  const script = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`
    : `'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`; // static pages: Next's inline RSC payload, no third-party scripts
  const ipfs = process.env.IPFS_GATEWAY ? host(process.env.IPFS_GATEWAY) : "https://ipfs.io";
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${ipfs}`,
    "font-src 'self'",
    `connect-src ${connectSources().join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Policy delivered with JS chunks; applies to Web Workers created from them (the Ring worker). */
export function buildWorkerCsp(): string {
  return ["default-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", `connect-src ${connectSources().join(" ")}`, "worker-src 'self'"].join("; ");
}

export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];
