import {
  DEFAULT_RPC_URLS,
  isSupportedChainId,
  makeChain,
  type SupportedChainId,
} from "@feeflow/config";
import type { Chain } from "viem";
import { env } from "./config";

const chainId = env.NEXT_PUBLIC_CHAIN_ID;
if (!isSupportedChainId(chainId)) throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID ${chainId}`);

export const APP_CHAIN_ID: SupportedChainId = chainId;

/** RPC for reads and wallet writes; null when neither env nor a verified default exists. */
export const rpcUrl: string | null = env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_RPC_URLS[chainId] ?? null;

export const appChain: Chain = makeChain(chainId, {
  rpcUrl: rpcUrl ?? "http://127.0.0.1:8545",
  explorerUrl: env.NEXT_PUBLIC_EXPLORER_URL,
});

const explorer = env.NEXT_PUBLIC_EXPLORER_URL?.replace(/\/$/, "");

/** Explorer links, or null when no explorer is configured (links are then hidden). */
export const explorerTxUrl = (hash: string): string | null =>
  explorer ? `${explorer}/tx/${hash}` : null;
export const explorerAddressUrl = (address: string): string | null =>
  explorer ? `${explorer}/address/${address}` : null;
