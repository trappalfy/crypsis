// All user-facing copy (brief §8). English, final; edits belong to the owner.
// Banned words and claims are enforced by tests/unit/copy-rules.test.ts. No invented coin names or tickers.

export const HERO = {
  wordmark: "Crypsis",
  micro: [
    ["Encrypted transfers", "for pump.fun coins"],
    ["Powered by", "Helius Privacy Rings"],
    ["Solana mainnet", "Slot"],
  ],
  headline: ["Hidden in", "plain sight."],
  tabs: [
    { label: "Launch", href: "#launch" },
    { label: "Private balance", href: "#private-balance" },
    { label: "Tracker", href: "#tracker" },
  ],
  note: ["Addresses stay public.", "Coin and amount don’t."],
  ctaSoon: "Launch soon →",
  ctaLive: "Open app →",
  srDescription:
    "An ASCII butterfly made of the same characters as the background. It blends into the camouflage and reappears: addresses are visible, what moved and how much is not.",
} as const;

export const MANIFESTO = {
  top: "Launch loud.",
  bottom: "Move quiet.",
  body: "Your coin launches on pump.fun like any other: same curve, same page, same trading. Then it gets a private lane. Holders can shield it and send it without showing what moved or how much.",
} as const;

export const HOW = [
  { n: "/01", title: "Launch", text: "Create your coin on pump.fun straight from Crypsis. Nothing about the launch changes.", art: "chrysalis", sector: "all" },
  { n: "/02", title: "Ring-ready", text: "The next transaction opens a Ring vault for your coin, so holders can shield it from block one.", art: "ring", sector: "all" },
  { n: "/03", title: "Shield", text: "Holders move tokens into a private balance. The deposit itself is public.", art: "butterfly-sm", sector: 0 },
  { n: "/04", title: "Send", text: "Transfers inside the Ring encrypt the coin, the amount and the memo. Only the two addresses show.", art: "butterfly-flap", sector: 1 },
  { n: "/05", title: "Exit", text: "Withdraw to any Solana address whenever you want. Withdrawals are public.", art: "butterfly-open", sector: 2 },
  { n: "/06", title: "Track", text: "A public tracker shows how much of every coin's supply sits in the Ring.", art: "dots", sector: 3 },
] as const;

export const RING_SECTORS = ["Deposit", "Send", "Withdraw", "Track"] as const;

export const CHAIN_SEES = {
  title: "What the chain sees",
  columns: ["Coin", "Amount", "Sender", "Recipient", "Memo"],
  rows: [
    { event: "Deposit", sub: "public → private", cells: ["public", "public", "public", "public", "public"] },
    { event: "Transfer", sub: "private → private", cells: ["hidden", "hidden", "public", "public", "hidden"] },
    { event: "Withdraw", sub: "private → public", cells: ["public", "public", "public", "public", "none"] },
  ],
  footnote: "Transaction hashes are always public.",
  caption:
    "Privacy here means the coin and the amount of a transfer are hidden. It doesn't mean anonymity: addresses, deposits and withdrawals are public.",
} as const;

export const TRACKER_PREVIEW = {
  title: "Supply in the Ring",
  sub: "Live. Read from Solana every few minutes.",
  cta: "Open tracker",
  empty: "No coins in the Ring yet. Be the first.",
} as const;

export const LAUNCH_TEASER = {
  title: "Every coin starts as a chrysalis.",
  body: "Launch your coin and it's Ring-ready before the first holder shows up.",
  ctaLive: "Launch your coin",
  ctaSoon: "Launch soon",
} as const;

export const POWERED = { title: "Built on", items: ["Helius", "Solana", "pump.fun"] } as const;

export const FAQ: readonly { q: string; a: string }[] = [
  { q: "What is Crypsis?", a: "A launch and wallet layer for pump.fun coins with encrypted transfers on Solana, built on Helius Privacy Rings." },
  { q: "What exactly is hidden?", a: "In a transfer inside the Ring, the coin, the amount and the memo are encrypted onchain." },
  { q: "What is public?", a: "The sender and recipient addresses of a transfer. Deposits and withdrawals are fully public: coin, amount and addresses." },
  { q: "Is my coin still a normal pump.fun coin?", a: "Yes. It launches and trades on pump.fun as usual. Crypsis only opens a Ring vault for it." },
  { q: "Who can see my private balance?", a: "Only you. Your private keys are derived in your browser from a wallet signature. Crypsis servers never see them." },
  { q: "Does Crypsis hold my funds?", a: "No. Crypsis never takes custody. Your balance lives in the Helius Privacy Ring and only your keys can spend it." },
  { q: "Is Crypsis audited?", a: "Crypsis has not been audited. Helius Privacy Rings is a third-party protocol; check Helius documentation for its security status." },
  // TODO(OWNER): append "Crypsis adds no fee." only after the owner confirms there is no Crypsis fee.
  { q: "What does it cost?", a: "Solana network fees and any Ring protocol fees, shown before you sign." },
  // TODO(OWNER): replace with the tested list from the wallet matrix (docs/phase0-report.md §5).
  { q: "Which wallets work?", a: "Wallets that can sign the Ring key-derivation message and Ring transactions." },
];

export const FOOTER = {
  links: [
    { label: "X", href: "x" },
    { label: "Tracker", href: "/tracker" },
    { label: "App", href: "/app" },
    { label: "Privacy model", href: "/privacy-model" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
  ],
  copyright: "© 2026 Crypsis",
} as const;

export const APP_COPY = {
  connect: "Connect a wallet to see your private balance.",
  connectCta: "Connect wallet",
  unlockTitle: "Unlock your private balance",
  unlockBody: "Sign a message to derive your private keys in this browser. It's free and sends no transaction.",
  unlockCta: "Sign to unlock",
  determinism: "Sign once more to make sure your wallet gives the same keys every time.",
  nondeterministic: "This wallet can't derive stable private keys.",
  activateTitle: "Activate receiving",
  activateBody: "Publish your private address so others can send you encrypted transfers. One-time transaction.",
  depositPublic: "Deposits are public: the coin, the amount and your address are visible onchain.",
  withdrawPublic: "Withdrawals are public: the coin, the amount and the recipient are visible onchain.",
  sendHidden: "Hidden: coin, amount, memo",
  sendPublic: "Public: your address, recipient's address",
  firstDeposit: "First deposit opens the Ring vault for this coin (+rent)",
  notActivated: "This address hasn't activated Crypsis yet",
  copyInvite: "Copy invite link",
  modeBTitle: "Crypsis vault",
  modeBBody:
    "Your wallet can't sign Ring transactions yet, so Crypsis derives a private vault key from your signature. Fund the vault from your wallet; that funding transfer is public.",
  launchRingReady: (rentSol: string) => `Make it Ring-ready — opens a Ring vault for your coin right after launch (one-time rent ~${rentSol} SOL).`,
  launchShield: "Shield my dev buy — deposit the tokens you buy into your private balance.",
  shareOnX: (mint: string) => `Just launched on pump.fun via @crypsisfun. Ring-ready from block one. https://pump.fun/coin/${mint}`,
  transfersNotCounted: "Transfers inside the Ring don't reveal the coin, so they aren't counted here.",
} as const;
