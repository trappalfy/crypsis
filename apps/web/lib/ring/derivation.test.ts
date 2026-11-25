import { describe, expect, it } from "vitest";
import { ed25519DerivationMessage, isDerivationInput } from "@heliuslabs/spr/keypair";
import { derivationMessage, vaultMessage } from "./derivation";

describe("off-chain derivation envelopes", () => {
  it("Mode A message is byte-identical to the SDK", async () => {
    for (let i = 0; i < 5; i++) {
      const pub = crypto.getRandomValues(new Uint8Array(32));
      expect(Buffer.from(await derivationMessage(pub)).toString("hex")).toBe(Buffer.from(ed25519DerivationMessage(pub as never)).toString("hex"));
    }
  });
  it("Mode B vault message is NOT a Ring derivation input (separate key domain)", () => {
    expect(isDerivationInput(vaultMessage())).toBe(false);
  });
});

describe("vault message", () => {
  it("is plain UTF-8 text, not an off-chain envelope (Phantom refuses to sign the envelope)", async () => {
    const { VAULT_DERIVATION_PAYLOAD } = await import("./derivation");
    const m = vaultMessage();
    expect(m[0]).not.toBe(0xff);
    expect(new TextDecoder().decode(m)).toBe(VAULT_DERIVATION_PAYLOAD);
  });
  it("is printable ASCII and warns about phishing", async () => {
    const { VAULT_DERIVATION_PAYLOAD } = await import("./derivation");
    expect(/^[\x20-\x7e]+$/.test(VAULT_DERIVATION_PAYLOAD)).toBe(true);
    expect(VAULT_DERIVATION_PAYLOAD).toContain("Only sign this on https://crypsis.fun");
  });
});
