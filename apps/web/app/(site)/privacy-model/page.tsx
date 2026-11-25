import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import { ChainTable } from "@/components/site/ChainSees";
import { CHAIN_SEES } from "@/lib/copy";

export const metadata: Metadata = { title: "Privacy model", description: CHAIN_SEES.caption };

// Brief §5: expanded S4 + what Crypsis sees (public data only) + links to Helius documentation.
export default function PrivacyModel() {
  return (
    <PageShell kicker="Privacy model" title={<>What the chain <em>sees</em></>}>
      <ChainTable />
      <p style={{ marginTop: 28 }}>{CHAIN_SEES.caption}</p>

      <h2>Inside a transfer</h2>
      <p>When you send from your private balance, the coin, the amount and the memo are encrypted onchain. The sender and recipient addresses are visible, and so is the transaction hash.</p>
      <p>Because a transfer doesn&apos;t reveal its coin, transfers inside the Ring can&apos;t be attributed to a coin. The tracker only counts public deposits and withdrawals for each coin.</p>

      <h2>Deposits and withdrawals</h2>
      <p>Moving tokens into the Ring (deposit) and out of it (withdraw) is fully public: the coin, the amount and the addresses are visible. Privacy is not anonymity.</p>

      <h2>Your keys</h2>
      <ul>
        <li>Your private keys are derived in your browser from a wallet signature. The signature never leaves the browser.</li>
        <li>Your private balance and history are decrypted only in your browser. The local copy is stored encrypted.</li>
        <li>Locking the app, or closing the tab, wipes the keys from memory.</li>
      </ul>

      <h2>What Crypsis sees</h2>
      <p>Only public onchain data: Ring vault balances, total supply, public deposits and withdrawals, and coins launched through Crypsis. Crypsis servers never receive your signature, keys, private balance or private history. There are no user accounts.</p>

      <h2>Audit status</h2>
      <p>Crypsis has not been audited. Helius Privacy Rings is a third-party protocol; check Helius documentation for its security status.</p>

      <h2>Read more</h2>
      <ul>
        <li><a href="https://www.helius.dev/docs/privacy/concepts/overview" target="_blank" rel="noopener noreferrer">Helius Privacy Rings — overview</a></li>
        <li><a href="https://www.helius.dev/blog/solana-privacy-rings" target="_blank" rel="noopener noreferrer">Helius — Solana Privacy Rings announcement</a></li>
      </ul>
    </PageShell>
  );
}
