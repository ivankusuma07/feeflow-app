/**
 * Ponder against a local Anvil deployment (brief §Testing: "Ponder against an Anvil fork").
 * Starts Anvil and `ponder start` (embedded PGlite), drives route → collect → claim → expire →
 * exit on chain, then checks every REST endpoint and runs the reconciliation against
 * `totals(asset)`. Run with `pnpm --filter @feeflow/indexer test:anvil` (needs Foundry).
 */
import {
  ADDR,
  CLAIM_WALLET,
  CREATOR,
  localChain,
  startPonder,
  waitIndexed,
  X_ID,
} from "@feeflow/anvil-kit";
import { NATIVE_ASSET_ADDRESS } from "@feeflow/config";
import type {
  AccountView,
  ClaimRecord,
  LeaderboardEntry,
  TokenDetail,
  TokenSummary,
  Totals,
} from "@feeflow/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkPonsOverrides, indexedBlock, reconcile, type RoutedToken } from "../src/reconcile";

const chain = localChain(8547);
let ponder: Awaited<ReturnType<typeof startPonder>>;
/** Where the Pons owner override sends fees in this story. */
const OVERRIDE = "0x000000000000000000000000000000000000Ba5e" as const;
/** The ETH token right after the override executed (before its exit). */
let redirectedEth: TokenDetail;

async function get<T>(p: string): Promise<T> {
  const res = await fetch(`${ponder.url}${p}`);
  if (!res.ok) throw new Error(`${p} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

beforeAll(async () => {
  await chain.start();
  ponder = await startPonder({ rpc: chain.rpc, port: 42079 });

  // ---- the on-chain story
  const usdgSink = await chain.register(ADDR.usdgToken);
  const ethSink = await chain.register(ADDR.ethToken);
  await chain.ponsTransfer(ADDR.usdgToken, usdgSink);
  await chain.ponsTransfer(ADDR.ethToken, ethSink);
  // The Pons owner redirects the ETH token after the 3-day notice.
  await chain.ponsPropose(ADDR.ethToken, OVERRIDE);
  await chain.warp(3 * 86_400);
  await chain.ponsExecute(ADDR.ethToken);
  await waitIndexed(chain, ponder.url, ponder);
  redirectedEth = await get<TokenDetail>(`/api/tokens/${ADDR.ethToken}`);
  await chain.creditUsdg(usdgSink, 150_000_000n); // 150 USDG
  await chain.collect(ADDR.usdgToken); // net 148.50
  await chain.creditEth(ethSink, 10n ** 18n);
  await chain.collect(ADDR.ethToken); // net 0.99 ETH
  await chain.claim([ADDR.usdgToken, ADDR.ethToken]);
  await chain.creditUsdg(usdgSink, 20_000_000n);
  await chain.collect(ADDR.usdgToken); // net 19.80, left unclaimed
  await chain.warp(31 * 86_400);
  await chain.releaseExpired(ADDR.usdgToken);
  await chain.creditUsdg(usdgSink, 5_000_000n); // waits in the escrow: "accrued"
  await chain.ponsPropose(ADDR.usdgToken, OVERRIDE); // pending until the run ends
  await chain.exitByCreator(ADDR.ethToken, CREATOR);
  await chain.test.mine({ blocks: 2 });
  await waitIndexed(chain, ponder.url, ponder);
}, 180_000);

afterAll(() => {
  ponder?.kill();
  chain.stop();
});

describe("indexer on Anvil", () => {
  it("serves protocol totals that reconcile with totals(asset) on chain", async () => {
    const t = await get<Totals>("/api/totals");
    expect(t.tokensRouted).toBe(2);
    expect(t.assets.map((a) => a.asset.symbol)).toEqual(["ETH", "USDG"]);
    const usdg = t.assets[1]!;
    expect(usdg).toMatchObject({
      collectedGross: "170000000",
      feesTaken: "1700000",
      credited: "168300000",
      claimed: "148500000",
      expiredToCreators: "19800000",
      unclaimed: "0",
    });
    expect(t.assets[0]).toMatchObject({ claimed: "990000000000000000", accrued: "0" });

    const drift = await reconcile({
      client: chain.client,
      contract: ADDR.feeFlow,
      totals: t,
      blockNumber: await indexedBlock(ponder.url),
    });
    expect(drift).toEqual([]);
  });

  it("serves the token page: buckets, open batches and history", async () => {
    const d = await get<TokenDetail>(`/api/tokens/${ADDR.usdgToken}`);
    expect(d.status).toBe("routed");
    expect(d.recipient).toMatchObject({
      userId: X_ID.toString(),
      hasLoggedIn: true,
      username: null,
    });
    expect(d.buckets.credited.raw).toBe("0");
    expect(d.buckets.unswept).toBeNull();
    expect(d.batches).toEqual([]);
    expect(d.history.map((h) => h.kind)).toEqual([
      "expired",
      "collect",
      "claim",
      "collect",
      "routed",
    ]);
    expect(d.expiredToCreator.raw).toBe("19800000");
    expect(d.feePolicy.protocolShareBps).not.toBeUndefined();
    expect(d.history[0]!.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(d.history[0]!.blockNumber).toBeGreaterThan(0);

    const exited = await get<TokenDetail>(`/api/tokens/${ADDR.ethToken}`);
    expect(exited.status).toBe("exited");
    expect(exited.history[0]).toMatchObject({
      kind: "exit",
      exitRole: "creator",
      counterparty: CREATOR.toLowerCase(),
    });
  });

  it("tracks Pons owner overrides: pending, then redirected, cleared by an exit", async () => {
    expect(redirectedEth).toMatchObject({
      status: "redirected",
      redirectedTo: OVERRIDE.toLowerCase(),
      ponsOverride: null,
    });

    const usdg = await get<TokenDetail>(`/api/tokens/${ADDR.usdgToken}`);
    expect(usdg.status).toBe("routed");
    expect(usdg.ponsOverride).toMatchObject({ to: OVERRIDE.toLowerCase() });
    expect(usdg.ponsOverride!.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(usdg.ponsOverride!.expiresAt - usdg.ponsOverride!.effectiveAt).toBe(3 * 86_400);

    // The exited ETH token is no longer "redirected", and its exit left Pons' recipient alone.
    const eth = await get<TokenDetail>(`/api/tokens/${ADDR.ethToken}`);
    expect(eth).toMatchObject({ status: "exited", redirectedTo: null });

    // The reconcile job's independent chain read agrees with the indexer.
    const tokens = await get<RoutedToken[]>("/api/keeper/work");
    const findings = await checkPonsOverrides({
      client: chain.client,
      factory: ADDR.factory,
      tokens,
      blockNumber: await indexedBlock(ponder.url),
      now: Number((await chain.client.getBlock()).timestamp), // chain time runs ahead after warps
    });
    expect(findings).toEqual([
      expect.objectContaining({
        status: "pons-override-pending",
        token: ADDR.usdgToken.toLowerCase(),
      }),
    ]);
  });

  it("shows escrow balances as accrued once a snapshot runs", async () => {
    // 5 USDG was credited to the sink after the expiry; the next collect would pull it.
    const d = await get<TokenDetail>(`/api/tokens/${ADDR.usdgToken}`);
    expect(d.buckets.escrow.raw).toBe("5000000");
    expect(d.accrued.raw).toBe("5000000");
    const t = await get<Totals>("/api/totals");
    expect(t.assets[1]!.accrued).toBe("5000000");
  });

  it("serves the claim feed, account view, top tokens and leaderboard", async () => {
    const claims = await get<ClaimRecord[]>("/api/claims/recent?limit=5");
    expect(claims).toHaveLength(1);
    expect(claims[0]!.tokens).toHaveLength(2);
    expect(claims[0]!.to).toBe(CLAIM_WALLET.toLowerCase());

    const a = await get<AccountView>(`/api/accounts/${X_ID}`);
    expect(a.tokens.map((t) => t.status).sort()).toEqual(["exited", "routed"]);
    expect(a.activity.map((x) => x.label)).toContain("Claimed · 2 tokens");
    expect(a.received.find((r) => r.asset.symbol === "USDG")).toMatchObject({
      net: "168300000",
      claimed: "148500000",
    });

    const top = await get<TokenSummary[]>("/api/tokens/top?limit=10");
    expect(top[0]!.address).toBe(ADDR.usdgToken.toLowerCase());

    const lb = await get<LeaderboardEntry[]>(`/api/leaderboard?period=all&asset=${ADDR.usdg}`);
    expect(lb).toEqual([
      expect.objectContaining({ rank: 1, received: expect.objectContaining({ raw: "168300000" }) }),
    ]);
    // Periods count back from wall-clock time; these collects happened seconds ago.
    const week = await get<LeaderboardEntry[]>(`/api/leaderboard?period=7d&asset=${ADDR.usdg}`);
    expect(week[0]!.received.raw).toBe("168300000");
    const eth = await get<LeaderboardEntry[]>(
      `/api/leaderboard?period=all&asset=${NATIVE_ASSET_ADDRESS}`,
    );
    expect(eth[0]!.received.raw).toBe("990000000000000000");
  });

  it("lists every token for Explore: newest first, ranked by paid per asset, searchable", async () => {
    type Page = { tokens: TokenSummary[]; hasMore: boolean };
    const usdg = ADDR.usdgToken.toLowerCase();
    const eth = ADDR.ethToken.toLowerCase();

    const recent = await get<Page>("/api/tokens");
    expect(recent.tokens.map((t) => t.address)).toEqual([eth, usdg]); // eth registered last
    expect(recent.hasMore).toBe(false);

    const one = await get<Page>("/api/tokens?limit=1");
    expect(one).toMatchObject({ hasMore: true, tokens: [{ address: eth }] });
    const next = await get<Page>("/api/tokens?limit=1&offset=1");
    expect(next).toMatchObject({ hasMore: false, tokens: [{ address: usdg }] });

    const paid = await get<Page>(`/api/tokens?sort=paid&asset=${ADDR.usdg}`);
    expect(paid.tokens.map((t) => [t.address, t.totalPaid.raw])).toEqual([[usdg, "148500000"]]);

    const byPrefix = await get<Page>(`/api/tokens?q=${usdg.slice(0, 10)}`);
    expect(byPrefix.tokens.map((t) => t.address)).toEqual([usdg]);
    expect((await get<Page>("/api/tokens?q=%25")).tokens).toEqual([]); // "%" is literal

    expect((await fetch(`${ponder.url}/api/tokens?sort=paid`)).status).toBe(400);
  });

  it("answers 404 for unknown ids and 400 for malformed input", async () => {
    expect((await fetch(`${ponder.url}/api/accounts/42`)).status).toBe(404);
    expect((await fetch(`${ponder.url}/api/tokens/0x${"1".repeat(40)}`)).status).toBe(404);
    expect((await fetch(`${ponder.url}/api/accounts/abc`)).status).toBe(400);
    expect((await fetch(`${ponder.url}/api/leaderboard?period=1y&asset=${ADDR.usdg}`)).status).toBe(
      400,
    );
    expect((await fetch(`${ponder.url}/api/claims/recent?limit=1000`)).status).toBe(400);
  });
});
