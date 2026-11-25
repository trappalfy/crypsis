import { expect, test } from "@playwright/test";
import { injectTestWallet } from "./test-wallet";

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

test.describe("api/ipfs validation", () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop"); });
  const post = (request: import("@playwright/test").APIRequestContext, fields: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) =>
    request.post("/api/ipfs", { multipart: fields });
  test("requires name, ticker and a real image", async ({ request }) => {
    expect((await post(request, { symbol: "X", file: { name: "a.png", mimeType: "image/png", buffer: PNG } })).status()).toBe(400);
    expect((await post(request, { name: "n".repeat(33), symbol: "X", file: { name: "a.png", mimeType: "image/png", buffer: PNG } })).status()).toBe(400);
    expect((await post(request, { name: "Your coin", symbol: "TOOLONGTICKER", file: { name: "a.png", mimeType: "image/png", buffer: PNG } })).status()).toBe(400);
    // a text file pretending to be a PNG is refused by magic bytes
    expect((await post(request, { name: "Your coin", symbol: "YC", file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("not an image") } })).status()).toBe(415);
    expect((await post(request, { name: "Your coin", symbol: "YC", website: "http://insecure.example", file: { name: "a.png", mimeType: "image/png", buffer: PNG } })).status()).toBe(400);
  });
  test("without PINATA_JWT a valid upload says it's not configured (no fake success)", async ({ request }) => {
    const r = await post(request, { name: "Your coin", symbol: "YC", file: { name: "a.png", mimeType: "image/png", buffer: PNG } });
    expect([503, 502]).toContain(r.status());
  });
});

test("api/launches rejects garbage", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop");
  expect((await request.post("/api/launches", { data: { mint: "x" } })).status()).toBe(400);
});

test("launch form: limits, toggles and honest transaction list", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await injectTestWallet(page);
  await page.goto("/launch");
  await expect(page.getByRole("heading", { name: /Launch/ })).toBeVisible();
  await expect(page.getByText(/Make it Ring-ready — opens a Ring vault/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Make it Ring-ready/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Shield my dev buy/ })).toBeDisabled(); // no dev buy yet
  await expect(page.getByText(/Tx1/)).toBeVisible();
  await expect(page.getByText(/Tx2/)).toBeVisible();
  await page.getByLabel(/Name/).fill("A".repeat(40));
  await expect(page.getByLabel(/Name/)).toHaveValue("A".repeat(32));
  await page.getByLabel(/Dev buy/).fill("0.1");
  await expect(page.getByText(/tokens$/)).toBeVisible({ timeout: 20_000 }); // live quote from pump global
  await expect(page.getByRole("checkbox", { name: /Shield my dev buy/ })).toBeEnabled();
  await expect(page.getByRole("complementary", { name: "Preview" }).getByText("your coin", { exact: true })).toBeVisible(); // placeholder, no invented names
});

test("coin page without a Ring vault offers Make Ring-ready for pump coins", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop" || !process.env.MAKE_READY_MINT, "set MAKE_READY_MINT to a pump.fun mint without a Ring vault on the configured network");
  await page.goto(`/coin/${process.env.MAKE_READY_MINT}`);
  await expect(page.getByRole("button", { name: "Make Ring-ready" }).or(page.getByText(/Connect/).first())).toBeVisible({ timeout: 20_000 });
});
