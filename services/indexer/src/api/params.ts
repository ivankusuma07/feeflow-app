import type { LeaderboardPeriod } from "@feeflow/sdk";
import { isAddress } from "viem";

export const X_USER_ID = /^[1-9]\d{0,19}$/;
export const MAX_LIMIT = 100;

/** `?limit=` as 1..100, default 10; null if malformed. */
export function parseLimit(raw: string | undefined, fallback = 10): number | null {
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_LIMIT ? n : null;
}

const PERIOD_SECONDS: Record<LeaderboardPeriod, number> = {
  "7d": 7 * 86_400,
  "30d": 30 * 86_400,
  all: Number.POSITIVE_INFINITY,
};

export function parseLeaderboardQuery(
  q: { period?: string | undefined; asset?: string | undefined; limit?: string | undefined },
  now: number,
): { asset: `0x${string}`; since: number; limit: number } | null {
  const period = (q.period ?? "all") as LeaderboardPeriod;
  if (!(period in PERIOD_SECONDS)) return null;
  if (!q.asset || !isAddress(q.asset, { strict: false })) return null;
  const limit = parseLimit(q.limit, 50);
  if (limit === null) return null;
  const span = PERIOD_SECONDS[period];
  return {
    asset: q.asset.toLowerCase() as `0x${string}`,
    since: span === Number.POSITIVE_INFINITY ? 0 : now - span,
    limit,
  };
}

export type TokenSort = "paid" | "recent";
export const PAGE_MAX = 60;

export interface TokenListQuery {
  sort: TokenSort;
  /** Lowercased pair asset, or null for every asset. */
  asset: `0x${string}` | null;
  /** Lowercased search text: a name or symbol fragment, or an address prefix. */
  q: string | null;
  limit: number;
  offset: number;
}

/**
 * `/api/tokens` query. "paid" ranks by the amount claimed, so it needs one asset: amounts in
 * different assets are never compared. Null if malformed.
 */
export function parseTokenListQuery(raw: {
  sort?: string | undefined;
  asset?: string | undefined;
  q?: string | undefined;
  limit?: string | undefined;
  offset?: string | undefined;
}): TokenListQuery | null {
  const sort = (raw.sort ?? "recent") as TokenSort;
  if (sort !== "paid" && sort !== "recent") return null;
  let asset: `0x${string}` | null = null;
  if (raw.asset !== undefined && raw.asset !== "") {
    if (!isAddress(raw.asset, { strict: false })) return null;
    asset = raw.asset.toLowerCase() as `0x${string}`;
  }
  if (sort === "paid" && !asset) return null;
  const limit = parseLimit(raw.limit, 30);
  if (limit === null || limit > PAGE_MAX) return null;
  const offsetRaw = raw.offset ?? "0";
  if (!/^\d{1,6}$/.test(offsetRaw)) return null;
  const q = (raw.q ?? "").trim().toLowerCase().slice(0, 64);
  return { sort, asset, q: q === "" ? null : q, limit, offset: Number(offsetRaw) };
}

/** Escapes LIKE wildcards so user text matches literally. */
export function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}
