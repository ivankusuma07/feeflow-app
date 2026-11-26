import type { Address } from "viem";
import { ROBINHOOD_CHAIN_ID } from "./chains";
import { NATIVE_ETH, type PairAsset } from "./constants";

export interface ThirdPartyAddresses {
  ponsFactory: Address;
  /** Current escrow. Resolve per token: older tokens may use an older escrow. */
  ponsEscrow: Address;
  /** Public sweep operator: the only caller curves accept for sweeps (ADR-001 decision 4). */
  ponsSweepOperator: Address;
  usdg: Address;
}

/**
 * Third-party addresses on Robinhood Chain mainnet (4663).
 * Status (docs/placeholders.md): re-verify against docs.ponsfamily.com/v2,
 * Paxos docs and the explorer on deploy day.
 */
export const THIRD_PARTY_ADDRESSES: Partial<Record<number, ThirdPartyAddresses>> = {
  [ROBINHOOD_CHAIN_ID]: {
    ponsFactory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
    ponsEscrow: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e",
    ponsSweepOperator: "0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83",
    usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  },
};

/**
 * Pair assets the app knows by name on a chain: native ETH and USDG. Tokens paired with any other
 * ERC-20 still work; their symbol and decimals are read from the token contract.
 */
export function knownPairAssets(chainId: number): PairAsset[] {
  const usdg = THIRD_PARTY_ADDRESSES[chainId]?.usdg;
  return usdg ? [NATIVE_ETH, { address: usdg, symbol: "USDG", decimals: 6 }] : [NATIVE_ETH];
}
