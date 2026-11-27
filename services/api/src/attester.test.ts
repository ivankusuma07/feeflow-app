import { claimTypes, feeFlowDomain } from "@feeflow/sdk";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { loadAttester, privyAttester, type PrivyWallets } from "./attester";

// Anvil accounts 1 and 2: public test keys.
const KEY: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const OTHER: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const account = privateKeyToAccount(KEY);
const WALLET_ID = "wallet-1";
const AUTH_KEY = "authorization-key";

const def = {
  domain: feeFlowDomain(4663, getAddress("0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9")),
  types: claimTypes,
  primaryType: "Claim" as const,
  message: {
    xUserId: 1000000000n,
    to: getAddress("0x00000000000000000000000000000000000000bb"),
    nonce: 1n,
    expiry: 1_800_000_000n,
  },
};

/** A Privy client stand-in: answers wallets().get and returns `signature` for typed data. */
function stubPrivy(opts: { address?: string; chainType?: string; signature: () => Promise<Hex> }) {
  const signTypedData = vi.fn(async (_id: string, _body: unknown) => ({
    signature: await opts.signature(),
    encoding: "hex",
  }));
  const client = {
    wallets: () => ({
      get: async (id: string) => {
        if (id !== WALLET_ID) throw new Error("not found");
        return {
          id,
          address: opts.address ?? account.address,
          chain_type: opts.chainType ?? "ethereum",
        };
      },
      ethereum: () => ({ signTypedData }),
    }),
  } as unknown as PrivyWallets;
  return { client, signTypedData };
}

const options = (client: PrivyWallets) => ({
  privy: client,
  walletId: WALLET_ID,
  authorizationKey: AUTH_KEY,
  expectedAddress: account.address,
});

describe("privyAttester", () => {
  it("signs through the Privy wallet with the authorization key", async () => {
    const { client, signTypedData } = stubPrivy({ signature: () => account.signTypedData(def) });
    const attester = await privyAttester(options(client));
    expect(attester.address).toBe(account.address);
    expect(await attester.signTypedData(def)).toBe(await account.signTypedData(def));

    const [walletId, body] = signTypedData.mock.calls[0]!;
    expect(walletId).toBe(WALLET_ID);
    expect(body).toMatchObject({
      authorization_context: { authorization_private_keys: [AUTH_KEY] },
      params: { typed_data: { primary_type: "Claim", domain: { chainId: 4663 } } },
    });
  });

  it("refuses to boot when the wallet is not the deployed attester", async () => {
    const other = privateKeyToAccount(OTHER).address;
    const { client } = stubPrivy({ address: other, signature: async () => "0x" });
    await expect(privyAttester(options(client))).rejects.toThrow(/ATTESTER_ADDRESS/);
    const sol = stubPrivy({ chainType: "solana", signature: async () => "0x" });
    await expect(privyAttester(options(sol.client))).rejects.toThrow(/not an Ethereum wallet/);
  });

  it("never returns a signature from another key", async () => {
    const wrong = privateKeyToAccount(OTHER);
    const { client } = stubPrivy({ signature: () => wrong.signTypedData(def) });
    const attester = await privyAttester(options(client));
    await expect(attester.signTypedData(def)).rejects.toThrow(/expected/);
  });

  it("passes Privy errors through (a policy denial is not swallowed)", async () => {
    const { client } = stubPrivy({
      signature: async () => {
        throw new Error("Policy violation");
      },
    });
    const attester = await privyAttester(options(client));
    await expect(attester.signTypedData(def)).rejects.toThrow(/Policy violation/);
  });
});

describe("loadAttester", () => {
  it("refuses a raw key in production and uses it in development", async () => {
    await expect(loadAttester({ nodeEnv: "production", key: KEY })).rejects.toThrow(
      /refused in production/,
    );
    expect((await loadAttester({ nodeEnv: "development", key: KEY })).address).toBe(
      account.address,
    );
  });

  it("uses the Privy wallet when configured, in any environment", async () => {
    const { client } = stubPrivy({ signature: () => account.signTypedData(def) });
    const attester = await loadAttester({
      nodeEnv: "production",
      key: undefined,
      privy: {
        client,
        walletId: WALLET_ID,
        authorizationKey: AUTH_KEY,
        expectedAddress: account.address,
      },
    });
    expect(attester.address).toBe(account.address);
  });
});
