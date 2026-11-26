import { describe, expect, it } from "vitest";
import { SOL_MINT } from "@heliuslabs/spr";
import { NATIVE_SOL } from "./protocol";

describe("native SOL marker", () => {
  // The worker lists native SOL under the SDK's SOL_MINT (the System Program address, not wrapped SOL);
  // the deposit screen must use the same value to keep SOL out of the vault-funding coin list and to
  // reserve fee SOL when SOL itself is deposited.
  it("matches the SDK", () => {
    expect(NATIVE_SOL).toBe(String(SOL_MINT));
    expect(NATIVE_SOL).not.toBe("So11111111111111111111111111111111111111112");
  });
});
