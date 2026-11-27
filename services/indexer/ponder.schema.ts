import { index, onchainTable, primaryKey } from "ponder";

/**
 * Indexed FeeFlow state. Every row that comes from a log carries `txHash` and `blockNumber`
 * (brief §Indexer + API). Amounts are base units of the token's pair asset; amounts in different
 * assets are never summed. X user ids are decimal strings (uint64 does not fit a JS number).
 */

/** Pair assets seen in `TokenRegistered`. Symbol and decimals are untrusted display data. */
export const asset = onchainTable("asset", (t) => ({
  address: t.hex().primaryKey(),
  symbol: t.text().notNull(),
  decimals: t.integer().notNull(),
}));

/** Running protocol totals per asset, mirroring `FeeFlow.totals(asset)`. */
export const assetTotals = onchainTable("asset_totals", (t) => ({
  asset: t.hex().primaryKey(),
  collectedGross: t.bigint().notNull(),
  feesTaken: t.bigint().notNull(),
  credited: t.bigint().notNull(),
  claimed: t.bigint().notNull(),
  expiredToCreators: t.bigint().notNull(),
  feesWithdrawn: t.bigint().notNull(),
}));

export const token = onchainTable(
  "token",
  (t) => ({
    address: t.hex().primaryKey(),
    sink: t.hex().notNull(),
    xUserId: t.text().notNull(),
    creator: t.hex().notNull(),
    asset: t.hex().notNull(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    /** Pons `logo()` (an `ipfs://` reference), or null if absent or not a clean IPFS link. */
    logo: t.text(),
    /** Pons bonding curve; null if the factory read failed. */
    curve: t.hex(),
    routedAt: t.integer().notNull(),
    routedTx: t.hex().notNull(),
    routedBlock: t.integer().notNull(),
    exited: t.boolean().notNull(),
    /** Pending Pons owner override of the creator fee recipient (IPonsOverride.sol). */
    overrideTo: t.hex(),
    overrideEffectiveAt: t.integer(),
    overrideExpiresAt: t.integer(),
    overrideTx: t.hex(),
    /** Set when Pons moved the recipient off the sink without a FeeFlow exit. */
    redirectedTo: t.hex(),
    redirectedAt: t.integer(),
    /** Currently credited in FeeFlow (claimable or expirable). */
    credited: t.bigint().notNull(),
    collectedGross: t.bigint().notNull(),
    feesTaken: t.bigint().notNull(),
    claimed: t.bigint().notNull(),
    expiredToCreator: t.bigint().notNull(),
    lastActivityAt: t.integer(),
    /** From `getLaunchFeePolicy` at registration. */
    protocolShareBps: t.integer(),
    buybackBurnBps: t.integer(),
  }),
  (t) => ({ byUser: index().on(t.xUserId) }),
);

/** Credited batches. Claims close every open batch; `Expired` closes the oldest ones. */
export const batch = onchainTable(
  "batch",
  (t) => ({
    token: t.hex().notNull(),
    index: t.integer().notNull(),
    amount: t.bigint().notNull(),
    creditedAt: t.integer().notNull(),
    open: t.boolean().notNull(),
  }),
  (t) => ({ pk: primaryKey({ columns: [t.token, t.index] }), byToken: index().on(t.token) }),
);

/** One row per FeeFlow token log: the token page history and every activity feed. */
export const tokenEvent = onchainTable(
  "token_event",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    xUserId: t.text().notNull(),
    kind: t.text().$type<"routed" | "collect" | "claim" | "expired" | "exit">().notNull(),
    asset: t.hex().notNull(),
    amount: t.bigint(),
    gross: t.bigint(),
    fee: t.bigint(),
    counterparty: t.hex(),
    exitRole: t.text().$type<"handle" | "creator">(),
    txHash: t.hex().notNull(),
    blockNumber: t.integer().notNull(),
    logIndex: t.integer().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (t) => ({
    byToken: index().on(t.token),
    byUser: index().on(t.xUserId),
    byKindTime: index().on(t.kind, t.timestamp),
  }),
);

/**
 * X accounts that have ever been a recipient. `hasLoggedIn` is set once the account proves
 * control on chain (a claim or an exit by handle), since FeeFlow has no other record of logins.
 */
export const account = onchainTable("account", (t) => ({
  xUserId: t.text().primaryKey(),
  firstRoutedAt: t.integer().notNull(),
  hasLoggedIn: t.boolean().notNull(),
}));

/** Latest escrow balance per routed token (block-interval snapshot): "accrued, not yet sent". */
export const escrowSnapshot = onchainTable("escrow_snapshot", (t) => ({
  token: t.hex().primaryKey(),
  escrow: t.bigint().notNull(),
  graduated: t.boolean(),
  blockNumber: t.integer().notNull(),
  timestamp: t.integer().notNull(),
}));
