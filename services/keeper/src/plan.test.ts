import { NATIVE_ASSET_ADDRESS } from "@feeflow/config";
import { describe, expect, it } from "vitest";
import {
  chunk,
  collectTargets,
  collectThreshold,
  GasBudget,
  nextDelaySeconds,
  releaseCandidates,
  sweepCandidates,
  withdrawDue,
  type Thresholds,
  type WorkItem,
} from "./plan";

const USDG = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as const;
const GME = "0x1b0E319c6A659F002271B69dB8A7df2F911c153E" as const;
const DAY = 86_400;
const NOW = 1_800_000_000;
const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as const;

const item = (n: number, over: Partial<WorkItem> = {}): WorkItem => ({
  token: a(n),
  sink: a(1000 + n),
  asset: USDG.toLowerCase() as `0x${string}`,
  curve: a(2000 + n),
  exited: false,
  graduated: false,
  credited: "0",
  oldestCreditedAt: null,
  ...over,
});

const t: Thresholds = { usdg: USDG, usdgAmount: 10_000_000n, eth: 10n ** 16n, other: undefined };

describe("collectThreshold", () => {
  it("maps ETH, USDG (any casing) and other assets", () => {
    expect(collectThreshold(t, NATIVE_ASSET_ADDRESS)).toBe(10n ** 16n);
    expect(collectThreshold(t, USDG.toLowerCase() as `0x${string}`)).toBe(10_000_000n);
    expect(collectThreshold(t, GME)).toBeUndefined();
    expect(collectThreshold({ ...t, other: 5n }, GME)).toBe(5n);
  });
});

describe("sweepCandidates", () => {
  it("skips exited, graduated and curve-less tokens", () => {
    const items = [
      item(1),
      item(2, { exited: true }),
      item(3, { graduated: true }),
      item(4, { curve: null }),
    ];
    expect(sweepCandidates(items).map((i) => i.token)).toEqual([a(1)]);
  });
});

describe("collectTargets", () => {
  it("collects at or above the threshold, never zero, and skips unconfigured assets", () => {
    const items = [
      item(1),
      item(2),
      item(3, { exited: true }),
      item(4, { asset: GME }),
      item(5, { asset: NATIVE_ASSET_ADDRESS }),
    ];
    const escrow = new Map([
      [a(1), 10_000_000n],
      [a(2), 9_999_999n],
      [a(3), 50_000_000n],
      [a(4), 10n ** 20n],
      [a(5), 0n],
    ]);
    expect(collectTargets(items, escrow, t)).toEqual([a(1), a(3)]);
    expect(collectTargets([item(6)], new Map([[a(6), 0n]]), { ...t, usdgAmount: 0n })).toEqual([]);
  });
});

describe("releaseCandidates", () => {
  it("picks credited tokens whose oldest batch is past 30 days", () => {
    const items = [
      item(1, { credited: "5", oldestCreditedAt: NOW - 30 * DAY }),
      item(2, { credited: "5", oldestCreditedAt: NOW - 30 * DAY + 1 }),
      item(3, { credited: "0", oldestCreditedAt: NOW - 40 * DAY }),
      item(4, { credited: "5", oldestCreditedAt: null }),
    ];
    expect(releaseCandidates(items, NOW)).toEqual([a(1)]);
  });
});

describe("withdrawDue", () => {
  it("lists each asset once, when its last withdrawal is older than the period", () => {
    const items = [item(1), item(2), item(3, { asset: NATIVE_ASSET_ADDRESS })];
    const last = new Map([[USDG.toLowerCase() as `0x${string}`, NOW - DAY]]);
    expect(withdrawDue(items, last, 7 * DAY, NOW)).toEqual([NATIVE_ASSET_ADDRESS]);
    expect(withdrawDue(items, last, 7 * DAY, NOW + 6 * DAY)).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("chunks, backs off exponentially up to an hour, and tracks the gas budget", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect([0, 1, 2, 3, 20].map((f) => nextDelaySeconds(300, f))).toEqual([
      300, 600, 1200, 2400, 3600,
    ]);
    const b = new GasBudget(100n);
    expect(b.allows(100n)).toBe(true);
    b.add(60n);
    expect(b.allows(41n)).toBe(false);
    expect(b.allows(40n)).toBe(true);
  });
});
