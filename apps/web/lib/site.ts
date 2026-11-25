// Public site config. All values here are public (NEXT_PUBLIC_*), never secrets.
export const SITE = {
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://crypsis.fun",
  xUrl: process.env.NEXT_PUBLIC_X_URL || "https://x.com/crypsisfun",
  appLive: process.env.NEXT_PUBLIC_APP_LIVE === "true",
  network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "mainnet" : "devnet") as "mainnet" | "devnet",
  title: "Crypsis — Encrypted transfers for pump.fun coins",
  description:
    "Launch on pump.fun, then move your coin through a Helius Privacy Ring. The coin, the amount and the memo stay encrypted. Addresses stay public.",
} as const;
