import type {
  AccountView,
  ClaimRecord,
  KeeperStatus,
  LeaderboardEntry,
  LeaderboardPeriod,
  TokenDetail,
  TokenSummary,
  Totals,
} from "@feeflow/sdk";
import { DataSourceError, type DataSource } from "./types";

/**
 * REST adapter over the indexer API. Paths follow the brief (§Indexer + API); Stage 4
 * (services/indexer) implements them. Response bodies are the `@feeflow/sdk` types as JSON.
 * The leaderboard adds `asset` and `limit`: each pair asset is ranked on its own.
 *
 *   GET /api/totals                                  Totals
 *   GET /api/claims/recent?limit=                    ClaimRecord[]
 *   GET /api/tokens/top?limit=                       TokenSummary[]
 *   GET /api/leaderboard?period=&asset=&limit=       LeaderboardEntry[]
 *   GET /api/accounts/:xUserId                       AccountView        (404 → null)
 *   GET /api/tokens/:address                         TokenDetail        (404 → null)
 *   GET /api/keeper/status                                  KeeperStatus
 */
export function createIndexerDataSource(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): DataSource {
  const root = baseUrl.replace(/\/$/, "");

  async function get<T>(path: string, opts: { nullOn404?: boolean } = {}): Promise<T | null> {
    let res: Response;
    try {
      // no-store: right after the user's own transaction, a cached reply would show the old state.
      res = await fetchImpl(`${root}${path}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      throw new DataSourceError("The FeeFlow indexer could not be reached.");
    }
    if (res.status === 404 && opts.nullOn404) return null;
    if (!res.ok)
      throw new DataSourceError(`The FeeFlow indexer returned ${res.status}.`, res.status);
    return (await res.json()) as T;
  }
  const must = async <T>(path: string) => (await get<T>(path)) as T;
  const q = (params: Record<string, string | number>) =>
    new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

  return {
    kind: "indexer",
    getTotals: () => must<Totals>("/api/totals"),
    getRecentClaims: (limit) => must<ClaimRecord[]>(`/api/claims/recent?${q({ limit })}`),
    getTopTokens: (limit) => must<TokenSummary[]>(`/api/tokens/top?${q({ limit })}`),
    getLeaderboard: (period: LeaderboardPeriod, asset, limit) =>
      must<LeaderboardEntry[]>(`/api/leaderboard?${q({ period, asset, limit })}`),
    getAccount: (xUserId) =>
      get<AccountView>(`/api/accounts/${encodeURIComponent(xUserId)}`, { nullOn404: true }),
    getToken: (address) =>
      get<TokenDetail>(`/api/tokens/${encodeURIComponent(address.toLowerCase())}`, {
        nullOn404: true,
      }),
    getKeeperStatus: () => must<KeeperStatus>("/api/keeper/status"),
  };
}
