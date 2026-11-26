/**
 * Domain types shared by the web app, the mock adapter and the indexer REST API.
 * Amounts are decimal strings of base units (JSON has no bigint); use `toBig` to read them.
 * Every on-chain record carries `txHash` and `blockNumber`.
 */
import type { PairAsset } from "@feeflow/config";

export type { PairAsset };

export type Address = `0x${string}`;
export type Hash = `0x${string}`;

/** Base-unit amount in a pair asset (native ETH, USDG or any other ERC-20 Pons allows). */
export interface Amount {
  asset: PairAsset;
  /** Base units as a decimal string. */
  raw: string;
}

export interface XAccount {
  /** Numeric X user id as a string; the primary key. Handles are display data. */
  userId: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** False if this account has never logged in to FeeFlow (brief correction 4). */
  hasLoggedIn: boolean;
}

export interface ChainRef {
  txHash: Hash;
  blockNumber: number;
  /** Unix seconds. */
  timestamp: number;
}

export interface TokenMeta {
  address: Address;
  name: string;
  symbol: string;
  pairAsset: PairAsset;
  imageUrl: string | null;
  graduated: boolean;
}

export type RoutingStatus = "routed" | "exited";

export interface TokenSummary extends TokenMeta {
  recipient: XAccount;
  status: RoutingStatus;
  sink: Address;
  creator: Address;
  routedAt: number;
  /** Net amount paid out by claims, all time. */
  totalPaid: Amount;
  /** Unswept on Pons plus waiting in the escrow. */
  accrued: Amount;
  /** Credited in FeeFlow, not yet claimed. */
  credited: Amount;
  lastActivityAt: number | null;
}

export interface Batch {
  index: number;
  amount: Amount;
  creditedAt: number;
  /** creditedAt + 30 days. */
  deadline: number;
}

export type TokenEventKind = "routed" | "collect" | "claim" | "expired" | "exit";

export interface TokenEvent extends ChainRef {
  kind: TokenEventKind;
  amount: Amount | null;
  /** Collect only. */
  gross?: string;
  fee?: string;
  /** Claim: destination wallet. Expired: creator. Exit: new recipient. */
  counterparty?: Address;
  exitRole?: "handle" | "creator";
  actor?: XAccount;
}

export interface PendingTakeover {
  proposedRecipient: Address;
  effectiveAt: number;
  expiresAt: number;
  txHash: Hash;
}

export interface FeePolicyView {
  /** Pons creator share and protocol share, in bps, from getLaunchFeePolicy. Null until read. */
  creatorShareBps: number | null;
  protocolShareBps: number | null;
}

export interface TokenDetail extends TokenSummary {
  buckets: {
    unswept: Amount;
    escrow: Amount;
    credited: Amount;
    /** Credited batches already past the 30-day window, still claimable until released. */
    expirable: Amount;
  };
  batches: Batch[];
  history: TokenEvent[];
  pendingTakeover: PendingTakeover | null;
  feePolicy: FeePolicyView;
  /** Brief correction 4: abuse signals. */
  claimsLast30d: number;
  expiredToCreator: Amount;
}

/** Protocol totals for one pair asset. Amounts in different assets are never summed. */
export interface AssetTotals {
  asset: PairAsset;
  collectedGross: string;
  feesTaken: string;
  credited: string;
  claimed: string;
  unclaimed: string;
  expiredToCreators: string;
  accrued: string;
}

export interface Totals {
  /** One entry per pair asset with any activity, ETH and USDG first, then by volume. */
  assets: AssetTotals[];
  tokensRouted: number;
  updatedAt: number;
}

export interface ClaimRecord extends ChainRef {
  account: XAccount;
  to: Address;
  tokens: { address: Address; symbol: string }[];
  amounts: Amount[];
}

export interface AccountToken extends TokenMeta {
  claimable: Amount;
  pending: Amount;
  /** Deadline of the oldest outstanding batch, or null. */
  oldestDeadline: number | null;
  oldestAmount: Amount | null;
  status: RoutingStatus;
}

export interface AccountActivity extends ChainRef {
  kind: "collect" | "claim";
  label: string;
  amounts: Amount[];
}

export interface AccountView {
  account: XAccount;
  tokens: AccountToken[];
  received: { asset: PairAsset; gross: string; fee: string; net: string; claimed: string }[];
  activity: AccountActivity[];
}

export type LeaderboardPeriod = "7d" | "30d" | "all";

export interface LeaderboardEntry {
  rank: number;
  account: XAccount;
  /** Net credited after FeeFlow's 1% fee, in the selected asset. */
  received: Amount;
}

export interface KeeperStatus {
  lastRunAt: number | null;
  /** True if the last run is older than KEEPER_STALE_AFTER. */
  stale: boolean;
}
