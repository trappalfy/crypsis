import { describe, expect, it } from "vitest";
import { apiKeyFromUrl, keyedServiceConfig } from "./api-key";

const INDEXER = "https://dgcj4pjarvo65.cloudfront.net";
const PROVER = "https://d3ky2kt0ntqxt1.cloudfront.net";

describe("apiKeyFromUrl", () => {
  it("reads the Helius key from an RPC URL", () => {
    expect(apiKeyFromUrl("https://mainnet.helius-rpc.com/?api-key=abc-123")).toBe("abc-123");
  });
  it("returns undefined without a key, for an empty key and for junk", () => {
    expect(apiKeyFromUrl("https://api.mainnet-beta.solana.com")).toBeUndefined();
    expect(apiKeyFromUrl("https://mainnet.helius-rpc.com/?api-key=")).toBeUndefined();
    expect(apiKeyFromUrl("not a url")).toBeUndefined();
    expect(apiKeyFromUrl(undefined)).toBeUndefined();
  });
});

describe("keyedServiceConfig", () => {
  it("sends the key to the indexer as apiKey and to the prover in its URL", () => {
    const c = keyedServiceConfig({ indexerUrl: INDEXER, proverUrl: PROVER, apiKey: "k1" });
    expect(c.apiKey).toBe("k1");
    expect(c.indexerUrl).toBe(INDEXER);
    expect(new URL(c.proverUrl!).searchParams.get("api-key")).toBe("k1");
  });
  it("leaves URLs that already carry a key alone and never gives the indexer two key sources", () => {
    const c = keyedServiceConfig({ indexerUrl: `${INDEXER}/?api-key=own`, proverUrl: `${PROVER}/?api-key=own`, apiKey: "k1" });
    expect(c.apiKey).toBeUndefined();
    expect(c.indexerUrl).toBe(`${INDEXER}/?api-key=own`);
    expect(c.proverUrl).toBe(`${PROVER}/?api-key=own`);
  });
  it("changes nothing without a key", () => {
    expect(keyedServiceConfig({ indexerUrl: INDEXER, proverUrl: PROVER })).toEqual({ indexerUrl: INDEXER, proverUrl: PROVER });
  });
  it("adds nothing when the SDK derives both services from the Helius RPC URL (its key rides along)", () => {
    expect(keyedServiceConfig({ apiKey: "k1" })).toEqual({});
  });
  it("keys only the service that was overridden", () => {
    const c = keyedServiceConfig({ proverUrl: PROVER, apiKey: "k1" });
    expect(c.apiKey).toBeUndefined();
    expect(c.indexerUrl).toBeUndefined();
    expect(new URL(c.proverUrl!).searchParams.get("api-key")).toBe("k1");
  });
});
