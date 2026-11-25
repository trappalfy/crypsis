import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, SECURITY_HEADERS } from "@/lib/csp";

// Strict nonce CSP where keys live (/app, /launch, /dev): no inline script without the per-request nonce.
// Those segments render dynamically (instant = false + connection()) so Next can apply the nonce.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  for (const h of SECURITY_HEADERS) res.headers.set(h.key, h.value);
  return res;
}

export const config = {
  matcher: [
    { source: "/app/:path*", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
    { source: "/app", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
    { source: "/launch", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
    { source: "/dev/:path*", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};
