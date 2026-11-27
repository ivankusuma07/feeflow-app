import type { Address } from "viem";
import { ANVIL_CHAIN_ID, ROBINHOOD_CHAIN_ID } from "./chains";
import { NATIVE_ETH, type PairAsset } from "./constants";

export interface ThirdPartyAddresses {
  ponsFactory: Address;
  /** Current escrow. Resolve per token: older tokens may use an older escrow. */
  ponsEscrow: Address;
  /** Public sweep operator: the only caller curves accept for sweeps (ADR-001 decision 4). */
  ponsSweepOperator?: Address;
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
  /**
   * Mocks from contracts/script/DeployLocal.s.sol on a fresh Anvil (deployer = account 0, nonces
   * 0-2), so the addresses are deterministic. No sweep operator: the mocks have no curves.
   */
  [ANVIL_CHAIN_ID]: {
    ponsFactory: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    ponsEscrow: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    usdg: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
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

export interface FeeFlowDeployment {
  feeFlow: Address;
  sinkImplementation: Address;
  /** Block of the deploy transaction: the indexer's start block. */
  deployBlock: number;
  deployTx: `0x${string}`;
  attester: Address;
  admin: Address;
  feeRecipient: Address;
  attesterTimelockSeconds: number;
}

/**
 * FeeFlow deployments, read back on chain after the deploy (docs/deployments.md). Apps read the
 * live address from env (NEXT_PUBLIC_CONTRACT_ADDRESS / CONTRACT_ADDRESS); this is the record.
 */
export const FEEFLOW_DEPLOYMENTS: Partial<Record<number, FeeFlowDeployment>> = {
  [ROBINHOOD_CHAIN_ID]: {
    feeFlow: "0xF7b438c70CA4a126cD4Ed0603DFa3761fcE819D2",
    sinkImplementation: "0x85b6F7cA14B61B5D38db6699Cb0CB77B23764A59",
    deployBlock: 124082737,
    deployTx: "0xc679fd784a93496369249fa299a98bf860b239866dfc5ce75e9201b2a13029f5",
    attester: "0x00f76cb42B0A5433fa6F5291fFeBa73234291b43",
    admin: "0x9F220f524b978C45b246fde763b460FE3fAfd1bf",
    feeRecipient: "0x9F220f524b978C45b246fde763b460FE3fAfd1bf",
    attesterTimelockSeconds: 172800,
  },
};
