import { feeFlowAbi } from "@feeflow/abi";
import { indexerEnvSchema, parseServerEnv } from "@feeflow/config";
import { createConfig } from "ponder";
import { fallback, http } from "viem";

const env = parseServerEnv(indexerEnvSchema, process.env, "indexer");
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
    },
  },
  contracts: {
    FeeFlow: {
      chain: "main",
      abi: feeFlowAbi,
      address: env.CONTRACT_ADDRESS,
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
