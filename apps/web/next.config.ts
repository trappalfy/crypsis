import type { NextConfig } from "next";
import { buildCsp, buildWorkerCsp, SECURITY_HEADERS } from "./lib/csp";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";

// @lightprotocol/hasher.rs (pulled in by @heliuslabs/spr) inlines its WASM as base64, but keeps a dead
// `new URL('<name>.wasm', import.meta.url)` fallback that bundlers try to resolve. Point it at the real files.
// pnpm layout: the hasher sits next to spr inside spr's virtual-store node_modules.
const sprDir = realpathSync(join(process.cwd(), "node_modules/@heliuslabs/spr"));
const hasherDir = join(sprDir, "..", "..", "@lightprotocol", "hasher.rs");
const rel = (f: string) => "./" + relative(process.cwd(), join(hasherDir, "dist", f));

const nextConfig: NextConfig = {
  // The owner's "app is live" switch. APP_LIVE (no public prefix) works with Vercel's sensitive-by-default
  // variables, which refuse NEXT_PUBLIC_ names; NEXT_PUBLIC_APP_LIVE still works for older setups.
  // Not a secret: the value is inlined into the bundle at build time.
  env: { CRYPSIS_APP_LIVE: process.env.APP_LIVE === "true" || process.env.NEXT_PUBLIC_APP_LIVE === "true" ? "true" : "false" },
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // small CSS-module payload: inline it so first paint doesn't wait on render-blocking stylesheets (LCP)
  experimental: { inlineCss: true },
  async headers() {
    const dev = process.env.NODE_ENV === "development";
    return [
      // static pages (landing, tracker, legal): static CSP. /app, /launch, /dev get a nonce CSP from proxy.ts
      { source: "/((?!app|launch|dev|api|_next/static|_next/image).*)", headers: [{ key: "Content-Security-Policy", value: buildCsp({ dev }) }, ...SECURITY_HEADERS] },
      { source: "/api/:path*", headers: SECURITY_HEADERS },
      // Web Workers (the Ring worker holds the keys) take their CSP from their own script response, not the page:
      // lock the worker scripts down to self + the Ring/RPC endpoints. Ignored for classic <script> loads.
      { source: "/_next/static/:path*.js", headers: [{ key: "Content-Security-Policy", value: buildWorkerCsp() }] },
    ];
  },
  turbopack: {
    resolveAlias: {
      "light_wasm_hasher_bg.wasm": rel("light_wasm_hasher_bg.wasm"),
      "hasher_wasm_simd_bg.wasm": rel("hasher_wasm_simd_bg.wasm"),
    },
  },
};

export default nextConfig;
