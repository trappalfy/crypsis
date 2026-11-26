import { eq } from "drizzle-orm";
import sharp from "sharp";
import { coins, getDb } from "@crypsis/db";
import { sniffImage } from "@/lib/server/image-type";
import { fetchRemote } from "@/lib/server/remote-media";

// GET /api/coin-image/[mint] — the coin's icon, fetched server-side from IPFS (several gateways) or its https
// host, re-encoded as a 128×128 WebP (first frame for GIFs). Served from our origin: CSP img-src stays 'self',
// visitors' IPs never reach third-party hosts, and the CDN keeps each icon for a year.
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const SIZE = 128;

const missing = () => new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300, s-maxage=900" } });

export async function GET(_req: Request, ctx: RouteContext<"/api/coin-image/[mint]">) {
  const { mint } = await ctx.params;
  if (!ADDR.test(mint) || !process.env.DATABASE_URL) return missing();
  let src: string | null = null;
  try {
    const [row] = await getDb().select({ imageUri: coins.imageUri }).from(coins).where(eq(coins.mint, mint)).limit(1);
    src = row?.imageUri ?? null;
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!src) return missing();
  const bytes = await fetchRemote(src, { maxBytes: MAX_SOURCE_BYTES, timeoutMs: 6000 });
  if (!bytes || !sniffImage(bytes)) return missing();
  try {
    const icon = await sharp(bytes, { animated: false, limitInputPixels: 50_000_000 }).resize(SIZE, SIZE, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
    return new Response(new Uint8Array(icon), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return missing();
  }
}
