import { sniffImage } from "@/lib/server/image-type";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { NAME_MAX, SYMBOL_MAX } from "@/lib/pump/launch";

// POST /api/ipfs — pump.fun-format metadata upload (brief §2.5, §3).
// Primary: Pinata (PINATA_JWT). The unofficial pump.fun/api/ipfs endpoint is dead as of 2026-11-24
// (phase-0 report, R7); it can be re-enabled with PUMP_IPFS_ENABLED=true if it comes back.
const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ≤ 4.5 MB bodies; pump.fun's own limit is [VERIFY]
const GATEWAY = "https://ipfs.io/ipfs/"; // short URIs keep create_v2 + buy inside 1232 bytes

const url = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return undefined;
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
};

async function pinata(jwt: string, file: Blob, filename: string, meta: Record<string, unknown>) {
  const pinFile = async (blob: Blob, name: string) => {
    const fd = new FormData();
    fd.append("file", blob, name);
    fd.append("pinataMetadata", JSON.stringify({ name }));
    const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", { method: "POST", headers: { authorization: `Bearer ${jwt}` }, body: fd, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`pinata ${r.status}`);
    return ((await r.json()) as { IpfsHash: string }).IpfsHash;
  };
  const imageCid = await pinFile(file, filename);
  const json = { ...meta, image: `${GATEWAY}${imageCid}` };
  const metaCid = await pinFile(new Blob([JSON.stringify(json)], { type: "application/json" }), "metadata.json");
  return { metadataUri: `${GATEWAY}${metaCid}`, imageUri: json.image };
}

export async function POST(req: Request) {
  if (!rateLimit(`ipfs:${clientKey(req)}`, 10, 60 * 60 * 1000)) return Response.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Expected multipart form data." }, { status: 400 }); }
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const symbol = String(form.get("symbol") ?? "").trim();
  const description = String(form.get("description") ?? "").trim().slice(0, 1000);
  const twitter = url(form.get("twitter")), telegram = url(form.get("telegram")), website = url(form.get("website"));
  if (!name || name.length > NAME_MAX) return Response.json({ error: `Name must be 1–${NAME_MAX} characters.` }, { status: 400 });
  if (!symbol || symbol.length > SYMBOL_MAX) return Response.json({ error: `Ticker must be 1–${SYMBOL_MAX} characters.` }, { status: 400 });
  if ([twitter, telegram, website].includes(null)) return Response.json({ error: "Links must be https URLs." }, { status: 400 });
  if (!(file instanceof Blob)) return Response.json({ error: "An image is required." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "The image must be 4 MB or smaller." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return Response.json({ error: "Use a PNG, JPG, GIF or WebP image." }, { status: 415 });

  // pump.fun metadata JSON format
  const meta = { name, symbol, description, showName: true, createdOn: "https://pump.fun", ...(twitter ? { twitter } : {}), ...(telegram ? { telegram } : {}), ...(website ? { website } : {}) };
  const image = new Blob([bytes], { type });
  try {
    if (process.env.PUMP_IPFS_ENABLED === "true") {
      const fd = new FormData();
      fd.append("file", image, "image");
      for (const [k, v] of Object.entries({ name, symbol, description, twitter, telegram, website, showName: "true" })) if (v) fd.append(k, String(v));
      const r = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: fd, signal: AbortSignal.timeout(30_000) });
      if (r.ok) {
        const j = (await r.json()) as { metadataUri?: string; metadata?: { image?: string } };
        if (j.metadataUri) return Response.json({ metadataUri: j.metadataUri, imageUri: j.metadata?.image ?? null, via: "pump.fun" });
      }
    }
    const jwt = process.env.PINATA_JWT;
    if (!jwt) return Response.json({ error: "Metadata upload isn't configured yet." }, { status: 503 });
    const r = await pinata(jwt, image, `image.${type.split("/")[1]}`, meta);
    return Response.json({ ...r, via: "pinata" });
  } catch {
    return Response.json({ error: "Couldn't upload the metadata. Try again." }, { status: 502 });
  }
}
