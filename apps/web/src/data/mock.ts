/**
 * DEVELOPMENT-ONLY synthetic data. Never reachable in production: `parsePublicEnv` throws for
 * `NEXT_PUBLIC_DATA_SOURCE=mock` with `NODE_ENV=production`, and this module is only loaded via
 * dynamic import from `createDataSource`. Every page shows the "MOCK DATA — DEV ONLY" banner.
 *
 * Names, handles and amounts follow the designs' sample data ("Example Token A", "@example_one").
 */
import { NATIVE_ETH, knownPairAssets, splitGross, type PairAsset } from "@feeflow/config";
import {
  amount,
  zero,
  type AccountToken,
  type AccountView,
  type AssetTotals,
  type Batch,
  type ClaimRecord,
  type Hash,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type TokenDetail,
  type TokenEvent,
  type TokenSummary,
  type XAccount,
} from "@feeflow/sdk";
import { keccak256, toHex, type Address } from "viem";
import type { DataSource } from "./types";

const DAY = 86_400;
const CLAIM_WINDOW = 30 * DAY;

const addr = (label: string): Address => `0x${keccak256(toHex(`feeflow.mock.${label}`)).slice(26)}`;
const hash = (label: string): Hash => keccak256(toHex(`feeflow.mock.tx.${label}`));

const USDG: PairAsset = knownPairAssets(4663)[1]!;
const GME: PairAsset = {
  address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e",
  symbol: "GME",
  decimals: 18,
};

const HANDLES = [
  "example_one",
  "example_two",
  "example_three",
  "example_four",
  "example_five",
  "example_six",
  "example_seven",
  "example_eight",
  "example_nine",
  "example_ten",
  "example_eleven",
  "example_twelve",
];

function account(i: number, hasLoggedIn = true): XAccount {
  const username = HANDLES[i % HANDLES.length]!;
  return {
    userId: String(1_000_000_000 + i),
    username,
    name: username.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    avatarUrl: null,
    hasLoggedIn,
  };
}

interface MockToken {
  key: string;
  name: string;
  symbol: string;
  asset: PairAsset;
  owner: number;
  /** Credited, claimable now (base units). */
  claimable: bigint;
  /** Unswept + in escrow, not yet collected. */
  pending: bigint;
  /** Days since the oldest outstanding batch was credited. */
  oldestAgeDays: number;
  paid: bigint;
  graduated: boolean;
}

const TOKENS: MockToken[] = [
  {
    key: "exa",
    name: "Example Token A",
    symbol: "EXA",
    asset: USDG,
    owner: 0,
    claimable: 212_400_000n,
    pending: 18_200_000n,
    oldestAgeDays: 7,
    paid: 83_600_000n,
    graduated: true,
  },
  {
    key: "exb",
    name: "Example Token B",
    symbol: "EXB",
    asset: USDG,
    owner: 0,
    claimable: 100_000_000n,
    pending: 0n,
    oldestAgeDays: 4,
    paid: 0n,
    graduated: false,
  },
  {
    key: "exc",
    name: "Example Token C",
    symbol: "EXC",
    asset: NATIVE_ETH,
    owner: 0,
    claimable: 84_200_000_000_000_000n,
    pending: 3_100_000_000_000_000n,
    oldestAgeDays: 3,
    paid: 12_000_000_000_000_000n,
    graduated: false,
  },
  {
    key: "exd",
    name: "Example Token D",
    symbol: "EXD",
    asset: GME,
    owner: 1,
    claimable: 1_250_000_000_000_000_000n,
    pending: 0n,
    oldestAgeDays: 12,
    paid: 400_000_000_000_000_000n,
    graduated: false,
  },
  {
    key: "exe",
    name: "Example Token E",
    symbol: "EXE",
    asset: USDG,
    owner: 2,
    claimable: 2_480_000_000n,
    pending: 140_000_000n,
    oldestAgeDays: 26,
    paid: 9_600_000_000n,
    graduated: true,
  },
  {
    key: "exf",
    name: "Example Token F",
    symbol: "EXF",
    asset: NATIVE_ETH,
    owner: 3,
    claimable: 410_000_000_000_000_000n,
    pending: 0n,
    oldestAgeDays: 31,
    paid: 1_900_000_000_000_000_000n,
    graduated: true,
  },
];

const now = () => Math.floor(Date.now() / 1000);

function summary(t: MockToken): TokenSummary {
  const n = now();
  const accrued = t.pending;
  return {
    address: addr(t.key),
    name: t.name,
    symbol: t.symbol,
    pairAsset: t.asset,
    imageUrl: null,
    graduated: t.graduated,
    recipient: account(t.owner),
    status: "routed",
    ponsOverride: null,
    redirectedTo: null,
    sink: addr(`${t.key}.sink`),
    creator: addr(`${t.key}.creator`),
    routedAt: n - 60 * DAY,
    totalPaid: amount(t.asset, t.paid),
    accrued: amount(t.asset, accrued),
    credited: amount(t.asset, t.claimable),
    lastActivityAt: n - 2 * 3600,
  };
}

function batchesOf(t: MockToken): Batch[] {
  const n = now();
  // Oldest batch holds ~20% of the balance, the rest split over two newer batches.
  const parts = [
    t.claimable / 5n,
    t.claimable / 2n,
    t.claimable - t.claimable / 5n - t.claimable / 2n,
  ];
  const ages = [t.oldestAgeDays, Math.max(1, t.oldestAgeDays - 3), 1];
  return parts
    .map((raw, index) => {
      const creditedAt = n - ages[index]! * DAY;
      return {
        index,
        amount: amount(t.asset, raw),
        creditedAt,
        deadline: creditedAt + CLAIM_WINDOW,
      };
    })
    .filter((b) => b.amount.raw !== "0");
}

function history(t: MockToken): TokenEvent[] {
  const n = now();
  const gross = (t.claimable * 100n) / 99n;
  const { fee } = splitGross(gross);
  const ev = (
    kind: TokenEvent["kind"],
    ago: number,
    extra: Partial<TokenEvent> = {},
  ): TokenEvent => ({
    kind,
    amount: null,
    txHash: hash(`${t.key}.${kind}.${ago}`),
    blockNumber: 123_000_000 - ago,
    timestamp: n - ago,
    ...extra,
  });
  return [
    ev("collect", 2 * 3600, {
      amount: amount(t.asset, t.claimable / 4n),
      gross: (gross / 4n).toString(),
      fee: (fee / 4n).toString(),
    }),
    ev("claim", 3 * DAY, {
      amount: amount(t.asset, t.paid),
      counterparty: addr("wallet.0"),
      actor: account(t.owner),
    }),
    ev("collect", 9 * DAY, {
      amount: amount(t.asset, t.claimable / 2n),
      gross: (gross / 2n).toString(),
      fee: (fee / 2n).toString(),
    }),
    ev("routed", 60 * DAY, { counterparty: addr(`${t.key}.sink`) }),
  ];
}

function detail(t: MockToken): TokenDetail {
  const n = now();
  const batches = batchesOf(t);
  const expirable = batches
    .filter((b) => b.deadline <= n)
    .reduce((s, b) => s + BigInt(b.amount.raw), 0n);
  return {
    ...summary(t),
    buckets: {
      unswept: amount(t.asset, (t.pending * 2n) / 3n),
      escrow: amount(t.asset, t.pending - (t.pending * 2n) / 3n),
      credited: amount(t.asset, t.claimable),
      expirable: amount(t.asset, expirable),
    },
    batches,
    history: history(t),
    feePolicy: { creatorShareBps: 2000, protocolShareBps: 3000 },
    claimsLast30d: t.paid > 0n ? 1 : 0,
    expiredToCreator: zero(t.asset),
  };
}

function accountToken(t: MockToken): AccountToken {
  const batches = batchesOf(t);
  const oldest = batches[0] ?? null;
  return {
    address: addr(t.key),
    name: t.name,
    symbol: t.symbol,
    pairAsset: t.asset,
    imageUrl: null,
    graduated: t.graduated,
    claimable: amount(t.asset, t.claimable),
    pending: amount(t.asset, t.pending),
    oldestDeadline: oldest?.deadline ?? null,
    oldestAmount: oldest?.amount ?? null,
    status: "routed",
  };
}

function assetTotals(asset: PairAsset): AssetTotals {
  const ts = TOKENS.filter((t) => t.asset.address === asset.address);
  const credited = ts.reduce((s, t) => s + t.claimable + t.paid, 0n);
  const claimed = ts.reduce((s, t) => s + t.paid, 0n);
  const gross = (credited * 100n) / 99n;
  const accrued = ts.reduce((s, t) => s + t.pending, 0n);
  return {
    asset,
    collectedGross: gross.toString(),
    feesTaken: splitGross(gross).fee.toString(),
    credited: credited.toString(),
    claimed: claimed.toString(),
    unclaimed: (credited - claimed).toString(),
    expiredToCreators: "0",
    accrued: accrued.toString(),
  };
}

const PERIOD_SCALE: Record<LeaderboardPeriod, bigint> = { "7d": 15n, "30d": 45n, all: 100n };

export function createMockDataSource(): DataSource {
  return {
    kind: "mock",
    async getTotals() {
      return {
        assets: [NATIVE_ETH, USDG, GME].map(assetTotals),
        tokensRouted: TOKENS.length,
        updatedAt: now(),
      };
    },
    async getRecentClaims(limit) {
      const n = now();
      const claims: ClaimRecord[] = TOKENS.filter((t) => t.paid > 0n).map((t, i) => ({
        account: account(t.owner),
        to: addr(`wallet.${t.owner}`),
        tokens: [{ address: addr(t.key), symbol: t.symbol }],
        amounts: [amount(t.asset, t.paid)],
        txHash: hash(`claim.${t.key}`),
        blockNumber: 123_000_000 - i * 1000,
        timestamp: n - (i + 1) * 5 * 3600,
      }));
      return claims.slice(0, limit);
    },
    async getTopTokens(limit) {
      return TOKENS.map(summary)
        .sort((a, b) => Number(BigInt(b.totalPaid.raw) - BigInt(a.totalPaid.raw)))
        .slice(0, limit);
    },
    async getTokens({ sort, asset, q, limit, offset }) {
      const text = q?.trim().toLowerCase();
      // Mock tokens share one routedAt; list order stands in for "newest first".
      let list = [...TOKENS].reverse().map(summary);
      if (asset)
        list = list.filter((t) => t.pairAsset.address.toLowerCase() === asset.toLowerCase());
      if (text) {
        list = list.filter(
          (t) =>
            t.name.toLowerCase().includes(text) ||
            t.symbol.toLowerCase().includes(text) ||
            t.address.toLowerCase().startsWith(text),
        );
      }
      if (sort === "paid") {
        list.sort((a, b) => Number(BigInt(b.totalPaid.raw) - BigInt(a.totalPaid.raw)));
      }
      return { tokens: list.slice(offset, offset + limit), hasMore: list.length > offset + limit };
    },
    async getLeaderboard(period, assetAddress, limit) {
      const asset = [NATIVE_ETH, USDG, GME].find(
        (a) => a.address.toLowerCase() === assetAddress.toLowerCase(),
      );
      if (!asset) return [];
      const base = 10n ** BigInt(asset.decimals);
      const entries: LeaderboardEntry[] = HANDLES.map((_, i) => ({
        rank: i + 1,
        account: account(i, i % 4 !== 3),
        received: amount(asset, (base * PERIOD_SCALE[period] * BigInt(HANDLES.length - i)) / 10n),
      }));
      return entries.slice(0, limit);
    },
    async getAccount(xUserId) {
      const owner = HANDLES.findIndex((_, i) => account(i).userId === xUserId);
      // Any logged-in X account sees the first sample account's data in mock mode.
      const idx = owner === -1 ? 0 : owner;
      const mine = TOKENS.filter((t) => t.owner === idx);
      const assets = [...new Map(mine.map((t) => [t.asset.address, t.asset])).values()];
      const n = now();
      const view: AccountView = {
        account: { ...account(idx), userId: xUserId },
        tokens: mine.map(accountToken),
        received: assets.map((asset) => {
          const ts = mine.filter((t) => t.asset.address === asset.address);
          const net = ts.reduce((s, t) => s + t.claimable + t.paid, 0n);
          const gross = (net * 100n) / 99n;
          return {
            asset,
            gross: gross.toString(),
            fee: (gross - net).toString(),
            net: net.toString(),
            claimed: ts.reduce((s, t) => s + t.paid, 0n).toString(),
          };
        }),
        activity: mine.slice(0, 3).map((t, i) => ({
          kind: i === 2 ? "claim" : "collect",
          label: i === 2 ? "Claimed · 2 tokens" : `Collected · $${t.symbol}`,
          amounts: [amount(t.asset, i === 2 ? t.paid : t.claimable / 4n)],
          txHash: hash(`activity.${t.key}`),
          blockNumber: 123_000_000 - i,
          timestamp: n - [2 * 3600, 9 * 3600, 3 * DAY][i]!,
        })),
      };
      return view;
    },
    async getToken(address) {
      const t = TOKENS.find((x) => addr(x.key).toLowerCase() === address.toLowerCase());
      return t ? detail(t) : null;
    },
    async getKeeperStatus() {
      return { lastRunAt: now() - 14 * 60, stale: false };
    },
  };
}

/** Addresses of the mock tokens, for tests and dev links. */
export const MOCK_TOKEN_ADDRESSES = TOKENS.map((t) => addr(t.key));
