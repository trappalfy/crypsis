import { expect, test } from "@playwright/test";

// R5: the Ring SDK (WASM Poseidon, WebCrypto Ed25519, kit) works inside a browser Web Worker.
test("ring worker selftest passes in the browser", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one browser is enough");
  await page.goto("/dev/ring-worker");
  await expect(page.getByTestId("ring-status")).toHaveText(/ok|fail/, { timeout: 60_000 });
  const result = await page.getByTestId("ring-result").textContent();
  console.log(result);
  await expect(page.getByTestId("ring-status")).toHaveText("ok");
  const r = JSON.parse(result!);
  expect(r.txVersion).toBe(1);
  expect(r.snapshotRoundtrip).toBe(true);
  expect(r.indexedDb).toBe(true);
});
