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

/**
 * Everything the app reads (brief Stage 2). Two adapters implement it: `indexer` (REST over the
 * Ponder indexer, production) and `mock` (synthetic data, development only).
 * `null` means "not found"; failures throw and surface as `ErrorState`.
 */
export interface DataSource {
  readonly kind: "indexer" | "mock";
  getTotals(): Promise<Totals>;
  getRecentClaims(limit: number): Promise<ClaimRecord[]>;
  getTopTokens(limit: number): Promise<TokenSummary[]>;
  /** Ranked by net received in one pair asset (amounts in different assets are never summed). */
  getLeaderboard(
    period: LeaderboardPeriod,
    assetAddress: string,
    limit: number,
  ): Promise<LeaderboardEntry[]>;
  /** By X user id. Null when the account has never been a recipient. */
  getAccount(xUserId: string): Promise<AccountView | null>;
  /** Null when the token was never routed through FeeFlow. */
  getToken(address: string): Promise<TokenDetail | null>;
  getKeeperStatus(): Promise<KeeperStatus>;
}

export class DataSourceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DataSourceError";
  }
}
