import { CLAIM_WINDOW_SECONDS, sameAsset, type PairAsset } from "@feeflow/config";
import {
  amount,
  ipfsImageUrl,
  sumByAsset,
  type AccountActivity,
  type AccountToken,
  type AccountView,
  type AssetTotals,
  type Batch,
  type ClaimRecord,
  type LeaderboardEntry,
  type TokenDetail,
  type TokenEvent,
  type TokenSummary,
  type Totals,
  type XAccount,
} from "@feeflow/sdk";
import type {
  account,
  asset,
  assetTotals,
  batch,
  escrowSnapshot,
  token,
  tokenEvent,
} from "../ponder.schema";

/**
 * Pure mapping from indexed rows to the `@feeflow/sdk` response types the web app reads.
 * No database or network access here, so every rule is unit-tested in views.test.ts.
 */

export type AssetRow = typeof asset.$inferSelect;
export type TotalsRow = typeof assetTotals.$inferSelect;
export type TokenRow = typeof token.$inferSelect;
export type BatchRow = typeof batch.$inferSelect;
export type EventRow = typeof tokenEvent.$inferSelect;
export type AccountRow = typeof account.$inferSelect;
export type SnapshotRow = typeof escrowSnapshot.$inferSelect;

/** X display data, keyed by numeric id. Missing entries render as "X user <id>". */
export interface XProfile {
  username: string;
  name: string;
  avatarUrl: string | null;
}

export interface Lookups {
  assets: Map<string, AssetRow>;
  accounts: Map<string, AccountRow>;
  profiles: Map<string, XProfile>;
}

const WINDOW = Number(CLAIM_WINDOW_SECONDS);

export function pairAsset(l: Lookups, address: string): PairAsset {
  const a = l.assets.get(address.toLowerCase());
  return a
    ? { address: a.address, symbol: a.symbol, decimals: a.decimals }
    : { address: address as `0x${string}`, symbol: "?", decimals: 18 };
}

export function xAccount(l: Lookups, xUserId: string): XAccount {
  const p = l.profiles.get(xUserId);
  return {
    userId: xUserId,
    username: p?.username ?? null,
    name: p?.name ?? null,
    avatarUrl: p?.avatarUrl ?? null,
    hasLoggedIn: l.accounts.get(xUserId)?.hasLoggedIn ?? false,
  };
}

export function tokenSummary(
  l: Lookups,
  t: TokenRow,
  snapshot: SnapshotRow | undefined,
): TokenSummary {
  const a = pairAsset(l, t.asset);
  return {
    address: t.address,
    name: t.name,
    symbol: t.symbol,
    pairAsset: a,
    // Brief: token images only from Pons metadata — the token's `logo()`, via an IPFS gateway.
    imageUrl: ipfsImageUrl(t.logo),
    graduated: snapshot?.graduated ?? false,
    recipient: xAccount(l, t.xUserId),
    status: t.exited ? "exited" : "routed",
    sink: t.sink,
    creator: t.creator,
    routedAt: t.routedAt,
    totalPaid: amount(a, t.claimed),
    // Waiting in the Pons escrow (last snapshot). Unswept curve fees have no verified getter.
    accrued: amount(a, t.exited ? 0n : (snapshot?.escrow ?? 0n)),
    credited: amount(a, t.credited),
    lastActivityAt: t.lastActivityAt,
  };
}

export function batches(a: PairAsset, rows: BatchRow[]): Batch[] {
  return rows
    .filter((b) => b.open)
    .sort((x, y) => x.index - y.index)
    .map((b) => ({
      index: b.index,
      amount: amount(a, b.amount),
      creditedAt: b.creditedAt,
      deadline: b.creditedAt + WINDOW,
    }));
}

export function tokenEventView(l: Lookups, a: PairAsset, e: EventRow): TokenEvent {
  const out: TokenEvent = {
    kind: e.kind,
    amount: e.amount === null ? null : amount(a, e.amount),
    txHash: e.txHash,
    blockNumber: e.blockNumber,
    timestamp: e.timestamp,
  };
  if (e.kind === "collect") {
    out.gross = (e.gross ?? 0n).toString();
    out.fee = (e.fee ?? 0n).toString();
  }
  if (e.counterparty && e.kind !== "routed" && e.kind !== "collect") {
    out.counterparty = e.counterparty;
  }
  if (e.exitRole) out.exitRole = e.exitRole;
  if (e.kind === "claim" || e.exitRole === "handle") out.actor = xAccount(l, e.xUserId);
  return out;
}

const byNewest = (x: EventRow, y: EventRow) =>
  y.blockNumber - x.blockNumber || y.logIndex - x.logIndex;

export function tokenDetail(
  l: Lookups,
  t: TokenRow,
  snapshot: SnapshotRow | undefined,
  batchRows: BatchRow[],
  events: EventRow[],
  now: number,
): TokenDetail {
  const s = tokenSummary(l, t, snapshot);
  const a = s.pairAsset;
  const open = batches(a, batchRows);
  const expirable = open
    .filter((b) => b.deadline <= now)
    .reduce((sum, b) => sum + BigInt(b.amount.raw), 0n);
  const policy =
    t.protocolShareBps === null
      ? { creatorShareBps: null, protocolShareBps: null }
      : {
          // Pons splits each fee into protocol, buyback/burn and creator shares.
          creatorShareBps:
            t.buybackBurnBps === null ? null : 10_000 - t.protocolShareBps - t.buybackBurnBps,
          protocolShareBps: t.protocolShareBps,
        };
  return {
    ...s,
    buckets: {
      unswept: null,
      escrow: s.accrued,
      credited: s.credited,
      expirable: amount(a, expirable),
    },
    batches: open,
    history: [...events].sort(byNewest).map((e) => tokenEventView(l, a, e)),
    pendingTakeover: null,
    feePolicy: policy,
    claimsLast30d: events.filter((e) => e.kind === "claim" && e.timestamp > now - WINDOW).length,
    expiredToCreator: amount(a, t.expiredToCreator),
  };
}

/** ETH and USDG first (the known pairs), then other assets by gross collected. */
export function totals(
  l: Lookups,
  rows: TotalsRow[],
  accruedByAsset: Map<string, bigint>,
  tokensRouted: number,
  knownFirst: string[],
  now: number,
): Totals {
  const rank = (a: string) => {
    const i = knownFirst.findIndex((k) => k.toLowerCase() === a.toLowerCase());
    return i === -1 ? knownFirst.length : i;
  };
  const assets: AssetTotals[] = [...rows]
    .sort(
      (x, y) =>
        rank(x.asset) - rank(y.asset) ||
        (y.collectedGross > x.collectedGross ? 1 : y.collectedGross < x.collectedGross ? -1 : 0),
    )
    .map((r) => ({
      asset: pairAsset(l, r.asset),
      collectedGross: r.collectedGross.toString(),
      feesTaken: r.feesTaken.toString(),
      credited: r.credited.toString(),
      claimed: r.claimed.toString(),
      unclaimed: (r.credited - r.claimed - r.expiredToCreators).toString(),
      expiredToCreators: r.expiredToCreators.toString(),
      accrued: (accruedByAsset.get(r.asset) ?? 0n).toString(),
    }));
  return { assets, tokensRouted, updatedAt: now };
}

/** One claim tx pays several tokens; the feed shows one row per (tx, X account). */
export function claimRecords(
  l: Lookups,
  events: EventRow[],
  tokens: Map<string, TokenRow>,
): ClaimRecord[] {
  const groups = new Map<string, EventRow[]>();
  for (const e of [...events].sort(byNewest)) {
    if (e.kind !== "claim") continue;
    const key = `${e.txHash}:${e.xUserId}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.values()].map((g) => {
    const first = g[0]!;
    return {
      account: xAccount(l, first.xUserId),
      to: first.counterparty!,
      tokens: g.map((e) => ({ address: e.token, symbol: tokens.get(e.token)?.symbol ?? "?" })),
      amounts: sumByAsset(g.map((e) => amount(pairAsset(l, e.asset), e.amount ?? 0n))),
      txHash: first.txHash,
      blockNumber: first.blockNumber,
      timestamp: first.timestamp,
    };
  });
}

export function accountView(
  l: Lookups,
  xUserId: string,
  tokens: TokenRow[],
  snapshots: Map<string, SnapshotRow>,
  batchRows: BatchRow[],
  events: EventRow[],
): AccountView {
  const accountTokens: AccountToken[] = tokens.map((t) => {
    const s = tokenSummary(l, t, snapshots.get(t.address));
    const oldest = batches(
      s.pairAsset,
      batchRows.filter((b) => b.token === t.address),
    )[0];
    return {
      address: s.address,
      name: s.name,
      symbol: s.symbol,
      pairAsset: s.pairAsset,
      imageUrl: s.imageUrl,
      graduated: s.graduated,
      claimable: s.credited,
      pending: s.accrued,
      oldestDeadline: oldest?.deadline ?? null,
      oldestAmount: oldest?.amount ?? null,
      status: s.status,
    };
  });

  const received: AccountView["received"] = [];
  for (const t of tokens) {
    const a = pairAsset(l, t.asset);
    let r = received.find((x) => sameAsset(x.asset, a));
    if (!r) {
      r = { asset: a, gross: "0", fee: "0", net: "0", claimed: "0" };
      received.push(r);
    }
    const add = (k: "gross" | "fee" | "net" | "claimed", v: bigint) => {
      r[k] = (BigInt(r[k]) + v).toString();
    };
    add("gross", t.collectedGross);
    add("fee", t.feesTaken);
    add("net", t.collectedGross - t.feesTaken);
    add("claimed", t.claimed);
  }

  const symbols = new Map(tokens.map((t) => [t.address, t.symbol]));
  const activity: AccountActivity[] = [];
  const claims = new Map<string, { row: AccountActivity; symbols: string[] }>();
  for (const e of [...events].sort(byNewest)) {
    const amt = amount(pairAsset(l, e.asset), e.amount ?? 0n);
    const symbol = symbols.get(e.token) ?? "?";
    const ref = { txHash: e.txHash, blockNumber: e.blockNumber, timestamp: e.timestamp };
    if (e.kind === "collect") {
      activity.push({ kind: "collect", label: `Collected · $${symbol}`, amounts: [amt], ...ref });
    } else if (e.kind === "claim") {
      let g = claims.get(e.txHash);
      if (!g) {
        g = { row: { kind: "claim", label: "", amounts: [], ...ref }, symbols: [] };
        claims.set(e.txHash, g);
        activity.push(g.row);
      }
      g.symbols.push(symbol);
      g.row.amounts = sumByAsset([...g.row.amounts, amt]);
    }
  }
  for (const { row, symbols: s } of claims.values()) {
    row.label = s.length === 1 ? `Claimed · $${s[0]}` : `Claimed · ${s.length} tokens`;
  }

  return { account: xAccount(l, xUserId), tokens: accountTokens, received, activity };
}

export function leaderboard(
  l: Lookups,
  a: PairAsset,
  rows: { xUserId: string; received: bigint }[],
  limit: number,
): LeaderboardEntry[] {
  return [...rows]
    .filter((r) => r.received > 0n)
    .sort((x, y) => (y.received > x.received ? 1 : y.received < x.received ? -1 : 0))
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      account: xAccount(l, r.xUserId),
      received: amount(a, r.received),
    }));
}
