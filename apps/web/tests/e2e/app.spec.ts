import { expect, test, type Page, type Request } from "@playwright/test";
import { injectTestWallet } from "./test-wallet";

test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "wallet flows run once"); });

const connectAndUnlock = async (page: Page) => {
  await page.goto("/app");
  await page.getByRole("button", { name: /Crypsis Test Wallet/ }).click();
  await expect(page.getByRole("heading", { name: "Unlock your private balance" })).toBeVisible();
  await page.getByRole("button", { name: "Sign to unlock" }).click();
};

test("connect -> locked -> unlock (double signature) -> lock", async ({ page }) => {
  await injectTestWallet(page);
  const sameOrigin: Request[] = [];
  page.on("request", (r) => { if (new URL(r.url()).origin === new URL(page.url() || "http://x").origin) sameOrigin.push(r); });
  await connectAndUnlock(page);
  await expect(page.getByRole("heading", { name: /Private\s*balance/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Lock" })).toBeVisible();
  // no request to the Crypsis server carries the wallet address or a body
  const addr = await page.evaluate(() => (window as unknown as { __testWallet: { address: string } }).__testWallet.address);
  for (const r of sameOrigin) {
    expect(r.url()).not.toContain(addr);
    if (r.url().includes("/api/")) expect(r.method()).toBe("GET");
    expect(r.postData() ?? "").not.toContain(addr);
  }
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByRole("heading", { name: "Unlock your private balance" })).toBeVisible();
});

test("non-deterministic wallet is refused", async ({ page }) => {
  await injectTestWallet(page, { nondeterministic: true });
  await connectAndUnlock(page);
  await expect(page.getByText("This wallet can't derive stable private keys.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unlock your private balance" })).toBeVisible();
});

test("wallet without v1 support defaults to a Crypsis vault (mode B)", async ({ page }) => {
  await injectTestWallet(page, { noV1: true });
  await page.goto("/app");
  await expect(page.getByText("Crypsis vault", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Crypsis Test Wallet/ }).click();
  await expect(page.getByText(/Crypsis derives a private vault key from your signature/)).toBeVisible();
  await page.getByRole("button", { name: "Sign to unlock" }).click();
  await expect(page.getByText("Crypsis vault", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  const addr = await page.evaluate(() => (window as unknown as { __testWallet: { address: string } }).__testWallet.address);
  const vaultText = await page.locator("p", { hasText: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ }).first().textContent();
  expect(vaultText).not.toBe(addr); // the vault is a separate address
});

test("a wallet that refuses the Ring envelope (like Phantom) falls back to a Crypsis vault", async ({ page }) => {
  await injectTestWallet(page, { refuseEnvelope: true });
  await connectAndUnlock(page);
  await expect(page.getByRole("heading", { name: /Private\s*balance/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Crypsis vault", { exact: false }).first()).toBeVisible();
  const addr = await page.evaluate(() => (window as unknown as { __testWallet: { address: string } }).__testWallet.address);
  const vaultText = await page.locator("p", { hasText: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ }).first().textContent();
  expect(vaultText).not.toBe(addr);
  // remembered: the next unlock goes straight to the vault and the wallet isn't offered Mode A again
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByText(/Crypsis derives a private vault key from your signature/)).toBeVisible();
  await expect(page.getByText("Sign Ring transactions with my wallet")).toHaveCount(0);
});

test("activate: review shows fee + rent; an unfunded devnet account gets a clear error", async ({ page }) => {
  page.on("console", (m) => { if (/crypsis|error/i.test(m.text())) console.log("console:", m.type(), m.text().slice(0, 300)); });
  page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
  await injectTestWallet(page);
  await connectAndUnlock(page);
  // in-app navigation: a reload would drop the in-memory keys by design
  await page.getByRole("link", { name: "Activate", exact: true }).click({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Activate receiving" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Review activation" }).click();
  await expect(page.getByText("Rent (one-time)")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Network fee")).toBeVisible();
  await page.getByRole("button", { name: "Sign activation" }).click();
  const alert = page.locator("[role=alert]:not(#__next-route-announcer__)");
  await expect(alert.first()).toBeVisible({ timeout: 30_000 });
  const text = await alert.first().textContent();
  console.log("activation error shown:", text, "codes:", await alert.first().getAttribute("data-codes"));
  expect(text).toBe("Not enough SOL to pay the network fee.");
});
