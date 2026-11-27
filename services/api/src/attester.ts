import type { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import {
  getAddress,
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Signs FeeFlow attestations. Production signs through a Privy server wallet: the secp256k1 key
 * stays in Privy's secure enclave and this service holds only a P-256 authorization key, which
 * Privy lets sign nothing but FeeFlow typed data (scripts/privy-attester.ts sets the policy).
 * The raw-key signer exists for local development and tests only; production refuses it.
 */
export interface Attester {
  readonly address: Address;
  signTypedData(def: TypedDataDefinition): Promise<Hex>;
}

export function localAttester(key: Hex): Attester {
  const account = privateKeyToAccount(key);
  return {
    address: account.address,
    signTypedData: (def) => account.signTypedData(def),
  };
}

/** The subset of the Privy client the attester uses (a stub in tests). */
export type PrivyWallets = Pick<PrivyClient, "wallets">;

export interface PrivyAttesterOptions {
  privy: PrivyWallets;
  walletId: string;
  /** Base64 PKCS#8 P-256 key of the wallet's policy-restricted signer. */
  authorizationKey: string;
  /** The address the contract trusts; boot fails if the wallet is a different one. */
  expectedAddress: Address;
}

export async function privyAttester(opts: PrivyAttesterOptions): Promise<Attester> {
  const wallet = await opts.privy.wallets().get(opts.walletId);
  if (wallet.chain_type !== "ethereum") {
    throw new Error(`Privy wallet ${opts.walletId} is not an Ethereum wallet.`);
  }
  const address = getAddress(wallet.address);
  if (!isAddressEqual(address, opts.expectedAddress)) {
    throw new Error(
      `Privy wallet ${opts.walletId} is ${address}, but ATTESTER_ADDRESS is ${opts.expectedAddress}.`,
    );
  }
  const account = createViemAccount(opts.privy as PrivyClient, {
    walletId: opts.walletId,
    address,
    authorizationContext: { authorization_private_keys: [opts.authorizationKey] },
  });
  return {
    address,
    async signTypedData(def) {
      const signature = await account.signTypedData(def);
      // Never hand out a signature the contract would reject.
      const signer = await recoverTypedDataAddress({ ...def, signature });
      if (!isAddressEqual(signer, address)) {
        throw new Error(`Privy returned a signature from ${signer}, expected ${address}.`);
      }
      return signature;
    },
  };
}

export interface LoadAttesterOptions {
  nodeEnv: string;
  key: Hex | undefined;
  privy?: Omit<PrivyAttesterOptions, "privy"> & { client: PrivyWallets };
}

export async function loadAttester(opts: LoadAttesterOptions): Promise<Attester> {
  if (opts.privy) {
    const { client, ...rest } = opts.privy;
    return privyAttester({ privy: client, ...rest });
  }
  if (opts.nodeEnv === "production") {
    throw new Error(
      "A raw ATTESTER_KEY is refused in production: configure the Privy attester " +
        "(ATTESTER_PRIVY_WALLET_ID, ATTESTER_PRIVY_AUTH_KEY, ATTESTER_ADDRESS).",
    );
  }
  if (!opts.key) throw new Error("ATTESTER_KEY is required in development.");
  return localAttester(opts.key);
}
