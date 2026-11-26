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
 * REST adapter over the indexer API. These paths are the contract Stage 4 (services/indexer)
 * implements; response bodies are the `@feeflow/sdk` types as JSON.
 *
 *   GET /v1/totals                                  Totals
 *   GET /v1/claims/recent?limit=                    ClaimRecord[]
 *   GET /v1/tokens/top?limit=                       TokenSummary[]
 *   GET /v1/leaderboard?period=&asset=&limit=       LeaderboardEntry[]
 *   GET /v1/accounts/:xUserId                       AccountView        (404 → null)
 *   GET /v1/tokens/:address                         TokenDetail        (404 → null)
 *   GET /v1/keeper                                  KeeperStatus
 */
export function createIndexerDataSource(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): DataSource {
  const root = baseUrl.replace(/\/$/, "");

  async function get<T>(path: string, opts: { nullOn404?: boolean } = {}): Promise<T | null> {
    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}`, { headers: { accept: "application/json" } });
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
    getTotals: () => must<Totals>("/v1/totals"),
    getRecentClaims: (limit) => must<ClaimRecord[]>(`/v1/claims/recent?${q({ limit })}`),
    getTopTokens: (limit) => must<TokenSummary[]>(`/v1/tokens/top?${q({ limit })}`),
    getLeaderboard: (period: LeaderboardPeriod, asset, limit) =>
      must<LeaderboardEntry[]>(`/v1/leaderboard?${q({ period, asset, limit })}`),
    getAccount: (xUserId) =>
      get<AccountView>(`/v1/accounts/${encodeURIComponent(xUserId)}`, { nullOn404: true }),
    getToken: (address) =>
      get<TokenDetail>(`/v1/tokens/${encodeURIComponent(address.toLowerCase())}`, {
        nullOn404: true,
      }),
    getKeeperStatus: () => must<KeeperStatus>("/v1/keeper"),
  };
}
