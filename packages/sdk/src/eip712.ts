import type { Address } from "./types";

/**
 * EIP-712 definitions matching FeeFlow.sol. The domain is ("FeeFlow", "1", chainId, contract);
 * a signature for another chain or contract fails `InvalidAttestation`.
 */
export function feeFlowDomain(chainId: number, verifyingContract: Address) {
  return { name: "FeeFlow", version: "1", chainId, verifyingContract } as const;
}

/** Signed by the creator's wallet in the /route flow. Free, no gas. */
export const routeTypes = {
  Route: [
    { name: "token", type: "address" },
    { name: "xUserId", type: "uint64" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Signed by the attestation service: the X user id exists (not ownership). */
export const registerTypes = {
  Register: [
    { name: "token", type: "address" },
    { name: "xUserId", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

/** Signed by the attestation service after verifying the Privy identity token. */
export const claimTypes = {
  Claim: [
    { name: "xUserId", type: "uint64" },
    { name: "to", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export const exitTypes = {
  Exit: [
    { name: "xUserId", type: "uint64" },
    { name: "token", type: "address" },
    { name: "newRecipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

/** What the attestation API returns; passed straight into the contract call. */
export interface Attestation {
  xUserId: string;
  nonce: string;
  expiry: number;
  signature: `0x${string}`;
}
