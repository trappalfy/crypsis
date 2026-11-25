import { describe, expect, it } from "vitest";
import { capabilities, isUserRejection, walletRefusedEnvelope, WalletCapabilityError } from "./wallet-standard";

describe("wallet refusal vs user rejection", () => {
  it("treats Phantom's envelope refusal as a wallet refusal (→ Mode B)", () => {
    const e = new Error("You cannot sign solana transactions using sign message");
    expect(isUserRejection(e)).toBe(false);
    expect(walletRefusedEnvelope(e)).toBe(true);
  });
  it("treats a rewritten message as a refusal", () => {
    expect(walletRefusedEnvelope(new WalletCapabilityError("MESSAGE_ALTERED", "x"))).toBe(true);
  });
  it("never treats the person's 'no' as a refusal", () => {
    for (const e of [Object.assign(new Error("whatever"), { code: 4001 }), new Error("User rejected the request."), new Error("Approval Denied"), new Error("Request cancelled")]) {
      expect(isUserRejection(e)).toBe(true);
      expect(walletRefusedEnvelope(e)).toBe(false);
    }
  });
  it("never treats a timeout or a non-deterministic wallet as a refusal", () => {
    expect(walletRefusedEnvelope(new WalletCapabilityError("NO_RESPONSE", "x"))).toBe(false);
    expect(walletRefusedEnvelope(new WalletCapabilityError("NONDETERMINISTIC", "x"))).toBe(false);
  });
});

describe("direct mode", () => {
  const wallet = (name: string, versions: (string | number)[]) => ({
    name, icon: "data:,", version: "1.0.0", chains: ["solana:mainnet"], accounts: [],
    features: { "standard:connect": {}, "solana:signMessage": {}, "solana:signTransaction": { supportedTransactionVersions: versions } },
  }) as never;
  it("Phantom goes straight to a Crypsis vault even though it declares v1", () => {
    expect(capabilities(wallet("Phantom", ["legacy", 0, 1])).signsV1).toBe(true);
    expect(capabilities(wallet("Phantom", ["legacy", 0, 1])).directMode).toBe(false);
  });
  it("other v1 wallets are offered Mode A; wallets without v1 are not", () => {
    expect(capabilities(wallet("Solflare", ["legacy", 0, 1])).directMode).toBe(true);
    expect(capabilities(wallet("MetaMask", ["legacy", 0])).directMode).toBe(false);
  });
});
