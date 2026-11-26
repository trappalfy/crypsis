import { describe, expect, it } from "vitest";
import { shareBps } from "./sync";
import { formatPp, formatShare, formatTokenAmount } from "../tracker/types";
import { secretMatches } from "../server/auth";

describe("tracker math (brief §2.4)", () => {
  it("share in basis points, floored", () => {
    expect(shareBps(213852506992929n, 996592341222395n)).toBe(2145);
    expect(shareBps(1n, 3n)).toBe(3333);
    expect(shareBps(5n, 0n)).toBe(0);
    expect(shareBps(0n, 10n)).toBe(0);
  });
  it("formats share with two decimals and pp change", () => {
    expect(formatShare(2145)).toBe("21.45%");
    expect(formatShare(0)).toBe("0.00%");
    expect(formatPp(-125)).toBe("−1.25 pp");
    expect(formatPp(null)).toBe("—");
  });
  it("formats token amounts by decimals", () => {
    expect(formatTokenAmount("213852506992929", 6)).toBe("213.85M");
    expect(formatTokenAmount("1000000", 6)).toBe("1");
  });
  it("secret comparison", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches(null, "abc")).toBe(false);
    expect(secretMatches("abc", undefined)).toBe(false);
  });
});
