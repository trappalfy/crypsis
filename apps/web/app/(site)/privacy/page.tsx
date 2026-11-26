import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/site/PageShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy", description: "What data crypsis.fun and the Crypsis app handle, and where it goes." };

const PRIVACY_UPDATED = "26 November 2026";

export default function Privacy() {
  return (
    <PageShell kicker="Privacy" title="Privacy policy">
      <p>Last updated: {PRIVACY_UPDATED}</p>
      <p>Crypsis has no user accounts, no analytics, no ads and no tracking cookies. Your keys and your private balance stay in your browser. Crypsis servers see ordinary web requests and public onchain data. The details are below.</p>
      <p>This policy covers crypsis.fun and the Crypsis app (“Crypsis”, “we”, “us”). How the product protects transfers onchain is described in the <Link href="/privacy-model">privacy model</Link>.</p>

      <h2>1. What stays in your browser</h2>
      <ul>
        <li><strong>Your private keys.</strong> They are derived from a wallet signature and kept in memory, in a separate worker. Locking the app, 15 minutes without activity, or closing the tab wipes them. The signature and the keys are never sent to Crypsis servers.</li>
        <li><strong>An encrypted copy of your private balance and history.</strong> It is stored in your browser’s IndexedDB, encrypted with a key derived from your signature. It is stored under a hash of your address, not the address itself.</li>
        <li><strong>A few settings</strong> in your browser’s local storage: the name of the last wallet you connected, whether you use it directly or through a Crypsis vault, and whether it passed the signature consistency check.</li>
      </ul>
      <p>You can delete all of this in your browser settings at any time. That doesn’t affect your funds: your balance can be read again from the chain with your keys.</p>

      <h2>2. What Crypsis servers receive</h2>
      <ul>
        <li><strong>Ordinary request data.</strong> When you open a page, our hosting provider, Vercel, processes your IP address, browser type, the page requested and the time, to deliver the site and protect it from abuse. Vercel keeps these logs under its own policy. Our own code doesn’t log IP addresses or wallet addresses. Rate limits use short-lived counters in memory that are not stored.</li>
        <li><strong>Tracker requests.</strong> The app loads coin and tracker data from our API with plain requests that don’t include your wallet address.</li>
        <li><strong>Coin launches.</strong> When you launch a coin, the name, ticker, description, image and links you enter pass through our server to Pinata, which publishes them on IPFS. We don’t keep a copy. After the launch, the app sends our server the coin’s address and the transaction signatures. The server checks them onchain and adds the coin to the tracker.</li>
      </ul>
      <p>Crypsis servers never receive your wallet signature, your private keys, your private balance or your private history.</p>

      <h2>3. What the tracker stores</h2>
      <p>Only public onchain data: coins with Ring vaults, vault balances and supply, public deposits and withdrawals with the addresses and amounts the chain shows, and coins launched through Crypsis with their creator address and transactions. Anyone can read the same data from Solana.</p>

      <h2>4. What your browser sends to others directly</h2>
      <ul>
        <li><strong>Helius.</strong> The app talks to Helius’s Solana RPC, its Ring indexer and its Ring prover to read accounts, fetch encrypted Ring state, generate proofs and send transactions. Helius sees your IP address and the addresses and transactions involved. Requests to the prover are encrypted to a hardware-isolated enclave (AWS Nitro) that the app verifies first. Helius’s own privacy policy applies.</li>
        <li><strong>Your wallet.</strong> Your wallet extension or app handles connection and signing under its own policy.</li>
        <li><strong>Coin images.</strong> Images are loaded from a public IPFS gateway (ipfs.io), which sees your IP address.</li>
        <li><strong>Links you open.</strong> pump.fun, Solscan, X and other sites have their own policies.</li>
      </ul>

      <h2>5. Onchain data is public and permanent</h2>
      <p>Everything written to Solana is public and can’t be deleted by anyone, including us: addresses, deposits, withdrawals, activations, vault funding, coin launches and their metadata. Inside a Ring transfer, the coin, the amount and the memo are encrypted. The addresses are not.</p>

      <h2>6. Cookies</h2>
      <p>Crypsis uses no tracking or advertising cookies. While access to the site is restricted, one strictly necessary cookie remembers that you entered the access key, for up to 30 days. No other cookies are set.</p>

      <h2>7. Your rights</h2>
      <p>Depending on where you live, you may have the right to ask what personal data we hold about you, to have it corrected or deleted, to object to its use, and to complain to your data protection authority. We hold almost nothing that identifies you: no accounts, no emails, no names. To exercise a right, contact us. We can’t delete or change data on the blockchain or on IPFS.</p>
      <p>Where the law requires a legal basis, we process request data on the basis of our legitimate interest in running the site securely, and launch metadata on the basis that you asked us to publish it.</p>

      <h2>8. Children</h2>
      <p>Crypsis is not for anyone under 18.</p>

      <h2>9. Changes</h2>
      <p>We may update this policy. The date at the top shows the latest version. Significant changes will also be announced on <a href={SITE.xUrl} target="_blank" rel="noopener noreferrer">X</a>.</p>

      <h2>10. Contact</h2>
      <p>Questions about privacy: <a href={SITE.xUrl} target="_blank" rel="noopener noreferrer">@crypsisfun on X</a>.</p>
    </PageShell>
  );
}
