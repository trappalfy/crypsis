import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, SECURITY_HEADERS } from "@/lib/csp";
import {
  ACCESS_COOKIE, ACCESS_PATH, GATE_HEADERS, accessToken, cookieOptions, gateMode, gatePage, isExempt, safeNext, sameToken,
} from "@/lib/access-gate";

// 1) Private-preview gate on every request (lib/access-gate.ts).
// 2) Strict nonce CSP where keys live (/app, /launch, /dev): no inline script without the per-request nonce.
//    Those segments render dynamically (instant = false + connection()) so Next can apply the nonce.

const attempts = new Map<string, { n: number; at: number }>();
function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.at > 60_000) { attempts.set(ip, { n: 1, at: now }); return false; }
  a.n++;
  return a.n > 20;
}

function closed(body: string, status: number, html: boolean): NextResponse {
  return new NextResponse(body, { status, headers: { ...GATE_HEADERS, "Content-Type": html ? "text/html; charset=utf-8" : "text/plain; charset=utf-8" } });
}

async function gate(request: NextRequest): Promise<NextResponse | null> {
  const mode = gateMode(process.env);
  if (mode === "open") return null;
  const { pathname, search } = request.nextUrl;
  if (isExempt(pathname)) return null;

  const key = process.env.SITE_ACCESS_KEY ?? "";
  const expected = mode === "key" ? await accessToken(key) : null;
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");

  if (pathname === ACCESS_PATH && request.method === "POST") {
    if (!expected) return closed(gatePage({ mode: "closed", next: "/" }), 401, true);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const form = await request.formData().catch(() => null);
    const next = safeNext(form?.get("next"));
    if (tooManyAttempts(ip)) return closed(gatePage({ mode: "key", next, error: true }), 429, true);
    const given = form?.get("key");
    if (typeof given === "string" && sameToken(await accessToken(given), expected)) {
      const res = NextResponse.redirect(new URL(next, request.url), 303);
      res.cookies.set(ACCESS_COOKIE, expected, cookieOptions(request.nextUrl.protocol === "https:"));
      for (const [k, v] of Object.entries(GATE_HEADERS)) if (k !== "Content-Security-Policy") res.headers.set(k, v);
      return res;
    }
    return closed(gatePage({ mode: "key", next, error: true }), 401, true);
  }

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value ?? "";
  if (expected && sameToken(cookie, expected)) return null;
  if (!wantsHtml) return closed("Private.", 401, false);
  return closed(gatePage({ mode: mode === "key" ? "key" : "closed", next: safeNext(pathname + search) }), 401, true);
}

const isPrefetch = (r: NextRequest) => r.headers.has("next-router-prefetch") || r.headers.get("purpose") === "prefetch";
const needsNonce = (p: string) => p === "/app" || p.startsWith("/app/") || p === "/launch" || p.startsWith("/dev/");

export async function proxy(request: NextRequest) {
  const blocked = await gate(request);
  if (blocked) return blocked;
  const locked = gateMode(process.env) !== "open";
  const { pathname } = request.nextUrl;

  if (needsNonce(pathname) && !isPrefetch(request)) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    for (const h of SECURITY_HEADERS) res.headers.set(h.key, h.value);
    if (locked) res.headers.set("X-Robots-Tag", GATE_HEADERS["X-Robots-Tag"]);
    return res;
  }
  if (locked) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", GATE_HEADERS["X-Robots-Tag"]);
    return res;
  }
  return NextResponse.next();
}

// No matcher: the gate must see every request, including _next/static chunks, images and robots.txt.
