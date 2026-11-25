import { describe, expect, it } from "vitest";
import { formatUnits, parseUnits } from "./amount";

describe("amounts", () => {
  it("parses decimal strings exactly", () => {
    expect(parseUnits("1.5", 6)).toBe(1_500_000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(parseUnits("1,000", 0)).toBe(1000n);
    expect(parseUnits("1.0000001", 6)).toBeNull();
    expect(parseUnits("abc", 6)).toBeNull();
    expect(parseUnits("", 6)).toBeNull();
  });
  it("formats raw units", () => {
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
    expect(formatUnits("123456789000", 6)).toBe("123,456.789");
    expect(formatUnits(5000n, 9)).toBe("0.000005");
  });
});
