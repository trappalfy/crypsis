import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("error mapping (brief §8.4)", () => {
  it.each([
    [{ codes: ["WALLET_BUILD_TRANSFER", "WALLET_RECIPIENT_NOT_REGISTERED"] }, "This address hasn't activated Crypsis yet."],
    [{ codes: ["WALLET_BUILD_REGISTRATION", "WALLET_USER_RECORD_KEYS_MISMATCH"] }, "This wallet is registered with different private keys."],
    [{ codes: ["WALLET_SNAPSHOT"] }, "Local data looks damaged. Resyncing from chain."],
    [{ codes: ["CLIENT_PROVING_KEY_SET"] }, "The Ring prover is unavailable right now. Try again in a minute."],
    [{ codes: ["CLIENT_PROVER_TEE_ATTESTATION"] }, "The Ring prover is unavailable right now. Try again in a minute."],
    [{ codes: [], custom: 7039 }, "This coin can't enter the Ring."],
    [{ codes: ["NO_V1"] }, "Your wallet can't sign Ring transactions yet. Switch to a Crypsis vault to continue."],
    [{ codes: ["NONDETERMINISTIC"] }, "This wallet can't derive stable private keys."],
    [{ codes: ["SOLANA_-32002", "SOLANA_7050006", "INSUFFICIENT_SOL"] }, "Not enough SOL to pay the network fee."],
    [{ codes: ["WALLET_SYNC", "CLIENT_REQUEST", "API_REQUEST"] }, "The Ring indexer is unavailable right now. Try again in a minute."],
    [{ codes: ["WALLET_ALTERED_TX"] }, "Your wallet changed this Ring transaction, so it can't be sent. Try a Crypsis vault."],
    [{ codes: ["CLIENT_RPC"] }, "The Solana network is busy or unreachable right now. Try again in a moment."],
    [{ codes: ["SOLANA_8100002"], message: "HTTP error (429): Too Many Requests" }, "The Solana network is busy or unreachable right now. Try again in a moment."],
    [{ codes: ["CLIENT_RPC", "SOLANA_-32002", "INSUFFICIENT_SOL"] }, "Not enough SOL to pay the network fee."],
    [{ codes: ["NO_RESPONSE"] }, "Your wallet didn't respond. Open it and try again."],
  ])("%j", (input, message) => {
    expect(friendlyError(input).message).toBe(message);
  });
  it("offers Mode B when v1 is unsupported, invite when recipient is not registered", () => {
    expect(friendlyError({ codes: ["NO_V1"] }).action).toBe("modeB");
    expect(friendlyError({ codes: ["WALLET_RECIPIENT_NOT_REGISTERED"] }).action).toBe("invite");
  });
});
