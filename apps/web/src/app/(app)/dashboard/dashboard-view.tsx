"use client";

import { isNative, type PairAsset } from "@feeflow/config";
import {
  amount,
  displaySymbol,
  formatDate,
  formatRaw,
  formatRelative,
  initials,
  shortHash,
  sumByAsset,
  type AccountView,
  type Amount as AmountValue,
} from "@feeflow/sdk";
import { Button, Card, CardHeader, CardTitle, Monogram, ProgressBar, cn } from "@feeflow/ui";
import { CircleCheck, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { XAccount } from "@/auth/auth-context";
import { Amount } from "@/components/app/amount";
import { AuthGate } from "@/components/app/auth-gate";
import { ErrorState, Skeleton } from "@/components/app/states";
import { XIcon } from "@/components/x-icon";
import { notLiveNote } from "@/content/copy";
import { useAccountView } from "@/data/context";
import { APP_CHAIN_ID, explorerTxUrl } from "@/lib/chain";

export function DashboardView() {
  return <AuthGate>{(account) => <Dashboard account={account} />}</AuthGate>;
}

/** USDG first (the design's headline figure), then ETH, then other pair assets by symbol. */
function assetRank(a: PairAsset): number {
  const symbol = displaySymbol(a, APP_CHAIN_ID);
  if (symbol === "USDG") return 0;
  if (isNative(a)) return 1;
  return 2;
}
const byAsset = (x: AmountValue, y: AmountValue) =>
  assetRank(x.asset) - assetRank(y.asset) || x.asset.symbol.localeCompare(y.asset.symbol);

const nonZero = (a: AmountValue) => BigInt(a.raw) > 0n;

function Dashboard({ account }: { account: XAccount }) {
  const query = useAccountView(account.userId);
  const handle = account.username ?? account.userId;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="m-0 font-mono text-[13px] text-muted">Logged in with X as @{handle}</p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-tight">Dashboard</h1>
      </div>
      <ClaimAllButton view={query.data?.live ? query.data.value : null} />
    </div>
  );

  if (query.isError) {
    return (
      <>
        {heading}
        <ErrorState
          className="mt-7"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        {heading}
        <div aria-busy="true" className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-12">
          <Skeleton className="h-64 md:col-span-7" />
          <Skeleton className="h-64 md:col-span-5" />
          <Skeleton className="h-56 md:col-span-4" />
          <Skeleton className="h-56 md:col-span-4" />
          <Skeleton className="h-56 md:col-span-4" />
        </div>
      </>
    );
  }

  const live = query.data.live;
  const view = live ? query.data.value : null;

  return (
    <>
      {heading}
      <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-12">
        <LinkedTokens view={view} live={live} className="md:col-span-7" />
        <Claimable view={view} live={live} className="md:col-span-5" />
        <FeesReceived view={view} className="md:col-span-6 lg:col-span-4" />
        <RecentActivity view={view} className="md:col-span-6 lg:col-span-4" />
        <HowClaimingWorks className="md:col-span-12 lg:col-span-4" />
      </div>
    </>
  );
}

function ClaimAllButton({ view }: { view: AccountView | null }) {
  const anything = view?.tokens.some((t) => nonZero(t.claimable)) ?? false;
  if (!anything) {
    return (
      <Button type="button" variant="inert" disabled>
        Claim all
      </Button>
    );
  }
  return (
    <Button asChild>
      <Link href="/claim">Claim all</Link>
    </Button>
  );
}

// ---------------------------------------------------------------- Linked tokens (7)

function LinkedTokens({
  view,
  live,
  className,
}: {
  view: AccountView | null;
  live: boolean;
  className?: string;
}) {
  const tokens = view?.tokens ?? [];
  return (
    <Card className={className}>
      <CardHeader
        title="Linked tokens"
        action={
          tokens.length > 0 ? (
            <span className="font-mono text-[13px] text-muted">
              {tokens.length} {tokens.length === 1 ? "token" : "tokens"}
            </span>
          ) : null
        }
      />
      {tokens.length === 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-6">
          <Image
            src="/illustrations/empty.webp"
            alt=""
            width={240}
            height={180}
            loading="eager"
            className="h-auto w-[200px] max-w-full mix-blend-multiply"
          />
          <div className="min-w-[180px] flex-1">
            <p className="m-0 font-semibold">No linked tokens</p>
            {!live ? (
              <p className="mt-1.5 text-sm leading-normal text-muted">{notLiveNote}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className="mt-4.5 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-3">
          {tokens.map((t) => (
            <li key={t.address}>
              <Link
                href={`/tokens/${t.address}`}
                className="flex h-full flex-col gap-1.5 rounded-[var(--radius-tile)] border border-line p-4 no-underline hover:border-line-strong"
              >
                <Monogram text={initials(t.name)} />
                <span className="mt-2 font-semibold">{t.name}</span>
                <span className="font-mono text-xs text-muted">
                  ${t.symbol} · {displaySymbol(t.pairAsset, APP_CHAIN_ID)} pair
                </span>
                <span className="mt-2 text-xs text-muted">Claimable</span>
                <Amount value={t.claimable} className="text-base font-medium" />
                <span className="text-xs text-muted">
                  Pending <Amount value={t.pending} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Claimable (5)

function Claimable({
  view,
  live,
  className,
}: {
  view: AccountView | null;
  live: boolean;
  className?: string;
}) {
  const tokens = view?.tokens ?? [];
  const totals = sumByAsset(tokens.map((t) => t.claimable))
    .filter(nonZero)
    .sort(byAsset);

  // Oldest outstanding batch across all tokens: its deadline is the "Claim by" date.
  const oldest = tokens
    .filter((t) => t.oldestDeadline !== null && t.oldestAmount && nonZero(t.oldestAmount))
    .sort((a, b) => a.oldestDeadline! - b.oldestDeadline!)[0];
  const collectFrom = tokens.find((t) => nonZero(t.pending));

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardTitle>Claimable</CardTitle>
      {totals.length === 0 ? (
        <div className="mt-4 font-mono text-4xl leading-tight font-medium">—</div>
      ) : (
        totals.map((a, i) => (
          <div
            key={a.asset.address}
            className={cn(
              "font-mono font-medium",
              i === 0 ? "mt-4 text-4xl leading-tight" : "mt-1.5 text-[22px]",
            )}
          >
            {formatRaw(a.raw, a.asset)}{" "}
            <span className={i === 0 ? "text-lg" : "text-sm"}>
              {displaySymbol(a.asset, APP_CHAIN_ID)}
            </span>
          </div>
        ))
      )}
      <p className="mt-4 mb-0 text-[13px] leading-normal text-muted">
        {live
          ? "FeeFlow’s 1% fee was already deducted when these fees were collected."
          : notLiveNote}
      </p>
      {oldest ? (
        <p className="mt-3 mb-0 rounded-lg bg-bg px-3 py-2.5 text-[13px] leading-normal">
          <strong>Claim by {formatDate(oldest.oldestDeadline!)}</strong> — the oldest amount (
          <Amount value={oldest.oldestAmount} />) can be sent to the token&apos;s creator after
          that.
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2.5 pt-5">
        {totals.length > 0 ? (
          <Button asChild className="flex-1">
            <Link href="/claim">Claim</Link>
          </Button>
        ) : (
          <Button type="button" variant="inert" disabled className="flex-1">
            Claim
          </Button>
        )}
        {collectFrom ? (
          <Button asChild variant="secondary">
            <Link href={`/tokens/${collectFrom.address}`}>Collect pending</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Fees received (4)

function FeesReceived({ view, className }: { view: AccountView | null; className?: string }) {
  const rows = [...(view?.received ?? [])].sort((x, y) =>
    byAsset(amount(x.asset, x.net), amount(y.asset, y.net)),
  );
  return (
    <Card className={className}>
      <CardTitle>Fees received</CardTitle>
      {rows.length === 0 ? (
        <dl className="mt-4 mb-0 grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
          <dt className="text-muted">Gross collected</dt>
          <dd className="m-0 text-right font-mono">—</dd>
          <dt className="text-muted">FeeFlow fee (1%)</dt>
          <dd className="m-0 text-right font-mono">—</dd>
          <dt className="border-t border-line pt-2.5 font-semibold">Net credited</dt>
          <dd className="m-0 border-t border-line pt-2.5 text-right font-mono font-medium">—</dd>
        </dl>
      ) : (
        rows.map((r, i) => {
          const net = BigInt(r.net);
          const share = net > 0n ? Number((BigInt(r.claimed) * 10_000n) / net) / 10_000 : 0;
          const pct = Math.round(share * 100);
          const symbol = displaySymbol(r.asset, APP_CHAIN_ID);
          return (
            <section
              key={r.asset.address}
              className={i === 0 ? "mt-4" : "mt-5 border-t border-line pt-4"}
            >
              {rows.length > 1 ? (
                <h3 className="m-0 mb-2 font-mono text-xs font-medium text-muted">{symbol}</h3>
              ) : null}
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
                <dt className="text-muted">Gross collected</dt>
                <dd className="m-0 text-right">
                  <Amount value={amount(r.asset, r.gross)} />
                </dd>
                <dt className="text-muted">FeeFlow fee (1%)</dt>
                <dd className="m-0 text-right font-mono">
                  −{formatRaw(r.fee, r.asset)} {symbol}
                </dd>
                <dt className="border-t border-line pt-2.5 font-semibold">Net credited</dt>
                <dd className="m-0 border-t border-line pt-2.5 text-right font-medium">
                  <Amount value={amount(r.asset, r.net)} />
                </dd>
              </dl>
              <ProgressBar className="mt-4" value={share} label={`${symbol} claimed so far`} />
              <p className="mt-2 mb-0 text-xs text-muted">
                {pct}% claimed so far · FeeFlow fee: 1%, fixed in the contract.
              </p>
            </section>
          );
        })
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Recent activity (4)

function RecentActivity({ view, className }: { view: AccountView | null; className?: string }) {
  const items = view?.activity ?? [];
  return (
    <Card className={className}>
      <CardTitle>Recent activity</CardTitle>
      {items.length === 0 ? (
        <p className="mt-4 mb-0 text-sm text-muted">—</p>
      ) : (
        <ul className="mt-3.5 mb-0 list-none p-0 text-sm">
          {items.map((a, i) => {
            const url = explorerTxUrl(a.txHash);
            return (
              <li
                key={a.txHash}
                className={cn(
                  "grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2.5",
                  i < items.length - 1 && "border-b border-line",
                )}
              >
                <span>{a.label}</span>
                {url ? (
                  <a
                    className="font-mono text-[13px]"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={a.txHash}
                  >
                    {shortHash(a.txHash)}
                    <span aria-hidden>↗</span>
                    <span className="sr-only"> (transaction on the explorer)</span>
                  </a>
                ) : (
                  <span className="font-mono text-[13px]">{shortHash(a.txHash)}</span>
                )}
                <span className="text-[13px]">
                  {a.amounts.map((x, j) => (
                    <span key={x.asset.address}>
                      {j > 0 ? " + " : null}
                      <Amount value={x} signed={a.kind === "collect"} />
                    </span>
                  ))}
                </span>
                <span className="text-right text-xs text-muted">
                  <time dateTime={new Date(a.timestamp * 1000).toISOString()}>
                    {formatRelative(a.timestamp)}
                  </time>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- How claiming works (4)

const STEPS = [
  { label: "Log in with X", icon: <XIcon size={28} /> },
  { label: "Connect a wallet", icon: <Wallet size={32} strokeWidth={1.5} aria-hidden /> },
  { label: "Claim to it", icon: <CircleCheck size={32} strokeWidth={1.5} aria-hidden /> },
];

function HowClaimingWorks({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardTitle>How claiming works</CardTitle>
      <ol className="mt-4.5 mb-0 grid list-none grid-cols-3 p-0 text-center text-[13px]">
        {STEPS.map((s, i) => (
          <li key={s.label} className={cn("px-1.5", i > 0 && "border-l border-line")}>
            <span className="flex h-8 items-center justify-center">{s.icon}</span>
            <div className="mt-2">{s.label}</div>
          </li>
        ))}
      </ol>
      <p className="mt-4 mb-0 text-xs leading-normal text-muted">
        Each collected amount is claimable for 30 days. Claiming always pays everything credited.
      </p>
    </Card>
  );
}
