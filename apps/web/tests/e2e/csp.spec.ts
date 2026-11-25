import { expect, test } from "@playwright/test";
import { injectTestWallet } from "./test-wallet";

test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop"); });

const violations = (page: import("@playwright/test").Page) => {
  const v: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(m.text())) v.push(m.text().slice(0, 200)); });
  return v;
};

test("static pages: CSP without third-party script hosts; no violations", async ({ page }) => {
  const v = violations(page);
  const res = await page.goto("/");
  const csp = res!.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/googletagmanager|analytics|facebook|hotjar/);
  expect(res!.headers()["x-content-type-options"]).toBe("nosniff");
  await page.waitForTimeout(800);
  await page.goto("/tracker");
  await page.waitForTimeout(500);
  expect(v).toEqual([]);
});

test("/app: per-request nonce on every script, strict-dynamic, no violations, worker + WASM ok", async ({ page }) => {
  const v = violations(page);
  const res = await page.goto("/app");
  const csp = res!.headers()["content-security-policy"];
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
  const html = await res!.text();
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const s of scripts) expect(s).toContain(`nonce="${nonce}"`);
  // a second request gets a fresh nonce
  const again = await page.request.get("/app");
  expect(again.headers()["content-security-policy"]).not.toContain(nonce!);
  await page.goto("/dev/ring-worker");
  await expect(page.getByTestId("ring-status")).toHaveText("ok", { timeout: 60_000 });
  expect(v).toEqual([]);
});

test("/app unlock still works under the nonce CSP", async ({ page }) => {
  const v = violations(page);
  await injectTestWallet(page);
  await page.goto("/app");
  await page.getByRole("button", { name: /Crypsis Test Wallet/ }).click();
  await page.getByRole("button", { name: "Sign to unlock" }).click();
  await expect(page.getByRole("heading", { name: /Private\s*balance/ })).toBeVisible({ timeout: 30_000 });
  expect(v.filter((x) => !/connect-src/.test(x))).toEqual([]);
  console.log("connect-src violations (informational):", v.filter((x) => /connect-src/.test(x)));
});
