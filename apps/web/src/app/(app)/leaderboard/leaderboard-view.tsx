"use client";

import { isNative, knownPairAssets, sameAsset, type PairAsset } from "@feeflow/config";
import type { LeaderboardEntry, LeaderboardPeriod } from "@feeflow/sdk";
import { Card, LiveLabel, ProgressBar, Segmented, cn } from "@feeflow/ui";
import { useId, useState } from "react";
import { Amount } from "@/components/app/amount";
import { Avatar } from "@/components/app/avatar";
import { ErrorState, Skeleton } from "@/components/app/states";
import { notLiveNote } from "@/content/copy";
import { useLeaderboard, useTotals } from "@/data/context";
import { symbolOf } from "@/lib/assets";
import { APP_CHAIN_ID } from "@/lib/chain";

const PERIODS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All time" },
] as const;

const fieldCls =
  "min-h-11 rounded-[var(--radius-btn)] border border-line-strong bg-surface px-3 text-sm text-ink";

/** The design's USDG / ETH toggle: the assets the app knows by name, USDG first. */
function primaryAssets(): PairAsset[] {
  return [...knownPairAssets(APP_CHAIN_ID)].sort(
    (a, b) => (isNative(a) ? 1 : 0) - (isNative(b) ? 1 : 0),
  );
}

export function LeaderboardView() {
  const ids = useId();
  const [period, setPeriod] = useState<LeaderboardPeriod>("30d");
  const primary = primaryAssets();
  const [asset, setAsset] = useState<PairAsset>(primary[0]!);

  // Any other pair asset with activity (GME, ANT, …) is ranked on its own, never mixed in.
  const totals = useTotals();
  const others = totals.data?.live
    ? totals.data.value.assets
        .map((t) => t.asset)
        .filter((a) => !primary.some((p) => sameAsset(p, a)))
    : [];
  const isPrimary = primary.some((p) => sameAsset(p, asset));

  const board = useLeaderboard(period, asset.address);
  const live = board.data?.live ?? false;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-4xl font-semibold tracking-tight">Leaderboard</h1>
        {live ? <LiveLabel /> : null}
      </div>
      <p className="mt-2.5 mb-0 text-muted">X accounts ranked by fees credited through FeeFlow.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />
        <Segmented
          label="Asset"
          value={isPrimary ? asset.address.toLowerCase() : ""}
          options={primary.map((a) => ({ value: a.address.toLowerCase(), label: symbolOf(a) }))}
          onChange={(v) => setAsset(primary.find((a) => a.address.toLowerCase() === v)!)}
        />
        {others.length > 0 ? (
          <>
            <label htmlFor={`${ids}-other`} className="sr-only">
              Other pair asset
            </label>
            <select
              id={`${ids}-other`}
              className={cn(fieldCls, !isPrimary && "border-ink font-semibold")}
              value={isPrimary ? "" : asset.address.toLowerCase()}
              onChange={(e) => {
                const next = others.find((a) => a.address.toLowerCase() === e.target.value);
                if (next) setAsset(next);
              }}
            >
              <option value="" disabled>
                Other asset…
              </option>
              {others.map((a) => (
                <option key={a.address} value={a.address.toLowerCase()}>
                  {symbolOf(a)}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      <Card flush className="mt-6">
        <Board query={board} />
      </Card>
      <p className="mt-4 mb-0 max-w-[720px] text-[13px] leading-normal text-muted">
        Fees received = net credited after FeeFlow&apos;s 1% fee, in the selected asset. USDG and
        ETH are ranked separately; no prices are mixed. Profile pictures come from X.
      </p>
    </>
  );
}

const rowCls =
  "grid grid-cols-[36px_36px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 sm:grid-cols-[48px_40px_minmax(0,1fr)_minmax(120px,240px)_auto] sm:px-6";

function Board({ query }: { query: ReturnType<typeof useLeaderboard> }) {
  if (query.isError) {
    return (
      <div className="p-6">
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 p-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }
  if (!query.data.live) {
    return <p className="m-0 p-6 text-sm text-muted">{notLiveNote}</p>;
  }
  const rows = query.data.value;
  if (rows.length === 0) {
    return <p className="m-0 p-6 text-sm text-muted">No fees received in this period yet.</p>;
  }
  const top = BigInt(rows[0]!.received.raw);

  return (
    <ol aria-label="Ranking" className="m-0 list-none p-0">
      <li aria-hidden className={cn(rowCls, "border-b border-line text-xs font-medium text-muted")}>
        <span>Rank</span>
        <span />
        <span>Account</span>
        <span className="hidden sm:block">Share of #1</span>
        <span className="text-right">Fees received</span>
      </li>
      {rows.map((e) => (
        <Row key={e.account.userId} e={e} top={top} />
      ))}
    </ol>
  );
}

function Row({ e, top }: { e: LeaderboardEntry; top: bigint }) {
  const handle = e.account.username ? `@${e.account.username}` : `X user ${e.account.userId}`;
  const share = top > 0n ? Number((BigInt(e.received.raw) * 10_000n) / top) / 10_000 : 0;
  return (
    <li className={cn(rowCls, "border-b border-line last:border-b-0")}>
      <span className="font-mono">{e.rank}</span>
      <Avatar src={e.account.avatarUrl} label={e.account.name ?? handle} size={36} />
      <div className="min-w-0">
        <div className="truncate font-medium">{e.account.name ?? handle}</div>
        <div className="truncate font-mono text-[13px] text-muted">{handle}</div>
      </div>
      <ProgressBar
        variant="row"
        value={share}
        label={`${handle}: ${Math.round(share * 100)}% of #1`}
        className="hidden sm:block"
      />
      <span className="text-right font-mono">
        <Amount value={e.received} />
      </span>
    </li>
  );
}
