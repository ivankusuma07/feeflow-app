import { NATIVE_ASSET_ADDRESS } from "@feeflow/config";
import { describe, expect, it } from "vitest";
import {
  accountView,
  claimRecords,
  leaderboard,
  tokenDetail,
  tokenSummary,
  totals,
  type BatchRow,
  type EventRow,
  type Lookups,
  type TokenRow,
} from "./views";

const USDG = "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0" as const;
const TOKEN_A = "0x00000000000000000000000000000000000000aa" as const;
const TOKEN_B = "0x00000000000000000000000000000000000000bb" as const;
const WALLET = "0x00000000000000000000000000000000000000cc" as const;
const DAY = 86_400;
const NOW = 1_800_000_000;

const l: Lookups = {
  assets: new Map([
    [USDG, { address: USDG, symbol: "USDG", decimals: 6 }],
    [NATIVE_ASSET_ADDRESS, { address: NATIVE_ASSET_ADDRESS, symbol: "ETH", decimals: 18 }],
  ]),
  accounts: new Map([["42", { xUserId: "42", firstRoutedAt: 1, hasLoggedIn: true }]]),
  profiles: new Map([["42", { username: "example", name: "Example", avatarUrl: null }]]),
};

const tokenRow = (over: Partial<TokenRow> = {}): TokenRow => ({
  address: TOKEN_A,
  sink: "0x00000000000000000000000000000000000000d1",
  xUserId: "42",
  creator: "0x00000000000000000000000000000000000000d2",
  asset: USDG,
  name: "Alpha",
  symbol: "ALP",
  logo: null,
  curve: null,
  routedAt: NOW - 40 * DAY,
  routedTx: "0x01",
  routedBlock: 10,
  exited: false,
  credited: 300n,
  collectedGross: 1000n,
  feesTaken: 10n,
  claimed: 690n,
  expiredToCreator: 0n,
  lastActivityAt: NOW - DAY,
  protocolShareBps: 3000,
  buybackBurnBps: 5000,
  ...over,
});

let seq = 0;
const ev = (over: Partial<EventRow>): EventRow => {
  seq += 1;
  return {
    id: `e${seq}`,
    token: TOKEN_A,
    xUserId: "42",
    kind: "collect",
    asset: USDG,
    amount: 100n,
    gross: null,
    fee: null,
    counterparty: null,
    exitRole: null,
    txHash: `0x${seq.toString(16).padStart(2, "0")}`,
    blockNumber: 100 + seq,
    logIndex: 0,
    timestamp: NOW - seq,
    ...over,
  };
};

describe("tokenSummary", () => {
  it("serves the Pons logo through the IPFS gateway, and nothing else", () => {
    const cid = "bafkreifqy3iesc5utguhgfj6cvblu5azogmf56ogbm5d7zazae732w2lwi";
    expect(tokenSummary(l, tokenRow({ logo: `ipfs://${cid}` }), undefined).imageUrl).toBe(
      `https://gateway.pinata.cloud/ipfs/${cid}`,
    );
    expect(
      tokenSummary(l, tokenRow({ logo: "https://x.example/a.png" }), undefined).imageUrl,
    ).toBeNull();
    expect(tokenSummary(l, tokenRow(), undefined).imageUrl).toBeNull();
  });

  it("maps a routed token with its snapshot and recipient", () => {
    const s = tokenSummary(l, tokenRow(), {
      token: TOKEN_A,
      escrow: 55n,
      graduated: true,
      blockNumber: 1,
      timestamp: 1,
    });
    expect(s.status).toBe("routed");
    expect(s.graduated).toBe(true);
    expect(s.accrued).toEqual({ asset: { address: USDG, symbol: "USDG", decimals: 6 }, raw: "55" });
    expect(s.totalPaid.raw).toBe("690");
    expect(s.recipient).toEqual({
      userId: "42",
      username: "example",
      name: "Example",
      avatarUrl: null,
      hasLoggedIn: true,
    });
  });

  it("shows no accrued amount once exited, and an unknown X account by id only", () => {
    const s = tokenSummary(l, tokenRow({ exited: true, xUserId: "7" }), {
      token: TOKEN_A,
      escrow: 55n,
      graduated: null,
      blockNumber: 1,
      timestamp: 1,
    });
    expect(s.status).toBe("exited");
    expect(s.accrued.raw).toBe("0");
    expect(s.graduated).toBe(false);
    expect(s.recipient).toMatchObject({ userId: "7", username: null, hasLoggedIn: false });
  });
});

describe("tokenDetail", () => {
  const batches: BatchRow[] = [
    { token: TOKEN_A, index: 2, amount: 200n, creditedAt: NOW - 5 * DAY, open: true },
    { token: TOKEN_A, index: 1, amount: 100n, creditedAt: NOW - 31 * DAY, open: true },
    { token: TOKEN_A, index: 0, amount: 690n, creditedAt: NOW - 39 * DAY, open: false },
  ];

  it("lists open batches oldest first and sums the expirable ones", () => {
    const d = tokenDetail(l, tokenRow(), undefined, batches, [], NOW);
    expect(d.batches.map((b) => b.index)).toEqual([1, 2]);
    expect(d.batches[0]!.deadline).toBe(NOW - 31 * DAY + 30 * DAY);
    expect(d.buckets.expirable.raw).toBe("100");
    expect(d.buckets.credited.raw).toBe("300");
    expect(d.buckets.unswept).toBeNull();
  });

  it("derives the creator share from the Pons launch policy", () => {
    expect(tokenDetail(l, tokenRow(), undefined, [], [], NOW).feePolicy).toEqual({
      creatorShareBps: 2000,
      protocolShareBps: 3000,
    });
    expect(
      tokenDetail(
        l,
        tokenRow({ protocolShareBps: null, buybackBurnBps: null }),
        undefined,
        [],
        [],
        NOW,
      ).feePolicy,
    ).toEqual({ creatorShareBps: null, protocolShareBps: null });
  });

  it("orders history newest first and counts claims in the last 30 days", () => {
    const events = [
      ev({ kind: "routed", amount: null, blockNumber: 1, timestamp: NOW - 40 * DAY }),
      ev({ kind: "collect", gross: 1000n, fee: 10n, amount: 990n, blockNumber: 2 }),
      ev({ kind: "claim", counterparty: WALLET, blockNumber: 3, timestamp: NOW - 31 * DAY }),
      ev({ kind: "claim", counterparty: WALLET, blockNumber: 4, timestamp: NOW - DAY }),
    ];
    const d = tokenDetail(l, tokenRow(), undefined, [], events, NOW);
    expect(d.history.map((h) => h.kind)).toEqual(["claim", "claim", "collect", "routed"]);
    expect(d.history[0]).toMatchObject({ counterparty: WALLET, actor: { userId: "42" } });
    expect(d.history[2]).toMatchObject({ gross: "1000", fee: "10", amount: { raw: "990" } });
    expect(d.history[3]!.amount).toBeNull();
    expect(d.claimsLast30d).toBe(1);
  });
});

describe("totals", () => {
  const row = (asset: `0x${string}`, gross: bigint) => ({
    asset,
    collectedGross: gross,
    feesTaken: gross / 100n,
    credited: gross - gross / 100n,
    claimed: 100n,
    expiredToCreators: 50n,
    feesWithdrawn: 0n,
  });
  const OTHER_A = "0x0000000000000000000000000000000000000a01" as const;
  const OTHER_B = "0x0000000000000000000000000000000000000b01" as const;

  it("puts ETH and USDG first, then other assets by volume, and derives unclaimed", () => {
    const t = totals(
      l,
      [
        row(OTHER_A, 10_000n),
        row(USDG, 1000n),
        row(OTHER_B, 20_000n),
        row(NATIVE_ASSET_ADDRESS, 5000n),
      ],
      new Map([[USDG, 7n]]),
      4,
      [NATIVE_ASSET_ADDRESS, USDG],
      NOW,
    );
    expect(t.assets.map((a) => a.asset.address)).toEqual([
      NATIVE_ASSET_ADDRESS,
      USDG,
      OTHER_B,
      OTHER_A,
    ]);
    const usdg = t.assets[1]!;
    expect(usdg).toMatchObject({ credited: "990", claimed: "100", unclaimed: "840", accrued: "7" });
    expect(t.assets[2]!.asset.symbol).toBe("?");
    expect(t.tokensRouted).toBe(4);
  });
});

describe("claimRecords", () => {
  it("groups one claim tx's per-token logs into one row with per-asset sums", () => {
    const tx = "0xabc" as const;
    const events = [
      ev({
        kind: "claim",
        txHash: tx,
        token: TOKEN_A,
        amount: 5n,
        counterparty: WALLET,
        logIndex: 1,
        blockNumber: 50,
      }),
      ev({
        kind: "claim",
        txHash: tx,
        token: TOKEN_B,
        amount: 7n,
        counterparty: WALLET,
        logIndex: 2,
        blockNumber: 50,
      }),
      ev({ kind: "claim", token: TOKEN_A, amount: 1n, counterparty: WALLET, blockNumber: 40 }),
      ev({ kind: "collect", blockNumber: 60 }),
    ];
    const tokens = new Map([
      [TOKEN_A, tokenRow()],
      [TOKEN_B, tokenRow({ address: TOKEN_B, symbol: "BET" })],
    ]);
    const r = claimRecords(l, events, tokens);
    expect(r).toHaveLength(2);
    expect(r[0]!.txHash).toBe(tx);
    expect(r[0]!.tokens.map((t) => t.symbol).sort()).toEqual(["ALP", "BET"]);
    expect(r[0]!.amounts).toEqual([
      { asset: expect.objectContaining({ address: USDG }), raw: "12" },
    ]);
    expect(r[0]!.to).toBe(WALLET);
  });
});

describe("accountView", () => {
  it("builds tokens, per-asset received and labelled activity", () => {
    const eth = tokenRow({
      address: TOKEN_B,
      asset: NATIVE_ASSET_ADDRESS,
      symbol: "BET",
      credited: 0n,
      collectedGross: 200n,
      feesTaken: 2n,
      claimed: 198n,
    });
    const batches: BatchRow[] = [
      { token: TOKEN_A, index: 3, amount: 300n, creditedAt: NOW - 2 * DAY, open: true },
    ];
    const tx = "0xc1" as const;
    const events = [
      ev({ kind: "collect", token: TOKEN_A, amount: 300n, blockNumber: 90 }),
      ev({ kind: "claim", txHash: tx, token: TOKEN_A, amount: 690n, blockNumber: 80, logIndex: 0 }),
      ev({
        kind: "claim",
        txHash: tx,
        token: TOKEN_B,
        asset: NATIVE_ASSET_ADDRESS,
        amount: 198n,
        blockNumber: 80,
        logIndex: 1,
      }),
      ev({ kind: "claim", token: TOKEN_A, amount: 5n, blockNumber: 70 }),
    ];
    const v = accountView(l, "42", [tokenRow(), eth], new Map(), batches, events);
    expect(v.account.username).toBe("example");
    expect(v.tokens[0]).toMatchObject({
      claimable: { raw: "300" },
      pending: { raw: "0" },
      oldestDeadline: NOW - 2 * DAY + 30 * DAY,
      oldestAmount: { raw: "300" },
    });
    expect(v.tokens[1]).toMatchObject({ oldestDeadline: null, oldestAmount: null });
    expect(v.received).toEqual([
      {
        asset: expect.objectContaining({ address: USDG }),
        gross: "1000",
        fee: "10",
        net: "990",
        claimed: "690",
      },
      {
        asset: expect.objectContaining({ symbol: "ETH" }),
        gross: "200",
        fee: "2",
        net: "198",
        claimed: "198",
      },
    ]);
    expect(v.activity.map((a) => a.label)).toEqual([
      "Collected · $ALP",
      "Claimed · 2 tokens",
      "Claimed · $ALP",
    ]);
    expect(v.activity[1]!.amounts.map((a) => a.raw).sort()).toEqual(["198", "690"]);
  });
});

describe("leaderboard", () => {
  it("ranks by net received, drops zero rows and applies the limit", () => {
    const usdg = { address: USDG, symbol: "USDG", decimals: 6 };
    const r = leaderboard(
      l,
      usdg,
      [
        { xUserId: "1", received: 5n },
        { xUserId: "42", received: 9n },
        { xUserId: "3", received: 0n },
        { xUserId: "4", received: 1n },
      ],
      2,
    );
    expect(r.map((e) => [e.rank, e.account.userId, e.received.raw])).toEqual([
      [1, "42", "9"],
      [2, "1", "5"],
    ]);
  });
});
