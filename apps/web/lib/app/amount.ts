// Decimal string <-> raw units (bigint). No floats.
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) return null;
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}
export function formatUnits(raw: string | bigint, decimals: number, maxFrac = 6): string {
  const v = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  if (decimals === 0) frac = "";
  return `${whole.toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}
export const lamportsToSol = (l: string | bigint) => formatUnits(l, 9, 6);
