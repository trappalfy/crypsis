// A Wallet Standard wallet for Playwright, injected with page.addInitScript. Test-only, devnet only.
// Ed25519 via WebCrypto. Options let tests simulate wallets that sign non-deterministically or can't sign v1.
import type { Page } from "@playwright/test";

export interface TestWalletOptions {
  /** 32-byte Ed25519 seed (hex). Random when omitted. */
  seedHex?: string;
  nondeterministic?: boolean;
  noV1?: boolean;
  /** Refuse to sign off-chain message envelopes (`\xffsolana offchain`), like Phantom does. */
  refuseEnvelope?: boolean;
  name?: string;
}

export async function injectTestWallet(page: Page, opts: TestWalletOptions = {}) {
  await page.addInitScript((o: TestWalletOptions) => {
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const b58 = (bytes: Uint8Array) => {
      let n = 0n;
      for (const b of bytes) n = n * 256n + BigInt(b);
      let s = "";
      while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
      for (const b of bytes) { if (b === 0) s = "1" + s; else break; }
      return s;
    };
    const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
    // PKCS8 wrapper for a raw Ed25519 seed
    const pkcs8 = (seed: Uint8Array) => { const p = hex("302e020100300506032b657004220420"); const out = new Uint8Array(48); out.set(p); out.set(seed, 16); return out; };
    const shortvec = (bytes: Uint8Array, off: number) => { let len = 0, size = 0; for (;;) { const b = bytes[off + size]; len |= (b & 0x7f) << (7 * size); size++; if (!(b & 0x80)) break; } return { len, size }; };

    const ready = (async () => {
      const seed = o.seedHex ? hex(o.seedHex) : crypto.getRandomValues(new Uint8Array(32));
      const priv = await crypto.subtle.importKey("pkcs8", pkcs8(seed), { name: "Ed25519" }, true, ["sign"]);
      const jwk = await crypto.subtle.exportKey("jwk", priv);
      const pub = Uint8Array.from(atob(jwk.x!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const sign = async (m: Uint8Array) => new Uint8Array(await crypto.subtle.sign("Ed25519", priv, m));
      const address = b58(pub);
      const chains = ["solana:devnet", "solana:mainnet"] as const;
      const account = { address, publicKey: pub, chains, features: ["solana:signMessage", "solana:signTransaction"] };
      (window as unknown as { __testWallet: unknown }).__testWallet = { address };
      const wallet = {
        version: "1.0.0",
        name: o.name ?? "Crypsis Test Wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjRUM2QzQwIi8+PC9zdmc+",
        chains,
        accounts: [account],
        features: {
          "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
          "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
          "standard:events": { version: "1.0.0", on: () => () => {} },
          "solana:signMessage": {
            version: "1.0.0",
            signMessage: async (...inputs: { message: Uint8Array }[]) =>
              Promise.all(inputs.map(async ({ message }) => {
                if (o.refuseEnvelope && message[0] === 0xff) throw new Error("You cannot sign solana transactions using sign message");
                return { signedMessage: message, signature: o.nondeterministic ? crypto.getRandomValues(new Uint8Array(64)) : await sign(message) };
              })),
          },
          "solana:signTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: o.noV1 ? ["legacy", 0] : ["legacy", 0, 1],
            signTransaction: async (...inputs: { transaction: Uint8Array }[]) =>
              Promise.all(inputs.map(async ({ transaction }) => {
                const out = transaction.slice();
                if ((transaction[0] & 0x80) && (transaction[0] & 0x7f) === 1) {
                  // v1 wire: message || signatures; required signers in header byte 1
                  if (o.noV1) throw new Error("Unsupported transaction version");
                  const n = transaction[1];
                  const msg = transaction.subarray(0, transaction.length - 64 * n);
                  out.set(await sign(msg), msg.length); // our account is the fee payer = first signer
                  return { signedTransaction: out };
                }
                const { len, size } = shortvec(transaction, 0);
                const msg = transaction.subarray(size + 64 * len);
                out.set(await sign(msg), size);
                return { signedTransaction: out };
              })),
          },
        },
      };
      const register = (api: { register: (w: unknown) => void }) => api.register(wallet);
      window.addEventListener("wallet-standard:app-ready", (e) => register((e as CustomEvent).detail));
      window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
    })();
    (window as unknown as { __testWalletReady: Promise<void> }).__testWalletReady = ready;
  }, opts);
}
