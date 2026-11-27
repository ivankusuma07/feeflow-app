import { feeFlowAbi, ponsOverrideAbi } from "@feeflow/abi";
import {
  ANVIL_CHAIN_ID,
  indexerEnvSchema,
  parseServerEnv,
  THIRD_PARTY_ADDRESSES,
} from "@feeflow/config";
import { createConfig } from "ponder";
import { fallback, http } from "viem";

const env = parseServerEnv(indexerEnvSchema, process.env, "indexer");
const ponsFactory = THIRD_PARTY_ADDRESSES[env.CHAIN_ID]?.ponsFactory;
if (!ponsFactory) throw new Error(`No Pons factory address for chain ${env.CHAIN_ID}`);
if (env.NODE_ENV === "production" && !env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production (PGlite is for development only).");
}

export default createConfig({
  database: env.DATABASE_URL
    ? { kind: "postgres", connectionString: env.DATABASE_URL }
    : { kind: "pglite" },
  chains: {
    main: {
      id: env.CHAIN_ID,
      // Paid provider first, fallback second (brief §Hosting: fail over automatically).
      rpc: env.RPC_URL_FALLBACK
        ? fallback([http(env.RPC_URL), http(env.RPC_URL_FALLBACK)])
        : env.RPC_URL,
      reorgWindow: env.CONFIRMATIONS,
      // The public RPC answers bursts with 429s and Ponder then stalls; the default is 50/s.
      // Pons factory events (every token, not just FeeFlow ones) make backfills request-heavy.
      maxRequestsPerSecond: env.CHAIN_ID === ANVIL_CHAIN_ID ? 50 : 10,
    },
  },
  contracts: {
    FeeFlow: {
      chain: "main",
      abi: feeFlowAbi,
      address: env.CONTRACT_ADDRESS,
      startBlock: env.CONTRACT_DEPLOY_BLOCK,
    },
    // Recipient override events for every Pons token; handlers keep only FeeFlow's tokens.
    PonsFactory: {
      chain: "main",
      abi: ponsOverrideAbi,
      address: ponsFactory,
      startBlock: env.CONTRACT_DEPLOY_BLOCK,
    },
  },
  blocks: {
    // Live only: historical escrow balances would need an archive node and are never shown.
    EscrowSnapshot: {
      chain: "main",
      startBlock: "latest",
      interval: env.SNAPSHOT_INTERVAL_BLOCKS,
    },
  },
});
