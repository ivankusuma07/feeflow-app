/**
 * The keeper as a real process against Anvil + DeployLocal + the real indexer (`ponder start`).
 * Checks that it collects above threshold (and not below), withdraws the protocol fee, releases
 * expired batches to the creator, and that its heartbeat reaches /api/keeper/status.
 * Run with `pnpm --filter @feeflow/keeper test:anvil` (needs Foundry).
 */
import {
  ADDR,
  localChain,
  startKeeper,
  startPonder,
  waitFor,
  waitIndexed,
  type Proc,
} from "@feeflow/anvil-kit";
import type { Address } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chain = localChain(8548);
const HEALTH_PORT = 8798;
let ponder: Awaited<ReturnType<typeof startPonder>>;
let keeper: Proc;
let usdgSink: Address;

const credited = (token: Address) => chain.read<bigint>("credited", [token]);

beforeAll(async () => {
  await chain.start();
  usdgSink = await chain.register(ADDR.usdgToken);
  const ethSink = await chain.register(ADDR.ethToken);
  await chain.creditUsdg(usdgSink, 150_000_000n); // 150 USDG: above the 10 USDG threshold
  await chain.creditEth(ethSink, 10n ** 18n); // 1 ETH: above 0.01 ETH

  ponder = await startPonder({
    rpc: chain.rpc,
    port: 42089,
    env: { KEEPER_HEALTH_URL: `http://127.0.0.1:${HEALTH_PORT}/health`, KEEPER_STALE_AFTER: "120" },
  });
  await waitIndexed(chain, ponder.url, ponder);

  keeper = startKeeper({
    RPC_URL: chain.rpc,
    INDEXER_URL: ponder.url,
    COLLECT_THRESHOLD_USDG: "10000000",
    COLLECT_THRESHOLD_ETH: "10000000000000000",
    GAS_BUDGET_WEI_PER_RUN: "1000000000000000000",
    LOOP_INTERVAL_SECONDS: "2",
    HEALTH_PORT: String(HEALTH_PORT),
  });
}, 200_000);

afterAll(() => {
  keeper?.kill();
  ponder?.kill();
  chain.stop();
});

describe("keeper on Anvil", () => {
  it("collects every token above its threshold in one pass", async () => {
    await waitFor(async () => (await credited(ADDR.usdgToken)) === 148_500_000n, {
      what: "USDG collect",
      proc: keeper,
    });
    expect(await credited(ADDR.ethToken)).toBe(990_000_000_000_000_000n);
  });

  it("withdraws the protocol fee to FEE_RECIPIENT", async () => {
    await waitFor(async () => (await chain.read<bigint>("accruedFees", [ADDR.usdg])) === 0n, {
      what: "withdrawFees",
      proc: keeper,
    });
    const t = await chain.read<{ feesWithdrawn: bigint }>("totals", [ADDR.usdg]);
    expect(t.feesWithdrawn).toBe(1_500_000n);
    expect(keeper.output()).toMatch(/"action":"withdraw-fees"/);
  });

  it("leaves balances below the threshold in the escrow", async () => {
    await chain.creditUsdg(usdgSink, 5_000_000n); // 5 USDG < 10 USDG
    await waitIndexed(chain, ponder.url, ponder);
    // Several keeper loops (2 s each) pass without collecting it.
    await new Promise((r) => setTimeout(r, 7000));
    expect(await credited(ADDR.usdgToken)).toBe(148_500_000n);
    expect(keeper.output()).not.toMatch(/"kind":"error"/);
  });

  it("releases batches past the 30-day window to the creator", async () => {
    await chain.warp(31 * 86_400);
    await waitIndexed(chain, ponder.url, ponder);
    await waitFor(async () => (await credited(ADDR.usdgToken)) === 0n, {
      what: "releaseExpired",
      proc: keeper,
      timeoutMs: 90_000,
    });
    expect(await credited(ADDR.ethToken)).toBe(0n);
    expect(keeper.output()).toMatch(/"action":"release"/);
  }, 120_000);

  it("reports its last run through the indexer's /api/keeper/status", async () => {
    const res = await fetch(`${ponder.url}/api/keeper/status`);
    const status = (await res.json()) as { lastRunAt: number | null; stale: boolean };
    expect(status.stale).toBe(false);
    expect(status.lastRunAt).toBeGreaterThan(Date.now() / 1000 - 120);
    const health = await fetch(`http://127.0.0.1:${HEALTH_PORT}/health`);
    expect(health.status).toBe(200);
  });
});
