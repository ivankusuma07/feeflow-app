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
  NEXT_PUBLIC_AUDIT_STATUS: optionalString,
  /** Seconds after the last keeper heartbeat before the stale banner shows. */
  NEXT_PUBLIC_KEEPER_STALE_AFTER: z.coerce.number().int().positive().default(3600),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export interface PublicConfig {
  env: PublicEnv;
  /** True only when both the contract address and the indexer URL are set. */
  isLive: boolean;
  /** Display string for the audit status; never invented. */
  auditStatus: string;
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
    auditStatus: env.NEXT_PUBLIC_AUDIT_STATUS ?? "[AUDIT_STATUS]",
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
  X_API_BEARER: z.string().min(1),
  /** Local dev only; production signs through KMS (ATTESTER_KMS_KEY_ID). */
  ATTESTER_KEY: hexKey.optional(),
  ATTESTER_KMS_KEY_ID: optionalString,
  CORS_ORIGIN: z.string().min(1),
  DATABASE_URL: requiredUrl,
  ATTESTATION_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(300),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Keeper (services/keeper). Thresholds are in the pair asset's base units. */
export const keeperEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  CHAIN_ID: chainId,
  RPC_URL: requiredUrl,
  RPC_URL_FALLBACK: optionalUrl,
  CONTRACT_ADDRESS: requiredAddress,
  KEEPER_KEY: hexKey,
  DATABASE_URL: requiredUrl,
  COLLECT_THRESHOLD_USDG: z.coerce.bigint(),
  COLLECT_THRESHOLD_ETH: z.coerce.bigint(),
  SWEEP_THRESHOLD_USDG: z.coerce.bigint(),
  SWEEP_THRESHOLD_ETH: z.coerce.bigint(),
  LOOP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  GAS_BUDGET_WEI_PER_RUN: z.coerce.bigint(),
  MAX_RELEASE_BATCHES: z.coerce.number().int().positive().default(50),
  HEALTH_PORT: z.coerce.number().int().default(8788),
});
export type KeeperEnv = z.infer<typeof keeperEnvSchema>;

/** Indexer (services/indexer). */
export const indexerEnvSchema = z.object({
  CHAIN_ID: chainId,
  RPC_URL: requiredUrl,
  DATABASE_URL: requiredUrl,
  CONTRACT_ADDRESS: requiredAddress,
  CONTRACT_DEPLOY_BLOCK: z.coerce.number().int().nonnegative(),
  CONFIRMATIONS: z.coerce.number().int().nonnegative().default(12),
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
