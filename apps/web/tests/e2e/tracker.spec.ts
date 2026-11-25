import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const SHOTS = process.env.SHOT_DIR;
test.describe.configure({ mode: "serial" });

test("webhook and cron reject missing/invalid secrets", async ({ request }) => {
  expect((await request.post("/api/webhooks/helius", { data: [] })).status()).toBe(401);
  expect((await request.post("/api/webhooks/helius", { data: [], headers: { authorization: "wrong" } })).status()).toBe(401);
  expect((await request.get("/api/cron/snapshot")).status()).toBe(401);
  expect((await request.get("/api/cron/snapshot", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
});

test("webhook with secret ingests a real Ring deposit (idempotent)", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop");
  const tx = JSON.parse(readFileSync(new URL("../fixtures/ring-txs/rTefY1K6f1FPzvh8.json", import.meta.url), "utf8"));
  const headers = { authorization: process.env.HELIUS_WEBHOOK_SECRET ?? "local-dev-webhook-secret" };
  const a = await request.post("/api/webhooks/helius", { data: [tx], headers });
  expect(a.status()).toBe(200);
  const b = await (await request.post("/api/webhooks/helius", { data: [tx], headers })).json();
  expect(b).toMatchObject({ received: 1, stored: 0 }); // second delivery is a no-op
});

test("api/coins returns pump.fun coins sorted by share", async ({ request }) => {
  const r = await (await request.get("/api/coins?sort=share&limit=5")).json();
  expect(Array.isArray(r.items)).toBe(true);
  if (r.items.length > 1) expect(r.items[0].shareBps).toBeGreaterThanOrEqual(r.items[1].shareBps);
  for (const c of r.items) expect(c.isPump).toBe(true);
});

test("tracker page + coin page render live data", async ({ page, request }, info) => {
  await page.goto("/tracker");
  await expect(page.getByRole("heading", { name: /Supply in/ })).toBeVisible();
  await expect(page.getByText("Coins in Ring")).toBeVisible();
  const r = await (await request.get("/api/coins?sort=share&limit=1")).json();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tracker-${info.project.name}.png`, fullPage: true });
  if (!r.items.length) return;
  await page.goto(`/coin/${r.items[0].mint}`);
  await expect(page.getByText("Share of supply in the Ring").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Deposit this coin" }).first()).toBeVisible();
  await expect(page.getByText("Transfers inside the Ring don't reveal the coin, so they aren't counted here.").first()).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/coin-${info.project.name}.png`, fullPage: true });
  const og = await request.get(`/coin/${r.items[0].mint}/opengraph-image-mrogu5`);
  expect(og.headers()["content-type"]).toContain("image/png");
});

test("unknown coin -> not-found view, noindex", async ({ page }) => {
  await page.goto("/coin/11111111111111111111111111111111");
  // streamed (PPR) page: the status is already 200, Next marks it noindex and renders not-found
  await expect(page.getByRole("heading", { name: /Not in/ })).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
});
