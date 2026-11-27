"use client";

import {
  amount,
  formatRaw,
  formatRelative,
  type AssetTotals,
  type ClaimRecord,
  type TokenSummary,
  type XAccount,
} from "@feeflow/sdk";
import { Card, CardTitle, LiveDot, Table, TableScroll, Td, Th, cn } from "@feeflow/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Amount } from "@/components/app/amount";
import { TokenLogo } from "@/components/app/token-logo";
import { Avatar } from "@/components/app/avatar";
import { ErrorState, Skeleton } from "@/components/app/states";
import { StatCard } from "@/components/stat-card";
import { notLiveNote } from "@/content/copy";
import {
  useKeeperStatus,
  useRecentClaims,
  useTopTokens,
  useTotals,
  type Live,
} from "@/data/context";
import { byAsset, joinAmounts, nonZero, symbolOf } from "@/lib/assets";
import { explorerTxUrl } from "@/lib/chain";

/** The "All routed tokens" table; the indexer returns them ranked by total paid. */
const ALL_TOKENS_LIMIT = 200;

const handleOf = (a: XAccount) => (a.username ? `@${a.username}` : `X user ${a.userId}`);

export function PaymentsView() {
  const totals = useTotals();
  const claims = useRecentClaims(10);
  const tokens = useTopTokens(ALL_TOKENS_LIMIT);
  const keeper = useKeeperStatus();

  const live = totals.data?.live ?? claims.data?.live ?? tokens.data?.live;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[640px]">
          <h1 className="m-0 text-4xl font-semibold tracking-tight">Payments</h1>
          <p className="mt-2.5 mb-0 leading-relaxed text-muted">
            Every fee FeeFlow received, every claim, and every amount still on its way. Each figure
            links to the chain.
          </p>
        </div>
        <KeeperLine status={keeper.data} />
      </div>
      {live === false ? <p className="mt-4 mb-0 text-sm text-muted">{notLiveNote}</p> : null}

      <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-12">
        <TopTokens query={tokens} className="md:col-span-7" />
        <RecentClaims query={claims} className="md:col-span-5" />
        <TotalsCards query={totals} />
      </div>

      <SecondaryTotals query={totals} />
      <AllTokens query={tokens} />
      <About />
    </>
  );
}

// ---------------------------------------------------------------- shared

interface Q<T> {
  data: Live<T> | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => unknown;
}

/** Renders loading / error / value for one query. Not-live renders `empty`. */
function Section<T>({
  query,
  loading,
  empty,
  children,
}: {
  query: Q<T>;
  loading: ReactNode;
  empty: ReactNode;
  children: (value: T) => ReactNode;
}) {
  if (query.isError) {
    return (
      <ErrorState
        message={query.error?.message ?? "Something went wrong."}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isPending || !query.data) return <>{loading}</>;
  return <>{query.data.live ? children(query.data.value) : empty}</>;
}

function KeeperLine({
  status,
}: {
  status: Live<{ lastRunAt: number | null; stale: boolean }> | undefined;
}) {
  const s = status?.live ? status.value : null;
  return (
    <p className="m-0 flex items-center gap-2 font-mono text-[13px] text-muted">
      {s && !s.stale && s.lastRunAt !== null ? (
        <LiveDot />
      ) : (
        <span aria-hidden className="inline-block size-2 rounded-full border border-line-strong" />
      )}
      Last keeper run: {s?.lastRunAt != null ? formatRelative(s.lastRunAt) : "—"}
      {s?.stale ? <span className="font-sans text-warn-ink"> · delayed</span> : null}
    </p>
  );
}

function TokenAvatarStack({ t }: { t: TokenSummary }) {
  return (
    <span className="relative inline-flex">
      <TokenLogo token={t} size={44} />
      <Avatar
        src={t.recipient.avatarUrl}
        label={handleOf(t.recipient)}
        size={22}
        className="absolute -right-1.5 -bottom-1.5 ring-2 ring-surface"
      />
    </span>
  );
}

function TxLinkShort({ hash }: { hash: `0x${string}` }) {
  const url = explorerTxUrl(hash);
  if (!url) return null;
  return (
    <a
      className="font-mono text-[13px]"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={hash}
    >
      tx<span aria-hidden> ↗</span>
      <span className="sr-only"> (on the explorer)</span>
    </a>
  );
}

// ---------------------------------------------------------------- top tokens / recent claims

function TopTokens({ query, className }: { query: Q<TokenSummary[]>; className?: string }) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Top fee-earning tokens</CardTitle>
        <a href="#all-tokens" className="text-sm">
          Full table
        </a>
      </div>
      <Section
        query={query}
        loading={<Skeleton className="mt-4 h-36" />}
        empty={<p className="mt-4 mb-0 text-sm text-muted">—</p>}
      >
        {(tokens) =>
          tokens.length === 0 ? (
            <p className="mt-4 mb-0 text-sm text-muted">No routed tokens yet.</p>
          ) : (
            <ul className="mt-4 mb-0 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-3">
              {tokens.slice(0, 3).map((t) => (
                <li key={t.address}>
                  <Link
                    href={`/tokens/${t.address}`}
                    className="flex h-full flex-col gap-1.5 rounded-[var(--radius-tile)] border border-line p-4 no-underline hover:border-line-strong"
                  >
                    <TokenAvatarStack t={t} />
                    <span className="mt-2.5 font-semibold">{t.name}</span>
                    <span className="font-mono text-xs text-muted">{handleOf(t.recipient)}</span>
                    <span className="font-mono text-sm">
                      <Amount value={t.totalPaid} /> paid
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </Section>
    </Card>
  );
}

function RecentClaims({ query, className }: { query: Q<ClaimRecord[]>; className?: string }) {
  return (
    <Card className={className}>
      <CardTitle>Recent claims</CardTitle>
      <Section
        query={query}
        loading={<Skeleton className="mt-4 h-36" />}
        empty={<p className="mt-4 mb-0 text-sm text-muted">—</p>}
      >
        {(claims) =>
          claims.length === 0 ? (
            <p className="mt-4 mb-0 text-sm text-muted">No claims yet.</p>
          ) : (
            <ul className="mt-3 mb-0 list-none p-0">
              {claims.map((c, i) => (
                <li
                  key={c.txHash}
                  className={cn(
                    "flex items-start gap-3 py-2.5 text-sm",
                    i < claims.length - 1 && "border-b border-line",
                  )}
                >
                  <Avatar src={c.account.avatarUrl} label={handleOf(c.account)} size={32} />
                  <div className="min-w-0 flex-1">
                    <span className="font-mono">{joinAmounts([...c.amounts].sort(byAsset))}</span>{" "}
                    claimed by <span className="font-mono">{handleOf(c.account)}</span>
                    <div className="text-xs text-muted">
                      {c.tokens.length === 1
                        ? `$${c.tokens[0]!.symbol}`
                        : `${c.tokens.length} tokens`}{" "}
                      · {formatRelative(c.timestamp)}
                    </div>
                  </div>
                  <TxLinkShort hash={c.txHash} />
                </li>
              ))}
            </ul>
          )
        }
      </Section>
    </Card>
  );
}

// ---------------------------------------------------------------- totals

/**
 * Primary figure = first asset (USDG, then ETH); the other non-zero assets as a "+ 1.2400 ETH"
 * line. Never summed across assets.
 */
function split(rows: AssetTotals[], pick: (r: AssetTotals) => string) {
  const amounts = rows.map((r) => amount(r.asset, pick(r))).sort(byAsset);
  const [first, ...rest] = amounts;
  const others = rest.filter(nonZero);
  return {
    value: first ? formatRaw(first.raw, first.asset) : null,
    unit: first ? symbolOf(first.asset) : undefined,
    secondary: others.length ? `+ ${joinAmounts(others)}` : null,
  };
}

/** Non-zero amounts per asset; a single zero in the first asset when everything is zero. */
function line(rows: AssetTotals[] | null, pick: (r: AssetTotals) => string) {
  if (!rows || rows.length === 0) return "—";
  const amounts = rows.map((r) => amount(r.asset, pick(r))).sort(byAsset);
  const shown = amounts.filter(nonZero);
  return joinAmounts(shown.length ? shown : amounts.slice(0, 1));
}

function TotalsCards({ query }: { query: Q<{ assets: AssetTotals[] }> }) {
  const rows = query.data?.live ? query.data.value.assets : [];
  const first = [...rows].sort((a, b) => byAsset(amount(a.asset, "0"), amount(b.asset, "0")))[0];
  const claimedShare =
    first && BigInt(first.collectedGross) > 0n
      ? Number((BigInt(first.claimed) * 10_000n) / BigInt(first.collectedGross)) / 10_000
      : null;
  const cls = "md:col-span-4";

  if (query.isError) {
    return (
      <div className="md:col-span-12">
        <ErrorState
          message={query.error?.message ?? "Something went wrong."}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <>
        <Skeleton className={cn("h-44", cls)} />
        <Skeleton className={cn("h-44", cls)} />
        <Skeleton className={cn("h-44", cls)} />
      </>
    );
  }

  const collected = split(rows, (r) => r.collectedGross);
  const claimed = split(rows, (r) => r.claimed);
  const accrued = split(rows, (r) => r.accrued);
  return (
    <>
      <StatCard
        className={cls}
        label="Total fees collected into FeeFlow"
        {...collected}
        footnote={<a href="#about">How this is counted</a>}
      />
      <StatCard
        className={cls}
        label="Total claimed"
        {...claimed}
        progress={claimedShare}
        progressLabel="Share of collected fees claimed"
        footnote={
          claimedShare !== null && first
            ? `${Math.round(claimedShare * 100)}% of collected ${symbolOf(first.asset)}`
            : null
        }
      />
      <StatCard
        className={cls}
        label="Accrued, not yet sent"
        {...accrued}
        footnote="Unswept on Pons plus waiting in the Pons escrow. Real, but not in FeeFlow yet."
      />
    </>
  );
}

function SecondaryTotals({ query }: { query: Q<{ assets: AssetTotals[] }> }) {
  const rows = query.data?.live ? query.data.value.assets : null;
  const items: [string, string][] = [
    ["FeeFlow fee taken (1%, fixed)", line(rows, (r) => r.feesTaken)],
    ["Unclaimed in contract", line(rows, (r) => r.unclaimed)],
    ["Expired to creators", line(rows, (r) => r.expiredToCreators)],
  ];
  return (
    <dl className="mt-5 mb-0 grid grid-cols-1 gap-5 md:grid-cols-3">
      {items.map(([label, value]) => (
        <Card key={label} className="py-4">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="m-0 mt-1.5 font-mono text-lg font-medium">
            {query.isPending ? <Skeleton className="h-6 w-32" /> : value}
          </dd>
        </Card>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- all tokens

function AllTokens({ query }: { query: Q<TokenSummary[]> }) {
  return (
    <Card flush id="all-tokens" className="mt-5 scroll-mt-24">
      <CardTitle className="px-6 pt-5">All routed tokens</CardTitle>
      <Section
        query={query}
        loading={<Skeleton className="m-6 h-48" />}
        empty={<p className="m-0 px-6 py-5 text-sm text-muted">{notLiveNote}</p>}
      >
        {(tokens) =>
          tokens.length === 0 ? (
            <p className="m-0 px-6 py-5 text-sm text-muted">No routed tokens yet.</p>
          ) : (
            <TableScroll className="mt-3">
              <Table className="min-w-[760px]">
                <thead>
                  <tr>
                    <Th className="pl-6">Token</Th>
                    <Th>Recipient</Th>
                    <Th aria-sort="descending">Total paid ↓</Th>
                    <Th>Accrued, not yet sent</Th>
                    <Th>Last activity</Th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.address}>
                      <Td className="pl-6">
                        <Link
                          href={`/tokens/${t.address}`}
                          className="inline-flex items-center gap-2.5 no-underline"
                        >
                          <TokenLogo token={t} size={32} />
                          <span>
                            <strong>{t.name}</strong>{" "}
                            <span className="font-mono text-xs text-muted">${t.symbol}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <Avatar
                            src={t.recipient.avatarUrl}
                            label={handleOf(t.recipient)}
                            size={24}
                          />
                          <span className="font-mono">{handleOf(t.recipient)}</span>
                        </span>
                      </Td>
                      <Td>
                        <Amount value={t.totalPaid} />
                      </Td>
                      <Td>
                        <Amount value={t.accrued} />
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {t.lastActivityAt !== null ? formatRelative(t.lastActivityAt) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          )
        }
      </Section>
    </Card>
  );
}

// ---------------------------------------------------------------- about

function About() {
  return (
    <Card id="about" className="mt-5 scroll-mt-24">
      <CardTitle>About these numbers</CardTitle>
      <ul className="mt-3 mb-0 flex flex-col gap-1.5 pl-4.5 text-sm leading-normal text-muted">
        <li>
          Collection depends on a keeper; anyone can collect from a token page if it is delayed.
        </li>
        <li>Pons v2 is unaudited as of 21 Nov 2026.</li>
        <li>USDG is issued by Paxos, which can freeze, wipe, or pause it.</li>
        <li>Claims are authorised by a FeeFlow attestation service.</li>
        <li>FeeFlow keeps a fixed 1% of each collection.</li>
        <li>
          Each credited amount is claimable for 30 days, then can go to the registering creator.
        </li>
        <li>Creators and X account owners can both redirect future fees.</li>
        <li>USDG amounts are shown 1:1; no other prices are used.</li>
      </ul>
    </Card>
  );
}
