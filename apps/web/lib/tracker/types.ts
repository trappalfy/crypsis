// Public tracker data shapes (all public onchain data).
export interface CoinSummary {
  mint: string;
  symbol: string | null;
  name: string | null;
  imageUri: string | null;
  tokenProgram: string;
  decimals: number;
  isPump: boolean;
  launchedViaCrypsis: boolean;
  graduated: boolean;
  ringReadyAt: string | null;
  /** raw token units, decimal string */
  vaultAmount: string;
  totalSupply: string;
  /** share of supply in basis points (1 bp = 0.01%) */
  shareBps: number;
  /** change of share over 24h, basis points (percentage points * 100) */
  change24hBps: number | null;
  deposits24h: number;
  withdrawals24h: number;
  /** recent share history (oldest → newest), bps, for dot histograms */
  spark: number[];
}

export const formatShare = (bps: number) => `${(bps / 100).toFixed(2)}%`;
export const formatPp = (bps: number | null) => (bps == null ? "—" : `${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(2)} pp`);
export function formatTokenAmount(raw: string, decimals: number): string {
  const v = BigInt(raw || "0");
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  if (whole >= 1_000_000_000n) return `${(Number(whole / 10_000_000n) / 100).toFixed(2)}B`;
  if (whole >= 1_000_000n) return `${(Number(whole / 10_000n) / 100).toFixed(2)}M`;
  if (whole >= 10_000n) return `${(Number(whole / 10n) / 100).toFixed(2)}K`;
  const frac = Number(v % base) / Number(base);
  return (Number(whole) + frac).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
export const shortMint = (m: string) => `${m.slice(0, 4)}…${m.slice(-4)}`;

/** Icon URL on our own origin (app/api/coin-image): the server fetches and resizes the coin's image. */
export const coinImageUrl = (mint: string) => `/api/coin-image/${mint}`;
