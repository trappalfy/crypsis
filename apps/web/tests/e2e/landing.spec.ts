import { expect, test } from "@playwright/test";

const SHOTS = process.env.SHOT_DIR;
const BANNED = [/audited/i, /\$CRYPSIS/i, /airdrop/i, /\bpoints\b/i, /build in public/i];

test("landing: sections, copy rules, no horizontal scroll at 360px", async ({ page }, info) => {
  await page.goto("/?t=6");
  for (const h of ["Crypsis", "What the chain sees", "Supply in the Ring", "FAQ"]) await expect(page.getByRole("heading", { name: h }).first()).toBeVisible();
  // the only allowed mentions: the FAQ question and its honest answer (brief §0, §8.3)
  const text = (await page.locator("body").innerText()).replace("Is Crypsis audited?", "").replace("Crypsis has not been audited", "");
  for (const re of BANNED) expect(text).not.toMatch(re);
  // live data or the honest empty state — never mock coins
  const band = page.locator("#tracker");
  await expect(band.getByText("No coins in the Ring yet. Be the first.").or(band.locator("ol li").first())).toBeVisible();
  if (SHOTS) {
    // let scroll-driven canvases paint at a few positions
    for (let y = 0; y < 9000; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(60); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/landing-${info.project.name}.png`, fullPage: true });
  }
});

test("360px wide: no horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto("/?t=6");
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
