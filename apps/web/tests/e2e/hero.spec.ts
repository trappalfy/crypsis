import { expect, test } from "@playwright/test";

const SHOTS = process.env.SHOT_DIR;

test("hero renders: flying frame + perf budget", async ({ page }, info) => {
  await page.goto("/?t=6");
  await expect(page.locator("section[aria-label=Crypsis]")).toHaveAttribute("data-ready", "1", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Crypsis" })).toBeVisible();
  await expect(page.getByText("plain sight.")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/hero-${info.project.name}-flying.png` });
  // no horizontal scroll
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("hero animation frame time", async ({ page }, info) => {
  await page.goto("/");
  await page.waitForTimeout(4000);
  const perf = await page.evaluate(() => window.__heroPerf);
  console.log(info.project.name, "frames", perf?.frames, "avg ms", perf && (perf.totalMs / perf.frames).toFixed(2), "max", perf?.maxMs.toFixed(1));
  expect(perf!.frames).toBeGreaterThan(30);
});

test("hero lens + hidden phase", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/?t=12.4&lens=1000,520");
  await expect(page.locator("section[aria-label=Crypsis]")).toHaveAttribute("data-ready", "1", { timeout: 20_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/hero-desktop-lens.png` });
});

test("reduced motion = static frame", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop");
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("section[aria-label=Crypsis]")).toHaveAttribute("data-ready", "1", { timeout: 20_000 });
  const before = await page.evaluate(() => window.__heroPerf?.frames);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__heroPerf?.frames)).toBe(before);
  await ctx.close();
});
