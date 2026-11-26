// Server-side fetching of coin metadata and images (tracker icons).
// Coin metadata lives on IPFS or on arbitrary https hosts. Public gateways throttle hard (ipfs.io and dweb.link
// answered 429 to every request on 2026-11-26), so IPFS content is tried through several gateways in turn.
// Images are then served from our own origin (/api/coin-image/[mint]): CSP img-src stays 'self' and visitors'
// IPs never reach third-party hosts. URLs come from onchain metadata, i.e. from anyone: only public https hosts
// are fetched, redirects are followed by hand and re-checked, bodies are size-capped.
import { sniffImage } from "./image-type";

export const DEFAULT_GATEWAYS = [
  "https://ipfs.filebase.io/ipfs/",
  "https://pump.mypinata.cloud/ipfs/",
  "https://4everland.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
];

export function gateways(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.IPFS_GATEWAYS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (list.length ? list : DEFAULT_GATEWAYS).map((g) => (g.endsWith("/") ? g : `${g}/`));
}

const IPFS_PATH = /^\/ipfs\/([A-Za-z0-9]+)(\/[^?#]*)?/;

/** "CID/path" for any IPFS form (ipfs://…, https://<gateway>/ipfs/…), else null. */
function ipfsPath(uri: string): string | null {
  const m = uri.match(/^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]+)(\/[^?#]*)?/);
  if (m) return m[1] + (m[2] ?? "");
  try {
    const p = new URL(uri).pathname.match(IPFS_PATH);
    return p ? p[1] + (p[2] ?? "") : null;
  } catch {
    return null;
  }
}

function privateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Only https on the default port, to a host that isn't local, private or an IPv6 literal. */
export function isPublicHttps(u: URL): boolean {
  if (u.protocol !== "https:" || (u.port && u.port !== "443") || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h || h.startsWith("[") || h.includes(":")) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
  return !privateIpv4(h);
}

/** The stable form we store: ipfs://CID/path, or a public https URL. Anything else → null. */
export function canonicalSource(uri: string | null | undefined): string | null {
  const s = (uri ?? "").trim();
  if (!s) return null;
  const p = ipfsPath(s);
  if (p) return `ipfs://${p}`;
  try {
    const u = new URL(s);
    return isPublicHttps(u) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** URLs to try, in order: every gateway for IPFS content, the URL itself otherwise. */
export function candidateUrls(src: string, gws: string[] = gateways()): string[] {
  const c = canonicalSource(src);
  if (!c) return [];
  return c.startsWith("ipfs://") ? gws.map((g) => g + c.slice("ipfs://".length)) : [c];
}

export interface FetchRemoteOptions {
  maxBytes: number;
  timeoutMs: number;
  fetch?: typeof fetch;
  gateways?: string[];
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) { await res.body?.cancel().catch(() => {}); return null; }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

async function fetchOne(url: string, o: FetchRemoteOptions): Promise<Uint8Array | null> {
  const f = o.fetch ?? fetch;
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    let u: URL;
    try { u = new URL(current); } catch { return null; }
    if (!isPublicHttps(u)) return null;
    const res = await f(u.toString(), { redirect: "manual", signal: AbortSignal.timeout(o.timeoutMs), headers: { accept: "*/*" } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) return null;
      current = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) { await res.body?.cancel().catch(() => {}); return null; }
    return readCapped(res, o.maxBytes);
  }
  return null;
}

/** Bytes of the first source that answers, or null. Never throws. */
export async function fetchRemote(src: string, o: FetchRemoteOptions): Promise<Uint8Array | null> {
  for (const url of candidateUrls(src, o.gateways ?? gateways())) {
    try {
      const b = await fetchOne(url, o);
      if (b) return b;
    } catch {
      // timeout, DNS, TLS: try the next source
    }
  }
  return null;
}

/** Resolve a coin's metadata URI to the canonical source of its image. */
export async function metadataImage(uri: string | null | undefined, o: Partial<FetchRemoteOptions>): Promise<string | null> {
  if (!uri) return null;
  const bytes = await fetchRemote(uri, { maxBytes: 256 * 1024, timeoutMs: 6000, ...o });
  if (!bytes) return null;
  if (sniffImage(bytes)) return canonicalSource(uri); // the "metadata" URI points straight at an image
  try {
    const j = JSON.parse(new TextDecoder().decode(bytes)) as { image?: unknown };
    return typeof j?.image === "string" ? canonicalSource(j.image) : null;
  } catch {
    return null;
  }
}
