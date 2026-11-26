import type { Address, Hex, TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Signs FeeFlow attestations. Production signs through KMS (brief §Stage 4); the raw-key signer
 * exists for local development and tests only, and `loadAttester` refuses it in production.
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

export function loadAttester(opts: {
  nodeEnv: string;
  key: Hex | undefined;
  kmsKeyId: string | undefined;
}): Attester {
  if (opts.kmsKeyId) {
    throw new Error("ATTESTER_KMS_KEY_ID is set, but the KMS signer is not implemented yet.");
  }
  if (opts.nodeEnv === "production") {
    throw new Error("A raw ATTESTER_KEY is refused in production: configure ATTESTER_KMS_KEY_ID.");
  }
  if (!opts.key) throw new Error("ATTESTER_KEY is required in development.");
  return localAttester(opts.key);
}
