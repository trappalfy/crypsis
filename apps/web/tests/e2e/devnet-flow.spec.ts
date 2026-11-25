// Full devnet E2E (brief §13): connect -> unlock -> activate -> deposit -> send to another registered
// address -> recipient sees it after sync -> withdraw. DEVNET ONLY.
// Needs: E2E_DEVNET=1, NEXT_PUBLIC_SOLANA_NETWORK=devnet, a Helius devnet RPC/indexer/prover in .env.local,
// and devnet SOL on .secrets/devnet-payer.json and .secrets/devnet-recipient.json.
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { injectTestWallet } from "./test-wallet";

const ENABLED = process.env.E2E_DEVNET === "1";
const seedHex = (name: string) => Buffer.from((JSON.parse(readFileSync(new URL(`../../../../.secrets/${name}`, import.meta.url), "utf8")) as number[]).slice(0, 32)).toString("hex");

async function openUnlocked(browser: Browser, secret: string): Promise<{ page: Page; address: string }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await injectTestWallet(page, { seedHex: seedHex(secret) });
  await page.goto("/app");
  await page.getByRole("button", { name: /Crypsis Test Wallet/ }).click();
  await page.getByRole("button", { name: "Sign to unlock" }).click();
  await expect(page.getByRole("heading", { name: /Private\s*balance/ })).toBeVisible({ timeout: 120_000 });
  const address = await page.evaluate(() => (window as unknown as { __testWallet: { address: string } }).__testWallet.address);
  return { page, address };
}
async function activateIfNeeded(page: Page) {
  const link = page.getByRole("link", { name: "Activate", exact: true });
  if (!(await link.isVisible().catch(() => false))) return;
  await link.click();
  await page.getByRole("button", { name: "Review activation" }).click();
  await page.getByRole("button", { name: "Sign activation" }).click();
  await expect(page.getByText(/Done\. Confirmed at slot/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("link", { name: "Balance" }).click();
}

test.describe("devnet full cycle", () => {
  test.skip(!ENABLED, "set E2E_DEVNET=1 (needs Helius devnet endpoints + devnet SOL)");
  test.setTimeout(600_000);

  test("deposit -> private send -> recipient sees it -> withdraw", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop");
    const rec = await openUnlocked(browser, "devnet-recipient.json");
    await activateIfNeeded(rec.page);
    const me = await openUnlocked(browser, "devnet-payer.json");
    await activateIfNeeded(me.page);

    // deposit 0.05 SOL
    await me.page.getByRole("link", { name: "Deposit" }).first().click();
    await me.page.getByRole("button", { name: /^SOL/ }).click();
    await me.page.getByLabel("Amount").fill("0.05");
    await me.page.getByRole("button", { name: "Review deposit" }).click();
    await me.page.getByRole("button", { name: "Sign deposit" }).click();
    await expect(me.page.getByText(/Done\. Confirmed at slot/)).toBeVisible({ timeout: 180_000 });

    // private send 0.01 SOL to the recipient
    await me.page.getByRole("link", { name: "Send" }).first().click();
    await me.page.getByLabel(/Recipient/).fill(rec.address);
    await expect(me.page.getByText("Can receive encrypted transfers.")).toBeVisible({ timeout: 60_000 });
    await me.page.getByRole("button", { name: /^SOL/ }).click();
    await me.page.getByLabel("Amount").fill("0.01");
    await me.page.getByRole("button", { name: "Review transfer" }).click();
    await me.page.getByRole("button", { name: "Sign transfer" }).click();
    await expect(me.page.getByText(/Done\. Confirmed at slot/)).toBeVisible({ timeout: 300_000 });

    // recipient syncs and sees an inbound transfer
    await rec.page.getByRole("button", { name: "Sync" }).click();
    await expect(rec.page.getByText(/Transfer\s*in/).first()).toBeVisible({ timeout: 180_000 });

    // withdraw 0.01 SOL back to the payer's public address
    await me.page.getByRole("link", { name: "Balance" }).click();
    await me.page.getByRole("link", { name: "Withdraw" }).first().click();
    await me.page.getByLabel("Amount").fill("0.01");
    await me.page.getByRole("button", { name: "Review withdrawal" }).click();
    await me.page.getByRole("button", { name: "Sign withdrawal" }).click();
    await expect(me.page.getByText(/Done\. Confirmed at slot/)).toBeVisible({ timeout: 300_000 });
  });
});
