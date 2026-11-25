// Helius gates the Ring indexer and prover behind an API key. Normally the SDK reaches both through the
// `/v1/spr` gateway of the Helius RPC URL, which already carries the key; this module keys explicit overrides.
// The SDK takes the indexer key as `apiKey` (or `?api-key=` in its URL, never both) and the prover
// key only from `?api-key=` in its URL. The browser key is public by design (domain-restricted).

export function apiKeyFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get("api-key") || undefined;
  } catch {
    return undefined;
  }
}

export interface ServiceConfig {
  indexerUrl?: string;
  proverUrl?: string;
  apiKey?: string;
}

export function keyedServiceConfig(e: ServiceConfig): ServiceConfig {
  const key = e.apiKey;
  const out: ServiceConfig = {};
  // No URL given: the SDK derives `<helius rpc>/v1/spr?api-key=…` itself, and a second key source is an error.
  if (e.indexerUrl) {
    out.indexerUrl = e.indexerUrl;
    if (key && !apiKeyFromUrl(e.indexerUrl)) out.apiKey = key;
  }
  if (e.proverUrl) {
    if (key && !apiKeyFromUrl(e.proverUrl)) {
      const u = new URL(e.proverUrl);
      u.searchParams.set("api-key", key);
      out.proverUrl = u.toString();
    } else {
      out.proverUrl = e.proverUrl;
    }
  }
  return out;
}
