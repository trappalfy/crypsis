import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/site/PageShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms", description: "The terms for using crypsis.fun and the Crypsis app." };

const TERMS_UPDATED = "26 November 2026";

export default function Terms() {
  return (
    <PageShell kicker="Terms" title="Terms of use">
      <p>Last updated: {TERMS_UPDATED}</p>
      <p>These terms apply to crypsis.fun and the Crypsis app (together, “Crypsis”, “we”, “us”). By using Crypsis you agree to them. If you don’t agree, don’t use Crypsis.</p>

      <h2>1. What Crypsis is</h2>
      <p>Crypsis is an interface. It helps you launch coins on pump.fun, open Helius Privacy Ring vaults for them, and move coins through those Rings with encrypted transfers. It also shows a public tracker of Ring activity.</p>
      <p>Crypsis runs in your browser. Every transaction is built in your browser and signed by you or by a key that only your browser holds. Crypsis never takes custody of your funds and doesn’t move them on your behalf. It is not a bank, an exchange or a broker.</p>
      <p>Crypsis relies on services it doesn’t control: the Solana network, Helius Privacy Rings (the Solana Privacy Program and Helius’s RPC, indexer and prover), pump.fun and your wallet. Their own terms apply to your use of them.</p>

      <h2>2. Who can use Crypsis</h2>
      <p>You may use Crypsis only if all of the following are true:</p>
      <ul>
        <li>you are at least 18 years old, or the age of majority where you live if that is higher;</li>
        <li>you are not on a sanctions list (including those kept by the United Nations, the European Union, the United Kingdom and the United States), you don’t act for anyone who is, and you are not located in or ordinarily resident in a country or region under comprehensive sanctions;</li>
        <li>using Crypsis is legal where you are.</li>
      </ul>
      <p>You are responsible for following the laws that apply to you, including tax rules.</p>

      <h2>3. Your keys and your wallet</h2>
      <ul>
        <li>Your private keys are derived in your browser from a wallet signature. Crypsis servers never receive the signature or the keys.</li>
        <li>If your wallet can’t sign Ring transactions, Crypsis derives a separate vault key from your wallet’s signature of a fixed message. Anyone who gets that signature controls the vault. Only sign it on https://crypsis.fun.</li>
        <li>If you lose access to your wallet, you lose access to your private balance and your Crypsis vault. Nobody can recover them, including us.</li>
        <li>You are responsible for your device, your browser, your wallet and its recovery phrase.</li>
      </ul>

      <h2>4. What stays private and what doesn’t</h2>
      <p>In a transfer inside a Ring, the coin, the amount and the memo are encrypted onchain. These are public:</p>
      <ul>
        <li>the sender and recipient addresses of a transfer, and its transaction hash;</li>
        <li>deposits into a Ring and withdrawals from it, with the coin, the amount and the addresses;</li>
        <li>activating an address to receive transfers;</li>
        <li>funding a Crypsis vault from your wallet, which links the two addresses.</li>
      </ul>
      <p>Privacy is not anonymity. We don’t promise that your activity can’t be linked or analysed. Timing and the amounts you deposit and withdraw can reveal information. See the <Link href="/privacy-model">privacy model</Link>.</p>

      <h2>5. What you must not do</h2>
      <p>You agree not to use Crypsis to:</p>
      <ul>
        <li>launder money, finance terrorism, evade sanctions or move the proceeds of crime;</li>
        <li>defraud anyone, including through rug pulls, pump-and-dump schemes or fake promotions;</li>
        <li>launch coins that impersonate people, brands or projects, infringe anyone’s rights, or carry illegal content;</li>
        <li>attack or overload the site, get around its access controls or rate limits, or scrape it at scale;</li>
        <li>break any law that applies to you.</li>
      </ul>
      <p>We may limit or block access to the interface, for example for certain addresses or regions, to comply with the law or to protect users. We can’t freeze, seize or move funds in a Ring: we don’t have your keys.</p>

      <h2>6. Launching coins</h2>
      <ul>
        <li>A coin launched through Crypsis is created on pump.fun by your wallet. You are its creator, and pump.fun’s terms apply to it.</li>
        <li>The name, ticker, description, image and links you enter are published on IPFS through Pinata. They are public and practically permanent. Upload only what you have the right to publish.</li>
        <li>We don’t review, endorse or promote coins. “Launched on Crypsis” only means the coin was created through this interface.</li>
        <li>Opening a Ring vault for a coin costs a one-time rent, shown before you sign.</li>
      </ul>

      <h2>7. The tracker and other information</h2>
      <p>Tracker figures come from public onchain data and can be incomplete, delayed or wrong. Nothing on Crypsis is financial, investment, legal or tax advice. pump.fun coins are highly speculative and can lose all of their value.</p>

      <h2>8. Fees</h2>
      <p>Crypsis currently charges no fee of its own. You pay Solana network fees, rent for accounts created onchain, and any fees charged by pump.fun or the Ring protocol. The review screen shows them before you sign. If Crypsis ever adds a fee, it will be shown before you sign, and these terms will be updated first.</p>

      <h2>9. Risks</h2>
      <p>By using Crypsis you accept these risks:</p>
      <ul>
        <li>Crypsis has not been audited. Helius Privacy Rings is a third-party protocol; check Helius documentation for its security status.</li>
        <li>Software has bugs. A bug in Crypsis, the Ring program, its SDK, your wallet or Solana itself can cause a loss of funds.</li>
        <li>Solana transactions are final. Nobody can reverse, cancel or refund them, including us.</li>
        <li>The services Crypsis depends on can be slow, rate-limited or unavailable.</li>
        <li>Laws on privacy tools and crypto assets differ between countries and can change.</li>
      </ul>
      <p>Your private balance is recorded onchain in the Ring, not on Crypsis servers. We may change, pause or stop the interface at any time. That doesn’t move or lock anything onchain.</p>

      <h2>10. No warranty</h2>
      <p>Crypsis is provided “as is” and “as available”, without warranties of any kind, to the fullest extent the law allows. We don’t guarantee that it will be available, free of errors or fit for any purpose.</p>

      <h2>11. Limitation of liability</h2>
      <p>To the fullest extent the law allows, the people who build and operate Crypsis are not liable for any indirect, incidental, special or consequential loss, or for any loss of funds, profits or data, that arises from your use of Crypsis or of the services it relies on. Our total liability to you for any claim is limited to 100 US dollars. Nothing in these terms limits liability that can’t be limited by law.</p>

      <h2>12. Your responsibility</h2>
      <p>If someone makes a claim against us because you broke these terms or the law while using Crypsis, including over a coin you launched, you agree to cover the resulting losses and reasonable costs.</p>

      <h2>13. Changes</h2>
      <p>We may update these terms. The date at the top shows the latest version. Significant changes will also be announced on <a href={SITE.xUrl} target="_blank" rel="noopener noreferrer">X</a>. If you keep using Crypsis after a change, you accept the updated terms.</p>

      <h2>14. Other</h2>
      <p>If any part of these terms can’t be enforced, the rest still applies. If we don’t enforce a term right away, we can still enforce it later.</p>

      <h2>15. Contact</h2>
      <p>Questions about these terms: <a href={SITE.xUrl} target="_blank" rel="noopener noreferrer">@crypsisfun on X</a>.</p>
    </PageShell>
  );
}
