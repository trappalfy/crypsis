import { describe, expect, it, vi } from "vitest";
import { candidateUrls, canonicalSource, fetchRemote, gateways, isPublicHttps, metadataImage } from "./remote-media";

const GW = ["https://gw-a.example/ipfs/", "https://gw-b.example/ipfs/"];
const ok = (body: string | Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers });

describe("canonicalSource", () => {
  it("reduces every IPFS form to ipfs://CID/path", () => {
    expect(canonicalSource("ipfs://bafy123")).toBe("ipfs://bafy123");
    expect(canonicalSource("https://ipfs.io/ipfs/QmX/a.png")).toBe("ipfs://QmX/a.png");
    expect(canonicalSource("https://pump.mypinata.cloud/ipfs/bafkrei9?img-width=64")).toBe("ipfs://bafkrei9");
  });
  it("keeps other public https URLs and rejects everything else", () => {
    expect(canonicalSource("https://arweave.net/abc")).toBe("https://arweave.net/abc");
    expect(canonicalSource("http://example.com/a.png")).toBeNull();
    expect(canonicalSource("data:image/png;base64,AAAA")).toBeNull();
    expect(canonicalSource("https://127.0.0.1/a.png")).toBeNull();
    expect(canonicalSource("")).toBeNull();
    expect(canonicalSource(null)).toBeNull();
  });
});

describe("isPublicHttps", () => {
  it("refuses local and private hosts", () => {
    for (const u of ["https://localhost/x", "https://a.localhost/x", "https://10.0.0.1/x", "https://192.168.1.2/x", "https://172.16.0.1/x", "https://169.254.169.254/x", "https://100.64.0.1/x", "https://[::1]/x", "https://metadata.internal/x", "https://printer.local/x", "https://example.com:8443/x", "http://example.com/x"]) {
      expect(isPublicHttps(new URL(u)), u).toBe(false);
    }
  });
  it("accepts ordinary public hosts", () => {
    expect(isPublicHttps(new URL("https://ipfs.filebase.io/ipfs/Qm"))).toBe(true);
    expect(isPublicHttps(new URL("https://8.8.8.8/x"))).toBe(true);
  });
});

describe("gateways and candidate URLs", () => {
  it("tries every gateway for IPFS and only the URL itself otherwise", () => {
    expect(candidateUrls("ipfs://QmX/a.png", GW)).toEqual(["https://gw-a.example/ipfs/QmX/a.png", "https://gw-b.example/ipfs/QmX/a.png"]);
    expect(candidateUrls("https://ipfs.io/ipfs/QmX", GW)).toEqual(["https://gw-a.example/ipfs/QmX", "https://gw-b.example/ipfs/QmX"]);
    expect(candidateUrls("https://arweave.net/abc", GW)).toEqual(["https://arweave.net/abc"]);
    expect(candidateUrls("http://x.example/a", GW)).toEqual([]);
  });
  it("IPFS_GATEWAYS overrides the default list", () => {
    expect(gateways({ IPFS_GATEWAYS: "https://one.example/ipfs/, https://two.example/ipfs" })).toEqual(["https://one.example/ipfs/", "https://two.example/ipfs/"]);
    expect(gateways({}).length).toBeGreaterThan(2);
  });
});

describe("fetchRemote", () => {
  it("falls through a rate-limited gateway to the next one", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 429 })).mockResolvedValueOnce(ok("hello"));
    const b = await fetchRemote("ipfs://QmX", { maxBytes: 100, timeoutMs: 1000, fetch: f, gateways: GW });
    expect(new TextDecoder().decode(b!)).toBe("hello");
    expect(f.mock.calls.map((c) => c[0])).toEqual(["https://gw-a.example/ipfs/QmX", "https://gw-b.example/ipfs/QmX"]);
  });
  it("returns null when every source fails", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchRemote("ipfs://QmX", { maxBytes: 100, timeoutMs: 1000, fetch: f, gateways: GW })).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("refuses bodies over the size limit", async () => {
    const f = vi.fn().mockResolvedValue(ok(new Uint8Array(500)));
    expect(await fetchRemote("https://arweave.net/a", { maxBytes: 100, timeoutMs: 1000, fetch: f })).toBeNull();
  });
  it("follows a redirect to a public host but never to a private one", async () => {
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    const good = vi.fn().mockResolvedValueOnce(redirect("https://cdn.example/a.png")).mockResolvedValueOnce(ok("img"));
    expect(new TextDecoder().decode((await fetchRemote("https://arweave.net/a", { maxBytes: 100, timeoutMs: 1000, fetch: good }))!)).toBe("img");
    const evil = vi.fn().mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data"));
    expect(await fetchRemote("https://arweave.net/a", { maxBytes: 100, timeoutMs: 1000, fetch: evil })).toBeNull();
    expect(evil).toHaveBeenCalledTimes(1);
  });
});

describe("metadataImage", () => {
  it("reads the image field of pump.fun metadata JSON", async () => {
    const f = vi.fn().mockResolvedValue(ok(JSON.stringify({ name: "X", image: "https://ipfs.io/ipfs/QmImg" })));
    expect(await metadataImage("https://ipfs.io/ipfs/QmMeta", { fetch: f, gateways: GW })).toBe("ipfs://QmImg");
  });
  it("accepts a metadata URI that is itself an image", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const f = vi.fn().mockResolvedValue(ok(png));
    expect(await metadataImage("ipfs://QmPng", { fetch: f, gateways: GW })).toBe("ipfs://QmPng");
  });
  it("returns null for junk", async () => {
    expect(await metadataImage("https://x.example/m", { fetch: vi.fn().mockResolvedValue(ok("<html>")) })).toBeNull();
    expect(await metadataImage("https://x.example/m", { fetch: vi.fn().mockResolvedValue(ok(JSON.stringify({ image: "http://insecure/a.png" }))) })).toBeNull();
    expect(await metadataImage(null, {})).toBeNull();
  });
});
