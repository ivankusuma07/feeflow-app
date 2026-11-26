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
