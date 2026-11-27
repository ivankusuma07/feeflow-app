import { isAddress, type Address } from "viem";
import { z } from "zod";
import { isSupportedChainId, type SupportedChainId } from "./chains";

/** Treats "" as unset, so blank lines in .env files do not count as values. */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const optionalUrl = optionalString.refine((v) => v === undefined || URL.canParse(v), {
  message: "must be a valid URL",
});

const optionalAddress = optionalString
  .refine((v) => v === undefined || isAddress(v), { message: "must be a 0x address" })
  .transform((v) => v as Address | undefined);

const chainId = z.coerce
  .number()
  .int()
  .refine(isSupportedChainId, { message: "unsupported chain id" })
  .transform((v) => v as SupportedChainId);

const nodeEnv = z.enum(["development", "test", "production"]).default("development");

export const DATA_SOURCES = ["mock", "indexer"] as const;
export type DataSourceKind = (typeof DATA_SOURCES)[number];

/** Public (browser-safe) config for apps/web. Every value here ships to the client. */
export const publicEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  NEXT_PUBLIC_CHAIN_ID: chainId.default(4663),
  NEXT_PUBLIC_RPC_URL: optionalUrl,
  NEXT_PUBLIC_EXPLORER_URL: optionalUrl,
  NEXT_PUBLIC_CONTRACT_ADDRESS: optionalAddress,
  NEXT_PUBLIC_SINK_IMPLEMENTATION_ADDRESS: optionalAddress,
  NEXT_PUBLIC_INDEXER_URL: optionalUrl,
  NEXT_PUBLIC_API_URL: optionalUrl,
  NEXT_PUBLIC_PRIVY_APP_ID: optionalString,
  NEXT_PUBLIC_DATA_SOURCE: z.enum(DATA_SOURCES).default("indexer"),
  /** "1" enables the dev-only mock X login with the indexer source (Anvil e2e). Never in production. */
  NEXT_PUBLIC_MOCK_AUTH: z.enum(["0", "1"]).optional(),
  NEXT_PUBLIC_DEX_SWAP_URL: optionalUrl,
  NEXT_PUBLIC_X_URL: optionalUrl,
  NEXT_PUBLIC_DOCS_URL: optionalUrl,
  NEXT_PUBLIC_TELEGRAM_URL: optionalUrl,
  NEXT_PUBLIC_TOS_URL: optionalUrl,
  NEXT_PUBLIC_PRIVACY_URL: optionalUrl,
  NEXT_PUBLIC_DOMAIN: optionalString,
  /** Seconds after the last keeper heartbeat before the stale banner shows. */
  NEXT_PUBLIC_KEEPER_STALE_AFTER: z.coerce.number().int().positive().default(3600),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export interface PublicConfig {
  env: PublicEnv;
  /** True only when both the contract address and the indexer URL are set. */
  isLive: boolean;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

/**
 * Parses public env. Throws if the mock data source is selected for a
 * production build: production must never show sample data.
 */
export function parsePublicEnv(raw: Record<string, string | undefined>): PublicConfig {
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid public env: ${formatIssues(result.error)}`);
  }
  const env = result.data;
  if (env.NODE_ENV === "production" && env.NEXT_PUBLIC_DATA_SOURCE === "mock") {
    throw new ConfigError("NEXT_PUBLIC_DATA_SOURCE=mock is not allowed when NODE_ENV=production.");
  }
  if (env.NODE_ENV === "production" && env.NEXT_PUBLIC_MOCK_AUTH === "1") {
    throw new ConfigError("NEXT_PUBLIC_MOCK_AUTH=1 is not allowed when NODE_ENV=production.");
  }
  return {
    env,
    isLive: Boolean(env.NEXT_PUBLIC_CONTRACT_ADDRESS && env.NEXT_PUBLIC_INDEXER_URL),
  };
}

const requiredUrl = z.string().refine((v) => URL.canParse(v), { message: "must be a valid URL" });
const requiredAddress = z
  .string()
  .refine((v) => isAddress(v), { message: "must be a 0x address" })
  .transform((v) => v as Address);
const hexKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte hex private key")
  .transform((v) => v as `0x${string}`);

/** Attestation + X proxy + indexer REST gateway (services/api). */
export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  PORT: z.coerce.number().int().default(8787),
  CHAIN_ID: chainId,
  CONTRACT_ADDRESS: requiredAddress,
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  /** Unset: X lookups and register attestations answer 503 (not configured). */
  X_API_BEARER: optionalString,
  /** Pinata JWT scoped to `org:files:write`, for Launch page token images. Unset: uploads answer 503. */
  PINATA_JWT: optionalString,
  /** Local dev only; production signs through the Privy server wallet below. */
  ATTESTER_KEY: hexKey.optional(),
  /** Privy server wallet that holds the attester key (secp256k1, inside Privy). */
  ATTESTER_PRIVY_WALLET_ID: optionalString,
  /** Base64 PKCS#8 P-256 key of the policy-restricted signer. Host secret store only. */
  ATTESTER_PRIVY_AUTH_KEY: optionalString,
  /** The attester the contract was deployed with; boot fails if the Privy wallet differs. */
  ATTESTER_ADDRESS: optionalAddress,
  /** Comma-separated allowed origins (the Vercel domain). */
  CORS_ORIGIN: z.string().min(1),
  /** Reserved for the Postgres-backed X cache; the first version caches in memory. */
  DATABASE_URL: optionalUrl,
  /** Number of reverse proxies in front (Caddy = 1): picks the client IP from X-Forwarded-For. */
  TRUSTED_PROXIES: z.coerce.number().int().min(0).max(3).default(0),
  ATTESTATION_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(300),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** The Privy attester settings: all three or none. */
export function privyAttesterEnv(env: ApiEnv) {
  const walletId = env.ATTESTER_PRIVY_WALLET_ID;
  const authorizationKey = env.ATTESTER_PRIVY_AUTH_KEY;
  const expectedAddress = env.ATTESTER_ADDRESS;
  if (!walletId && !authorizationKey && !expectedAddress) return undefined;
  if (!walletId || !authorizationKey || !expectedAddress) {
    throw new ConfigError(
      "Invalid api env: ATTESTER_PRIVY_WALLET_ID, ATTESTER_PRIVY_AUTH_KEY and ATTESTER_ADDRESS go together.",
    );
  }
  return { walletId, authorizationKey, expectedAddress };
}

/** Keeper (services/keeper). Thresholds are in the pair asset's base units. */
export const keeperEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  CHAIN_ID: chainId,
  RPC_URL: requiredUrl,
  RPC_URL_FALLBACK: optionalUrl,
  CONTRACT_ADDRESS: requiredAddress,
  /** Hot wallet: holds gas only. Host secret store, never git. */
  KEEPER_KEY: hexKey,
  /** The indexer REST API: the keeper reads its work list there and re-checks every item on chain. */
  INDEXER_URL: requiredUrl,
  COLLECT_THRESHOLD_USDG: z.coerce.bigint().nonnegative(),
  COLLECT_THRESHOLD_ETH: z.coerce.bigint().nonnegative(),
  /** Other ERC-20 pairs (18 decimals as a rule). Unset: those tokens are not collected by the keeper. */
  COLLECT_THRESHOLD_OTHER: optionalString
    .refine((v) => v === undefined || /^\d+$/.test(v), { message: "must be base units" })
    .transform((v) => (v === undefined ? undefined : BigInt(v))),
  /**
   * Reserved: there is no verified getter for unswept fees (PONS_UNSWEPT_GETTER), so sweeps are
   * gated by simulating the operator call, which reverts below Pons's own floor.
   */
  SWEEP_THRESHOLD_USDG: optionalString,
  SWEEP_THRESHOLD_ETH: optionalString,
  LOOP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  GAS_BUDGET_WEI_PER_RUN: z.coerce.bigint().positive(),
  MAX_RELEASE_BATCHES: z.coerce.number().int().positive().default(50),
  /** Alert (log line kind=alert) when the keeper's ETH balance drops below this. */
  KEEPER_MIN_BALANCE_WEI: z.coerce.bigint().nonnegative().default(5_000_000_000_000_000n),
  /** Days between withdrawFees calls per asset. */
  WITHDRAW_FEES_EVERY_DAYS: z.coerce.number().positive().default(7),
  HEALTH_PORT: z.coerce.number().int().default(8788),
  /** 127.0.0.1 on a bare host; 0.0.0.0 inside a container so the indexer can read it. */
  HEALTH_HOST: z.string().default("127.0.0.1"),
});
export type KeeperEnv = z.infer<typeof keeperEnvSchema>;

/** Indexer (services/indexer). */
export const indexerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  CHAIN_ID: chainId,
  RPC_URL: requiredUrl,
  RPC_URL_FALLBACK: optionalUrl,
  /** Unset: an embedded PGlite database (development only; refused in production). */
  DATABASE_URL: optionalUrl,
  CONTRACT_ADDRESS: requiredAddress,
  CONTRACT_DEPLOY_BLOCK: z.coerce.number().int().nonnegative(),
  /** Reorg depth: blocks newer than this are treated as unfinalized. */
  CONFIRMATIONS: z.coerce.number().int().nonnegative().default(12),
  /** Blocks between escrow-balance snapshots of routed tokens. */
  SNAPSHOT_INTERVAL_BLOCKS: z.coerce.number().int().positive().default(1200),
  /** Comma-separated allowed origins for the REST API (the Vercel domain). */
  CORS_ORIGIN: z.string().min(1),
  /** Unset: accounts are served by numeric id only (no handle or avatar). */
  X_API_BEARER: optionalString,
  /** The keeper's /health (same host). Unset: /api/keeper/status reports no runs. */
  KEEPER_HEALTH_URL: optionalUrl,
  /** Seconds after the last keeper run before the app shows "delayed". */
  KEEPER_STALE_AFTER: z.coerce.number().int().positive().default(3600),
});
export type IndexerEnv = z.infer<typeof indexerEnvSchema>;

export function parseServerEnv<S extends z.ZodType>(
  schema: S,
  raw: Record<string, string | undefined>,
  service: string,
): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid ${service} env: ${formatIssues(result.error)}`);
  }
  return result.data;
}
