import type { Address } from "viem";
import { ROBINHOOD_CHAIN_ID } from "./chains.js";

export interface ThirdPartyAddresses {
  ponsFactory: Address;
  /** Current escrow. Resolve per token: older tokens may use an older escrow. */
  ponsEscrow: Address;
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
    usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  },
};
