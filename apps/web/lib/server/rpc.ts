import "server-only";

// Server-side RPC. The Helius key lives only in server env (never NEXT_PUBLIC_*).
export function serverRpcUrl(network: "mainnet" | "devnet" = "mainnet"): string {
  const key = process.env.HELIUS_API_KEY;
  if (key) return `https://${network}.helius-rpc.com/?api-key=${key}`;
  return network === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com";
}

/** Minimal JSON-RPC call with timeout; never logs the URL (it carries the key). */
export async function rpcCall<T>(method: string, params: unknown[] = [], network: "mainnet" | "devnet" = "mainnet", timeoutMs = 8000): Promise<T> {
  const res = await fetch(serverRpcUrl(network), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rpc ${method} http ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(`rpc ${method}: ${j.error.message ?? "error"}`);
  return j.result as T;
}
