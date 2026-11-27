"use client";

import { isNative, knownPairAssets, type PairAsset } from "@feeflow/config";
import { initials, shortAddress, type TokenSummary } from "@feeflow/sdk";
import { Badge, Button, Card, Segmented, cn } from "@feeflow/ui";
import { Check, Copy, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Amount } from "@/components/app/amount";
import { Avatar } from "@/components/app/avatar";
import { EmptyState, ErrorState, Skeleton } from "@/components/app/states";
import { notLiveNote } from "@/content/copy";
import { useTokenList, useTopTokens } from "@/data/context";
import type { TokenSort } from "@/data/types";
import { symbolOf } from "@/lib/assets";
import { APP_CHAIN_ID } from "@/lib/chain";

const PAGE_SIZE = 30;
const TRENDING = 10;

const SORTS: readonly { value: TokenSort; label: string }[] = [
  { value: "recent", label: "Newest" },
  { value: "paid", label: "Most paid" },
];

const handleOf = (t: TokenSummary) =>
  t.recipient.username ? `@${t.recipient.username}` : `X user ${t.recipient.userId}`;

/** Pair assets the filter offers: every asset, or one known asset. USDG first. */
function assetChoices(): PairAsset[] {
  return [...knownPairAssets(APP_CHAIN_ID)].sort(
    (a, b) => Number(isNative(a)) - Number(isNative(b)),
  );
}

export function ExploreView() {
  const assets = assetChoices();
  const [sort, setSort] = useState<TokenSort>("recent");
  const [asset, setAsset] = useState<string>("");
  const [text, setText] = useState("");
  const query = useDebounced(text.trim(), 300);

  // "Most paid" compares amounts, so it needs one asset: amounts in different assets are never
  // ranked together.
  const changeSort = (next: TokenSort) => {
    setSort(next);
    if (next === "paid" && !asset && assets[0]) setAsset(assets[0].address.toLowerCase());
  };
  const changeAsset = (next: string) => {
    setAsset(next);
    if (!next && sort === "paid") setSort("recent");
  };

  return (
    <>
      <Intro />
      <Trending />

      <section aria-labelledby="all-tokens" className="mt-10">
        <h2 id="all-tokens" className="m-0 text-lg font-semibold">
          All tokens
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Segmented
            label="Pair asset"
            value={asset}
            options={[
              { value: "", label: "All" },
              ...assets.map((a) => ({ value: a.address.toLowerCase(), label: symbolOf(a) })),
            ]}
            onChange={changeAsset}
          />
          <SearchBox value={text} onChange={setText} />
          <Segmented label="Sort" value={sort} options={SORTS} onChange={changeSort} />
        </div>
        <TokenGrid sort={sort} asset={asset || undefined} q={query || undefined} />
      </section>
    </>
  );
}

function Intro() {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-5 p-6 sm:p-8">
      <div className="max-w-[560px]">
        <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">Explore tokens</h1>
        <p className="mt-2.5 mb-0 leading-relaxed text-muted">
          Every Pons v2 token that routes its creator fees through FeeFlow, with the X account it
          pays and what it has paid so far.
        </p>
      </div>
      <Button asChild>
        <Link href="/route">Route a token</Link>
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------- trending

function Trending() {
  const top = useTopTokens(TRENDING);
  const tokens = top.data?.live ? top.data.value : [];
  if (top.isError) return null; // The grid below shows the error and the retry.
  if (top.data && (!top.data.live || tokens.length === 0)) return null;

  return (
    <section aria-labelledby="trending" className="mt-8">
      <h2 id="trending" className="m-0 text-lg font-semibold">
        Trending
      </h2>
      <p className="mt-1 mb-0 text-sm text-muted">Most collections and claims.</p>
      <ul className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {top.isPending
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex-none">
                <Skeleton className="h-[72px] w-[260px] rounded-[14px]" />
              </li>
            ))
          : tokens.map((t) => (
              <li key={t.address} className="flex-none snap-start">
                <Link
                  href={`/tokens/${t.address}`}
                  className="flex w-[260px] items-center gap-3 rounded-[14px] border border-line bg-surface p-3 text-ink no-underline hover:border-line-strong"
                >
                  <TokenTile token={t} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {t.name}{" "}
                      <span className="font-mono text-xs font-normal text-muted">${t.symbol}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm">
                      <Amount value={t.totalPaid} className="font-semibold" />{" "}
                      <span className="text-xs text-muted">paid</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- grid

function TokenGrid({ sort, asset, q }: { sort: TokenSort; asset?: string; q?: string }) {
  const list = useTokenList({ sort, asset, q, limit: PAGE_SIZE });
  const pages = list.data?.pages ?? [];
  const notLive = pages[0] === null;
  const tokens = pages.flatMap((p) => p?.tokens ?? []);

  if (list.isError) {
    return (
      <ErrorState
        className="mt-5"
        message={list.error.message}
        onRetry={() => void list.refetch()}
      />
    );
  }
  if (list.isPending) {
    return (
      <ul className={GRID} aria-busy>
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}>
            <Skeleton className="aspect-[3/4] w-full rounded-[14px]" />
          </li>
        ))}
      </ul>
    );
  }
  if (notLive) return <p className="mt-5 text-sm text-muted">{notLiveNote}</p>;
  if (tokens.length === 0) {
    return q ? (
      <EmptyState className="mt-5" title="No tokens match" body={`Nothing matches “${q}”.`} />
    ) : (
      <EmptyState
        className="mt-5"
        title="No tokens yet"
        body="Tokens appear here once their creators route fees through FeeFlow."
        action={
          <Button asChild>
            <Link href="/route">Route a token</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ul className={GRID}>
        {tokens.map((t) => (
          <li key={t.address}>
            <TokenCard token={t} />
          </li>
        ))}
      </ul>
      {list.hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

const GRID = "mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5 list-none p-0";

/** The whole card links to the token page; the copy button sits above that link. */
function TokenCard({ token: t }: { token: TokenSummary }) {
  return (
    <article className="relative flex h-full flex-col rounded-[14px] border border-line bg-surface p-2 hover:border-line-strong">
      <div className="relative">
        <TokenTile token={t} size="lg" />
        <span className="absolute top-2 right-2 rounded-full bg-surface/90 px-2 py-0.5 font-mono text-[11px] text-muted">
          <span title={new Date(t.routedAt * 1000).toISOString().slice(0, 10)}>
            {age(t.routedAt)}
          </span>
        </span>
        {t.status === "exited" ? (
          <Badge tone="muted" className="absolute top-2 left-2 bg-surface/90">
            Exited
          </Badge>
        ) : null}
        <span className="absolute bottom-2 left-2 inline-flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-full bg-surface/95 py-1 pr-2.5 pl-1 text-xs font-medium">
          <Avatar src={t.recipient.avatarUrl} label={handleOf(t)} size={20} />
          <span className="truncate">{handleOf(t)}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col px-1.5 pt-2.5 pb-1">
        <h3 className="m-0 truncate text-[15px] font-semibold">
          <Link
            href={`/tokens/${t.address}`}
            className="text-ink no-underline after:absolute after:inset-0 after:rounded-[14px]"
          >
            {t.name}
          </Link>{" "}
          <span className="font-mono text-xs font-normal text-muted">${t.symbol}</span>
        </h3>
        <p className="mt-1.5 mb-0 flex items-baseline gap-1.5 text-sm">
          <Amount value={t.totalPaid} className="font-semibold" />
          <span className="text-xs text-muted">paid</span>
        </p>
        <CopyAddress address={t.address} />
      </div>
    </article>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="relative z-10 mt-1.5 inline-flex w-fit cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 font-mono text-[11px] text-muted hover:bg-subtle"
      title={address}
      onClick={() => {
        void navigator.clipboard?.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {shortAddress(address)}
      <span className="sr-only">{copied ? " copied" : " copy token address"}</span>
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
    </button>
  );
}

/** Token art: no verified image source yet (PONS_TOKEN_IMAGE_SOURCE), so a monogram tile. */
function TokenTile({ token: t, size }: { token: TokenSummary; size: "sm" | "lg" }) {
  if (size === "sm") {
    return (
      <span
        aria-hidden
        className="inline-flex size-12 flex-none items-center justify-center rounded-[10px] bg-subtle font-mono text-sm font-medium"
      >
        {initials(t.name)}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex aspect-square w-full items-center justify-center rounded-[10px] bg-subtle font-mono text-4xl font-medium text-ink/80",
      )}
    >
      {initials(t.name)}
    </span>
  );
}

// ---------------------------------------------------------------- search

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="relative min-w-[220px] flex-1">
      <label htmlFor={id} className="sr-only">
        Filter by name, symbol or address
      </label>
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Name, symbol or address"
        spellCheck={false}
        autoComplete="off"
        className="h-11 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none"
      />
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Time since routing, short: "45m", "6h", "62d". */
export function age(unixSeconds: number, now = Math.floor(Date.now() / 1000)): string {
  const s = Math.max(0, now - unixSeconds);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
