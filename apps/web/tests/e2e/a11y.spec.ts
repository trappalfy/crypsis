import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { injectTestWallet } from "./test-wallet";

const PAGES = ["/?t=6", "/tracker", "/privacy-model", "/terms", "/privacy", "/launch", "/app"];

for (const path of PAGES) {
  test(`a11y: ${path}`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop" && path !== "/?t=6");
    await injectTestWallet(page);
    await page.goto(path);
    await page.waitForTimeout(1200);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const list = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    if (list.length) console.log(path, "\n  " + list.join("\n  "));
    expect(list).toEqual([]);
  });
}
