"use client";

import { isNative, knownPairAssets } from "@feeflow/config";
import {
  formatAmount,
  formatRelative,
  initials,
  type Amount as AmountValue,
  type ClaimRecord,
  type LeaderboardEntry,
  type TokenSummary,
} from "@feeflow/sdk";
import { cn } from "@feeflow/ui";
import { ArrowLeftRight, ArrowRight, Check, Coins } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Amount } from "@/components/app/amount";
import { Avatar } from "@/components/app/avatar";
import { createDataSource } from "@/data/context";
import { joinAmounts } from "@/lib/assets";
import { APP_CHAIN_ID } from "@/lib/chain";

interface Preview {
  tokens: TokenSummary[];
  claims: ClaimRecord[];
  leaders: LeaderboardEntry[];
  /** Net USDG credited to X accounts so far. */
  paid: AmountValue | null;
}

/** `undefined` while loading, `null` when not live or unreachable. */
function usePreview(): Preview | null | undefined {
  const [state, setState] = useState<Preview | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const usdg = knownPairAssets(APP_CHAIN_ID).find((a) => !isNative(a));
    createDataSource()
      .then(async (ds) => {
        if (!ds) return null;
        const [tokens, claims, leaders, totals] = await Promise.all([
          ds.getTopTokens(12),
          ds.getRecentClaims(8),
          usdg ? ds.getLeaderboard("all", usdg.address, 3) : Promise.resolve([]),
          ds.getTotals(),
        ]);
        const t = usdg
          ? totals.assets.find((a) => a.asset.address.toLowerCase() === usdg.address.toLowerCase())
          : undefined;
        const paid = usdg ? { asset: t?.asset ?? usdg, raw: t?.credited ?? "0" } : null;
        return { tokens, claims, leaders, paid };
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
 * Home overview: five animated cards, one per section, each a link with its name and "Open".
 * Cards with live data show it; until there is any they show placeholder shapes, never sample
 * figures. The motion is decorative (aria-hidden), pauses on hover and stops for reduced motion.
 */
export function HomeMosaic() {
  const p = usePreview();
  return (
    <section
      aria-label="Sections"
      className="mx-auto grid max-w-[1000px] grid-cols-1 gap-4 md:grid-cols-12"
    >
      <Tile href="/explore" label="Explore" className="md:col-span-7" tall>
        <ExploreMotion tokens={p?.tokens ?? []} />
      </Tile>
      <Tile href="/payments" label="Payments" className="md:col-span-5" tall>
        <PaymentsMotion claims={p?.claims ?? []} />
      </Tile>
      <Tile href="/leaderboard" label="Leaderboard" className="md:col-span-4">
        <LeaderboardMotion p={p} />
      </Tile>
      <Tile href="/route" label="Route a token" className="md:col-span-4">
        <RouteMotion />
      </Tile>
      <Tile href="/docs" label="Docs" className="md:col-span-4">
        <DocsMotion />
      </Tile>
    </section>
  );
}

function Tile({
  href,
  label,
  className,
  tall,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  tall?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[16px] border border-line bg-surface text-ink no-underline hover:border-line-strong",
        className,
      )}
    >
      <div aria-hidden className={cn("relative overflow-hidden", tall ? "h-[250px]" : "h-[200px]")}>
        {children}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="inline-flex items-center gap-1 text-muted group-hover:text-ink">
          Open{" "}
          <ArrowRight
            size={14}
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}

/** Renders `children` twice in a column that scrolls by half its height, forever. */
function Loop({
  dir = "up",
  seconds,
  className,
  children,
}: {
  dir?: "up" | "down";
  seconds: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(dir === "up" ? "ff-loop-up" : "ff-loop-down", className)}
      style={{ "--ff-dur": `${seconds}s` } as CSSProperties}
    >
      <div className="flex flex-col gap-2.5 pb-2.5">{children}</div>
      <div className="flex flex-col gap-2.5 pb-2.5">{children}</div>
    </div>
  );
}

/** Repeats a list until it has at least `n` items, so short lists still fill a loop. */
function fill<T>(items: T[], n: number): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  while (out.length < n) out.push(...items);
  return out;
}

// ---------------------------------------------------------------- Explore

function ExploreMotion({ tokens }: { tokens: TokenSummary[] }) {
  const cols = 4;
  const list = fill(tokens, cols * 3);
  return (
    <div className="ff-fade-y grid h-full grid-cols-3 gap-2.5 px-3 sm:grid-cols-4">
      {Array.from({ length: cols }, (_, c) => (
        <Loop
          key={c}
          dir={c % 2 ? "down" : "up"}
          seconds={26 + c * 5}
          className={c === 3 ? "hidden sm:block" : undefined}
        >
          {list.length
            ? list
                .filter((_, i) => i % cols === c)
                .map((t, i) => <TokenTile key={`${t.address}-${i}`} t={t} />)
            : Array.from({ length: 3 }, (_, i) => <GhostToken key={i} seed={c * 3 + i} />)}
        </Loop>
      ))}
    </div>
  );
}

function TokenTile({ t }: { t: TokenSummary }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface p-1.5">
      <div className="relative flex aspect-square items-center justify-center rounded-[8px] bg-subtle font-mono text-xl">
        {initials(t.name)}
        <span className="absolute top-1 right-1 rounded-full bg-surface/90 px-1.5 font-mono text-[9px] text-muted">
          {formatRelative(t.routedAt)}
        </span>
        <span className="absolute bottom-1 left-1 inline-flex max-w-[calc(100%-8px)] items-center gap-1 rounded-full bg-surface/95 py-0.5 pr-1.5 pl-0.5 text-[9px]">
          <Avatar src={t.recipient.avatarUrl} label={handle(t.recipient)} size={12} />
          <span className="truncate">{handle(t.recipient)}</span>
        </span>
      </div>
      <div className="truncate px-0.5 pt-1.5 text-[11px] font-semibold">
        {t.name} <span className="font-mono font-normal text-muted">{t.symbol}</span>
      </div>
      <div className="truncate px-0.5 font-mono text-[10px]">
        <Amount value={t.totalPaid} /> <span className="font-sans text-muted">paid</span>
      </div>
    </div>
  );
}

/** Placeholder token tile: the card's shape with no name or figure. */
function GhostToken({ seed }: { seed: number }) {
  const tints = ["bg-accent/30", "bg-subtle", "bg-accent/15", "bg-subtle-2"];
  return (
    <div className="rounded-[12px] border border-line bg-surface p-1.5">
      <div
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-[8px]",
          tints[seed % tints.length],
        )}
      >
        <Coins size={22} className="text-ink/25" />
        <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-surface/90 py-0.5 pr-2 pl-0.5">
          <span className="size-3 rounded-full bg-subtle-2" />
          <span className="h-1.5 w-8 rounded-full bg-subtle-2" />
        </span>
      </div>
      <div className="mt-2 h-2 w-3/4 rounded-full bg-subtle" />
      <div className="mt-1.5 mb-0.5 h-2 w-1/2 rounded-full bg-subtle" />
    </div>
  );
}

// ---------------------------------------------------------------- Payments

function PaymentsMotion({ claims }: { claims: ClaimRecord[] }) {
  const rows = fill(claims, 6);
  return (
    <div className="ff-fade-y h-full px-4">
      <Loop seconds={22}>
        {rows.length
          ? rows.map((c, i) => <ClaimRow key={`${c.txHash}-${i}`} c={c} />)
          : Array.from({ length: 4 }, (_, i) => <GhostClaim key={i} />)}
      </Loop>
    </div>
  );
}

function ClaimRow({ c }: { c: ClaimRecord }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5">
      <Avatar src={c.account.avatarUrl} label={handle(c.account)} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm font-semibold">
          {joinAmounts(c.amounts)}
        </span>
        <span className="block truncate text-xs text-muted">claimed by {handle(c.account)}</span>
      </span>
      <span className="flex-none text-xs text-muted">{formatRelative(c.timestamp)}</span>
    </div>
  );
}

/** Placeholder payment row: what a claim looks like, marked as not happened yet. */
function GhostClaim() {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Creator fees</span>
        <span className="block text-xs text-muted">to an X account</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-subtle font-mono text-[11px]">
          ⛓
        </span>
        <ArrowLeftRight size={12} className="text-muted" />
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-surface">
          𝕏
        </span>
      </span>
      <span className="w-[86px] flex-none text-right text-[11px] text-muted">Awaiting claim</span>
    </div>
  );
}

// ---------------------------------------------------------------- Leaderboard

function LeaderboardMotion({ p }: { p: Preview | null | undefined }) {
  const leader = p?.leaders[0];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between px-4 pt-3.5">
        <div>
          <div className="text-xs text-muted">Paid to X accounts</div>
          <Odometer value={p?.paid ?? null} />
        </div>
        <span className="rounded-full bg-subtle px-2 py-0.5 font-mono text-[10px] text-muted">
          ALL
        </span>
      </div>
      <div className="px-4 pt-1 text-xs text-muted">
        {leader ? (
          <span className="ff-rise inline-flex items-center gap-1.5">
            <span className="font-mono">#1</span>
            <Avatar src={leader.account.avatarUrl} label={handle(leader.account)} size={16} />
            {handle(leader.account)}
          </span>
        ) : (
          "Top earners appear here"
        )}
      </div>
      <Wave />
    </div>
  );
}

/** Rolling digits: each digit is a 0–9 strip that slides to its value. */
function Odometer({ value }: { value: AmountValue | null }) {
  const target = value ? formatAmount(value, { withUnit: false, chainId: APP_CHAIN_ID }) : "0.00";
  const [shown, setShown] = useState(target.replace(/\d/g, "0"));
  useEffect(() => {
    const id = setTimeout(() => setShown(target), 120);
    return () => clearTimeout(id);
  }, [target]);
  const unit = value ? ` ${formatAmount(value, { chainId: APP_CHAIN_ID }).split(" ").pop()}` : "";
  return (
    <div className="mt-1 flex items-baseline font-mono text-[28px] leading-none font-medium">
      {[...shown].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="inline-block h-[1em] overflow-hidden">
            <span
              className="ff-odo-strip flex flex-col transition-transform duration-[1400ms] ease-out"
              style={{
                transform: `translateY(-${Number(ch)}em)`,
                transitionDelay: `${i * 60}ms`,
              }}
            >
              {"0123456789".split("").map((d) => (
                <span key={d} className="h-[1em]">
                  {d}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
      <span className="ml-1.5 text-sm text-muted">{unit.trim()}</span>
    </div>
  );
}

/** Decorative line chart that drifts left; two identical periods make the loop seamless. */
function Wave() {
  const period = "C 40 52, 60 20, 100 30 S 160 60, 200 40 S 260 10, 300 34 S 360 58, 400 40";
  const path = `M 0 40 ${period} ${period.replace(/(\d+) (\d+)/g, (_, x, y) => `${Number(x) + 400} ${y}`)}`;
  return (
    <div className="ff-fade-x relative mt-auto h-[90px] overflow-hidden">
      <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-line" />
      <svg
        viewBox="0 0 800 80"
        preserveAspectRatio="none"
        className="ff-loop-left absolute inset-y-0 left-0 h-full w-[200%]"
        style={{ "--ff-dur": "10s" } as CSSProperties}
      >
        <defs>
          <linearGradient id="ff-wave-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L 800 80 L 0 80 Z`} fill="url(#ff-wave-fill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- Route a token

const ROUTE_STEPS = ["Token found", "X account linked", "Message signed", "Fees route to X"];

/** The route flow as a loop: each step lands in turn, then it starts over. */
function RouteMotion() {
  const [step, setStep] = useState(ROUTE_STEPS.length);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (ROUTE_STEPS.length + 3)), 1100);
    return () => clearInterval(id);
  }, []);
  const done = step >= ROUTE_STEPS.length;
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <span className="text-[10px] tracking-[0.1em] text-muted uppercase">Token setup</span>
      <div className="flex items-center gap-2.5 rounded-[10px] bg-subtle px-3 py-2">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-ink text-xs text-surface">
          𝕏
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Your X account</span>
          <span className="block font-mono text-[11px] text-muted">@your_x_handle</span>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
        {ROUTE_STEPS.map((s, i) => (
          <li
            key={`${s}-${i < step || done ? "on" : "off"}`}
            className={cn(
              "flex items-center gap-2",
              i < step || done ? "ff-rise text-ink" : "text-muted/50",
            )}
          >
            <span
              className={cn(
                "inline-flex size-4 items-center justify-center rounded-full",
                i < step || done ? "bg-accent text-black" : "border border-line",
              )}
            >
              {i < step || done ? <Check size={10} strokeWidth={3} /> : null}
            </span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- Docs

const DOC_ROWS: readonly [string, string, string][] = [
  ["registerToken", "creator", "token → X account"],
  ["collect", "anyone", "escrow → FeeFlow"],
  ["collectMany", "anyone", "many at once"],
  ["claim", "account", "one signed tx"],
  ["releaseExpired", "anyone", "30 days → creator"],
  ["exitByCreator", "creator", "fees leave FeeFlow"],
  ["exitByHandle", "account", "fees leave FeeFlow"],
  ["FEE_BPS", "view", "100 = 1%"],
  ["CLAIM_WINDOW", "view", "30 days"],
];

function DocsMotion() {
  return (
    <div className="flex h-full flex-col px-3.5 pt-3 font-mono text-[11px]">
      <div className="grid grid-cols-[6.9rem_3.4rem_1fr] gap-2 pb-1.5 text-[10px] tracking-[0.08em] text-muted uppercase">
        <span>Function</span>
        <span>Who</span>
        <span>What</span>
      </div>
      <div className="ff-fade-y min-h-0 flex-1 overflow-hidden">
        <Loop seconds={24} className="[&>div]:gap-1.5 [&>div]:pb-1.5">
          {DOC_ROWS.map(([fn, who, what]) => (
            <div key={fn} className="grid grid-cols-[6.9rem_3.4rem_1fr] gap-2">
              <span className="truncate font-medium">{fn}</span>
              <span className="truncate text-muted">{who}</span>
              <span className="truncate text-muted">{what}</span>
            </div>
          ))}
        </Loop>
      </div>
    </div>
  );
}
