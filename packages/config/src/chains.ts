import { defineChain, type Chain } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const ANVIL_CHAIN_ID = 31337;

export type SupportedChainId =
  typeof ROBINHOOD_CHAIN_ID | typeof ROBINHOOD_TESTNET_CHAIN_ID | typeof ANVIL_CHAIN_ID;

export const SUPPORTED_CHAIN_IDS: readonly SupportedChainId[] = [
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ANVIL_CHAIN_ID,
];

export function isSupportedChainId(id: number): id is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(id);
}

export function chainName(chainId: SupportedChainId): string {
  switch (chainId) {
    case ROBINHOOD_CHAIN_ID:
      return "Robinhood Chain";
    case ROBINHOOD_TESTNET_CHAIN_ID:
      return "Robinhood Chain Testnet";
    case ANVIL_CHAIN_ID:
      return "Anvil";
  }
}

interface ChainUrls {
  rpcUrl: string;
  explorerUrl?: string | undefined;
}

/**
 * RPC and explorer URLs are open placeholders in the brief (`RPC_URL`,
 * `EXPLORER_URL`), so the chain definition is built from config rather than
 * hard-coded.
 */
export function makeChain(chainId: SupportedChainId, urls: ChainUrls): Chain {
  const name = chainName(chainId);
  return defineChain({
    id: chainId,
    name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [urls.rpcUrl] } },
    ...(urls.explorerUrl
      ? { blockExplorers: { default: { name: `${name} explorer`, url: urls.explorerUrl } } }
      : {}),
    testnet: chainId !== ROBINHOOD_CHAIN_ID,
  });
}

/**
 * Public RPC used when `NEXT_PUBLIC_RPC_URL` is unset. Robinhood Chain's public endpoint was
 * verified on 25 Nov 2026 (`eth_chainId` = 4663, Pons contracts present; recent state only).
 * Production should set a paid provider. The testnet has no default: no Pons deployment exists.
 */
export const DEFAULT_RPC_URLS: Partial<Record<SupportedChainId, string>> = {
  [ROBINHOOD_CHAIN_ID]: "https://rpc.mainnet.chain.robinhood.com",
  [ANVIL_CHAIN_ID]: "http://127.0.0.1:8545",
};
