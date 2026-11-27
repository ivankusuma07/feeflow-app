import { createServer } from "node:http";
import { keeperEnvSchema, parseServerEnv, THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import { createPublicClient, createWalletClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { nextDelaySeconds } from "./plan";
import { runOnce, type KeeperState } from "./run";

const env = parseServerEnv(keeperEnvSchema, process.env, "keeper");
const pons = THIRD_PARTY_ADDRESSES[env.CHAIN_ID];

/** One JSON line per action, skip, alert and run, on stdout for the host's log collector. */
const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));

const transport = env.RPC_URL_FALLBACK
  ? fallback([http(env.RPC_URL), http(env.RPC_URL_FALLBACK)])
  : http(env.RPC_URL);
const publicClient = createPublicClient({ transport });
const chainId = await publicClient.getChainId();
if (chainId !== env.CHAIN_ID) throw new Error(`RPC is chain ${chainId}, expected ${env.CHAIN_ID}`);
const account = privateKeyToAccount(env.KEEPER_KEY);
const walletClient = createWalletClient({ account, transport });

const state: KeeperState = { lastWithdrawAt: new Map() };
const health = {
  address: account.address,
  /** Unix seconds of the last run that finished without error. */
  lastRunAt: null as number | null,
  lastAttemptAt: null as number | null,
  consecutiveFailures: 0,
  lastSummary: null as unknown,
};

createServer((req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  const stale =
    health.lastRunAt === null ||
    Date.now() / 1000 - health.lastRunAt > 3 * env.LOOP_INTERVAL_SECONDS + 600;
  res.writeHead(stale ? 503 : 200, { "content-type": "application/json" });
  res.end(JSON.stringify(health));
}).listen(env.HEALTH_PORT, "127.0.0.1");

log({
  kind: "start",
  chainId,
  contract: env.CONTRACT_ADDRESS,
  keeper: account.address,
  port: env.HEALTH_PORT,
});

for (;;) {
  health.lastAttemptAt = Math.floor(Date.now() / 1000);
  try {
    const summary = await runOnce(
      {
        publicClient,
        walletClient,
        contract: env.CONTRACT_ADDRESS,
        sweepOperator: pons?.ponsSweepOperator,
        indexerUrl: env.INDEXER_URL,
        thresholds: {
          usdg: pons?.usdg,
          usdgAmount: env.COLLECT_THRESHOLD_USDG,
          eth: env.COLLECT_THRESHOLD_ETH,
          other: env.COLLECT_THRESHOLD_OTHER,
        },
        gasBudgetWei: env.GAS_BUDGET_WEI_PER_RUN,
        maxReleaseBatches: env.MAX_RELEASE_BATCHES,
        withdrawEverySeconds: Math.round(env.WITHDRAW_FEES_EVERY_DAYS * 86_400),
        minBalanceWei: env.KEEPER_MIN_BALANCE_WEI,
        log,
      },
      state,
    );
    health.lastRunAt = Math.floor(Date.now() / 1000);
    health.consecutiveFailures = 0;
    health.lastSummary = summary;
    log({ kind: "run", ...summary });
  } catch (err) {
    health.consecutiveFailures += 1;
    log({ kind: "error", failures: health.consecutiveFailures, error: String(err).slice(0, 500) });
  }
  const delay = nextDelaySeconds(env.LOOP_INTERVAL_SECONDS, health.consecutiveFailures);
  await new Promise((r) => setTimeout(r, delay * 1000));
}
