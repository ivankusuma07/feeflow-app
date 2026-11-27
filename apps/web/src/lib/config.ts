import { parsePublicEnv, type PublicConfig } from "@feeflow/config";

/**
 * Next.js only inlines NEXT_PUBLIC_* values that are referenced literally,
 * so each one is listed here instead of passing `process.env` through.
 */
export const config: PublicConfig = parsePublicEnv({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL,
  NEXT_PUBLIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
  NEXT_PUBLIC_SINK_IMPLEMENTATION_ADDRESS: process.env.NEXT_PUBLIC_SINK_IMPLEMENTATION_ADDRESS,
  NEXT_PUBLIC_INDEXER_URL: process.env.NEXT_PUBLIC_INDEXER_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE,
  NEXT_PUBLIC_MOCK_AUTH: process.env.NEXT_PUBLIC_MOCK_AUTH,
  NEXT_PUBLIC_DEX_SWAP_URL: process.env.NEXT_PUBLIC_DEX_SWAP_URL,
  NEXT_PUBLIC_X_URL: process.env.NEXT_PUBLIC_X_URL,
  NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
  NEXT_PUBLIC_TELEGRAM_URL: process.env.NEXT_PUBLIC_TELEGRAM_URL,
  NEXT_PUBLIC_TOS_URL: process.env.NEXT_PUBLIC_TOS_URL,
  NEXT_PUBLIC_PRIVACY_URL: process.env.NEXT_PUBLIC_PRIVACY_URL,
  NEXT_PUBLIC_DOMAIN: process.env.NEXT_PUBLIC_DOMAIN,
  NEXT_PUBLIC_KEEPER_STALE_AFTER: process.env.NEXT_PUBLIC_KEEPER_STALE_AFTER,
});

export const env = config.env;

/** External links. Unset URLs fall back to in-app pages where one exists, else are hidden. */
export const links = {
  x: env.NEXT_PUBLIC_X_URL,
  telegram: env.NEXT_PUBLIC_TELEGRAM_URL,
  docs: env.NEXT_PUBLIC_DOCS_URL ?? "/docs",
  terms: env.NEXT_PUBLIC_TOS_URL ?? "/terms",
  privacy: env.NEXT_PUBLIC_PRIVACY_URL ?? "/privacy",
  dexSwap: env.NEXT_PUBLIC_DEX_SWAP_URL,
} as const;
