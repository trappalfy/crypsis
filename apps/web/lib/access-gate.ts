// Private-preview gate (owner request 2026-11-25): until the owner opens the site, every request needs an access key.
// Runs in proxy.ts on every request, before the filesystem and the CDN cache, so pages, chunks, images, OG images,
// robots.txt and APIs are all closed. The gate page names nothing: no title, brand or description.
//
// Modes:
//   SITE_PUBLIC=true            -> open (the owner's "open it" switch)
//   SITE_ACCESS_KEY=<16+ chars> -> key required (cookie after one successful entry)
//   neither, on Vercel          -> closed for everyone (fail-closed: a deploy without the key never leaks the site)
//   neither, elsewhere          -> open (local development, CI)

export type GateMode = "open" | "key" | "closed";
export const ACCESS_COOKIE = "site_access";
export const ACCESS_PATH = "/__access";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
/** Machine endpoints with their own secrets (Vercel cron, Helius webhook). */
const EXEMPT = new Set(["/api/cron/snapshot", "/api/webhooks/helius"]);

export function gateMode(env: Record<string, string | undefined>): GateMode {
  if (env.SITE_PUBLIC === "true") return "open";
  if ((env.SITE_ACCESS_KEY ?? "").length >= 16) return "key";
  return env.VERCEL === "1" ? "closed" : "open";
}

export const isExempt = (pathname: string) => EXEMPT.has(pathname);

/** Only same-site paths: "/x" yes; "//evil", "/\\evil", "https://…" no. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next.slice(0, 512);
}

/** Cookie value: HMAC-SHA256(key, label). Changing the key signs everyone out. */
export async function accessToken(key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("crypsis-access-v1")));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const GATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export const cookieOptions = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: COOKIE_MAX_AGE });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The only page a visitor without the key sees. Deliberately anonymous. */
export function gatePage(opts: { mode: "key" | "closed"; next: string; error?: boolean }): string {
  const body = opts.mode === "closed"
    ? `<p>Private.</p>`
    : `<form method="post" action="${ACCESS_PATH}">
  <input type="hidden" name="next" value="${esc(opts.next)}">
  <input type="password" name="key" placeholder="Access key" autocomplete="current-password" autofocus required aria-label="Access key">
  <button type="submit">Enter</button>
  ${opts.error ? `<p role="alert">Wrong key.</p>` : ""}
</form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private</title>
<style>html,body{height:100%;margin:0;background:#0b0b0b;color:#ddd;font:15px/1.4 ui-monospace,Menlo,monospace}body{display:grid;place-items:center}form{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}input,button{font:inherit;padding:10px 14px;border-radius:999px;border:1px solid #333;background:#141414;color:#eee}button{cursor:pointer}p{width:100%;text-align:center;margin:12px 0 0;color:#e07a5f}</style>
</head><body>${body}</body></html>`;
}
