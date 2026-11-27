import { describe, expect, it } from "vitest";
import { splitGross } from "./constants";
import { apiEnvSchema, ConfigError, parsePublicEnv, parseServerEnv, privyAttesterEnv } from "./env";

describe("parsePublicEnv", () => {
  it("defaults to mainnet and the indexer data source", () => {
    const cfg = parsePublicEnv({});
    expect(cfg.env.NEXT_PUBLIC_CHAIN_ID).toBe(4663);
    expect(cfg.env.NEXT_PUBLIC_DATA_SOURCE).toBe("indexer");
    expect(cfg.isLive).toBe(false);
  });

  it("treats blank values as unset", () => {
    const cfg = parsePublicEnv({ NEXT_PUBLIC_CONTRACT_ADDRESS: "  ", NEXT_PUBLIC_INDEXER_URL: "" });
    expect(cfg.env.NEXT_PUBLIC_CONTRACT_ADDRESS).toBeUndefined();
    expect(cfg.isLive).toBe(false);
  });

  it("is live only when contract and indexer are both set", () => {
    const cfg = parsePublicEnv({
      NEXT_PUBLIC_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
      NEXT_PUBLIC_INDEXER_URL: "https://api.example.org",
    });
    expect(cfg.isLive).toBe(true);
  });

  it("rejects the mock data source in production", () => {
    expect(() =>
      parsePublicEnv({ NODE_ENV: "production", NEXT_PUBLIC_DATA_SOURCE: "mock" }),
    ).toThrow(ConfigError);
  });

  it("rejects the mock login in production, allows it in development", () => {
    expect(() => parsePublicEnv({ NODE_ENV: "production", NEXT_PUBLIC_MOCK_AUTH: "1" })).toThrow(
      ConfigError,
    );
    expect(
      parsePublicEnv({ NODE_ENV: "development", NEXT_PUBLIC_MOCK_AUTH: "1" }).env
        .NEXT_PUBLIC_MOCK_AUTH,
    ).toBe("1");
  });

  it("rejects unsupported chains and bad addresses", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_CHAIN_ID: "1" })).toThrow(ConfigError);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_CONTRACT_ADDRESS: "0x123" })).toThrow(ConfigError);
  });
});

describe("splitGross", () => {
  it("takes exactly 1% rounded down, like the contract", () => {
    expect(splitGross(10_000n)).toEqual({ fee: 100n, net: 9_900n });
    expect(splitGross(99n)).toEqual({ fee: 0n, net: 99n });
    expect(splitGross(52_630_000n)).toEqual({ fee: 526_300n, net: 52_103_700n });
  });
});

describe("privyAttesterEnv", () => {
  const base = {
    CHAIN_ID: "4663",
    CONTRACT_ADDRESS: "0x00000000000000000000000000000000000000aa",
    PRIVY_APP_ID: "app",
    PRIVY_APP_SECRET: "secret",
    CORS_ORIGIN: "https://example.test",
  };
  const parse = (extra: Record<string, string>) =>
    privyAttesterEnv(parseServerEnv(apiEnvSchema, { ...base, ...extra }, "api"));

  it("is off when nothing is set, and needs all three settings together", () => {
    expect(parse({})).toBeUndefined();
    expect(() => parse({ ATTESTER_PRIVY_WALLET_ID: "w" })).toThrow(/go together/);
    expect(
      parse({
        ATTESTER_PRIVY_WALLET_ID: "w",
        ATTESTER_PRIVY_AUTH_KEY: "k",
        ATTESTER_ADDRESS: "0x00000000000000000000000000000000000000bb",
      }),
    ).toEqual({
      walletId: "w",
      authorizationKey: "k",
      expectedAddress: "0x00000000000000000000000000000000000000bb",
    });
  });
});
