"use client";

import { isNative, knownPairAssets } from "@feeflow/config";
import {
  formatRelative,
  initials,
  type ClaimRecord,
  type LeaderboardEntry,
  type TokenSummary,
} from "@feeflow/sdk";
import { cn } from "@feeflow/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Amount } from "@/components/app/amount";
import { Avatar } from "@/components/app/avatar";
import { createDataSource } from "@/data/context";
import { joinAmounts } from "@/lib/assets";
import { APP_CHAIN_ID } from "@/lib/chain";

interface Preview {
  tokens: TokenSummary[];
  claims: ClaimRecord[];
  leaders: LeaderboardEntry[];
}

/** `undefined` while loading, `null` when not live or unreachable: cards then show no figures. */
function usePreview(): Preview | null | undefined {
  const [state, setState] = useState<Preview | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const usdg = knownPairAssets(APP_CHAIN_ID).find((a) => !isNative(a));
    createDataSource()
      .then(async (ds) => {
        if (!ds) return null;
        const [tokens, claims, leaders] = await Promise.all([
          ds.getTopTokens(6),
          ds.getRecentClaims(3),
          usdg ? ds.getLeaderboard("all", usdg.address, 3) : Promise.resolve([]),
        ]);
        return { tokens, claims, leaders };
      })
      .catch(() => null)
      .then((p) => alive && setState(p));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

const handle = (a: { username: string | null; userId: string }) =>
  a.username ? `@${a.username}` : `X user ${a.userId}`;

/**
 * Home overview: one card per section, each a link with its name and "Open". Live cards read the
 * indexer directly (this page ships without the app's providers); they never show sample data.
 */
export function HomeMosaic() {
  const p = usePreview();
  return (
    <section
      aria-label="Sections"
      className="mx-auto grid max-w-[1000px] grid-cols-1 gap-4 md:grid-cols-12"
    >
      <Tile href="/explore" label="Explore" className="md:col-span-7">
        <ExplorePreview p={p} />
      </Tile>
      <Tile href="/payments" label="Payments" className="md:col-span-5">
        <ClaimsPreview p={p} />
      </Tile>
      <Tile href="/leaderboard" label="Leaderboard" className="md:col-span-4">
        <LeadersPreview p={p} />
      </Tile>
      <Tile href="/route" label="Route a token" className="md:col-span-4">
        <RoutePreview />
      </Tile>
      <Tile href="/docs" label="Docs" className="md:col-span-4">
        <DocsPreview />
      </Tile>
    </section>
  );
}

function Tile({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[230px] flex-col overflow-hidden rounded-[16px] border border-line bg-surface text-ink no-underline hover:border-line-strong",
        className,
      )}
    >
      <div className="relative flex-1 overflow-hidden p-4">{children}</div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="inline-flex items-center gap-1 text-muted group-hover:text-ink">
          Open <ArrowRight size={14} aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm leading-relaxed text-muted">{children}</p>;
}

function Loading({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="h-10 animate-pulse rounded-[10px] bg-subtle" />
      ))}
    </div>
  );
}

function ExplorePreview({ p }: { p: Preview | null | undefined }) {
  if (p === undefined) return <Loading rows={3} />;
  if (!p || p.tokens.length === 0) {
    return <Quiet>Every token routed through FeeFlow, with the X account it pays.</Quiet>;
  }
  return (
    <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
      {p.tokens.map((t) => (
        <li key={t.address} className="rounded-[12px] border border-line p-2">
          <span
            aria-hidden
            className="flex aspect-[4/3] items-center justify-center rounded-[8px] bg-subtle font-mono text-xl"
          >
            {initials(t.name)}
          </span>
          <span className="mt-1.5 block truncate text-[13px] font-semibold">{t.name}</span>
          <span className="block truncate text-xs text-muted">
            <Amount value={t.totalPaid} /> paid
          </span>
        </li>
      ))}
    </ul>
  );
}

function ClaimsPreview({ p }: { p: Preview | null | undefined }) {
  if (p === undefined) return <Loading rows={3} />;
  if (!p || p.claims.length === 0) {
    return <Quiet>Every claim, with its transaction. Nothing has been claimed yet.</Quiet>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {p.claims.map((c) => (
        <li
          key={c.txHash}
          className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5"
        >
          <Avatar src={c.account.avatarUrl} label={handle(c.account)} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-sm font-semibold">
              {joinAmounts(c.amounts)}
            </span>
            <span className="block truncate text-xs text-muted">
              claimed by {handle(c.account)}
            </span>
          </span>
          <span className="flex-none text-xs text-muted">{formatRelative(c.timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}

function LeadersPreview({ p }: { p: Preview | null | undefined }) {
  if (p === undefined) return <Loading rows={3} />;
  if (!p || p.leaders.length === 0) {
    return <Quiet>X accounts ranked by the USDG they have received.</Quiet>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {p.leaders.map((e) => (
        <li key={e.account.userId} className="flex items-center gap-2.5 text-sm">
          <span className="w-4 font-mono text-muted">{e.rank}</span>
          <Avatar src={e.account.avatarUrl} label={handle(e.account)} size={24} />
          <span className="min-w-0 flex-1 truncate">{handle(e.account)}</span>
          <Amount value={e.received} className="font-semibold" />
        </li>
      ))}
    </ol>
  );
}

/** A still of the route form: the steps, not a working input. */
function RoutePreview() {
  return (
    <div aria-hidden className="flex flex-col gap-2 text-sm">
      <span className="text-[11px] tracking-[0.08em] text-muted uppercase">Fees route to</span>
      <span className="rounded-full border-2 border-ink px-3.5 py-2 font-mono text-[13px]">
        @your_x_handle
      </span>
      <ol className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0 text-muted">
        {["Paste the token address", "Find the X account", "Sign and register"].map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded-md bg-subtle font-mono text-[11px] text-ink">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

function DocsPreview() {
  const rows = [
    ["FEE_BPS", "100", "1%, fixed"],
    ["CLAIM_WINDOW", "30 days", "per amount"],
    ["Payout", "pair asset", "USDG or ETH"],
  ] as const;
  return (
    <dl
      aria-hidden
      className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-mono text-[12.5px]"
    >
      {rows.map(([k, v, note]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0">
            {v} <span className="text-muted">· {note}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
