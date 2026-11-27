import { CLAIM_WINDOW_SECONDS, NATIVE_ASSET_ADDRESS } from "@feeflow/config";
import type { Address } from "viem";

/**
 * Keeper decisions, kept pure so every rule is unit-tested (brief §Testing: "Vitest for keeper
 * decisions"). The executor re-reads each value on chain right before acting.
 */

/** One row of the indexer's `/api/keeper/work`. */
export interface WorkItem {
  token: Address;
  sink: Address;
  asset: Address;
  curve: Address | null;
  exited: boolean;
  /** Pending Pons owner override of the creator fee recipient; null when none. */
  ponsOverride: { to: Address; effectiveAt: number; expiresAt: number } | null;
  /** Set when a Pons override moved the recipient off the sink (not exited). */
  redirectedTo: Address | null;
  graduated: boolean;
  /** Credited in FeeFlow (base units, decimal string). */
  credited: string;
  /** Oldest open batch, unix seconds; null when nothing is credited. */
  oldestCreditedAt: number | null;
}

export interface Thresholds {
  usdg: Address | undefined;
  eth: bigint;
  usdgAmount: bigint;
  /** Other ERC-20 pairs; undefined = not collected by the keeper. */
  other: bigint | undefined;
}

/** Collect threshold for a pair asset, or undefined if the keeper skips that asset. */
export function collectThreshold(t: Thresholds, asset: Address): bigint | undefined {
  const a = asset.toLowerCase();
  if (a === NATIVE_ASSET_ADDRESS) return t.eth;
  if (t.usdg && a === t.usdg.toLowerCase()) return t.usdgAmount;
  return t.other;
}

/**
 * Sweep candidates: routed (not exited or redirected by Pons), not graduated, with a known curve.
 * Graduated tokens accrue on the pool hook, whose sweep needs a pool id the keeper does not have
 * yet. A redirected token's sweep would pay its new recipient, so it costs gas for nothing.
 */
export function sweepCandidates(items: WorkItem[]): WorkItem[] {
  return items.filter(
    (i) => !i.exited && i.redirectedTo === null && !i.graduated && i.curve !== null,
  );
}

export type OverrideAlert =
  | { alert: "pons-override-pending"; token: Address; to: Address; effectiveAt: number }
  | { alert: "pons-redirected"; token: Address; to: Address };

/**
 * The Pons protocol owner can redirect a token's creator fees after a 3-day notice, and FeeFlow
 * cannot stop it. Every run logs one alert per affected token so an operator can tell the creator
 * (and collect what is still in the escrow) before the override executes.
 */
export function overrideAlerts(items: WorkItem[]): OverrideAlert[] {
  const out: OverrideAlert[] = [];
  for (const i of items) {
    if (i.exited) continue;
    if (i.redirectedTo) out.push({ alert: "pons-redirected", token: i.token, to: i.redirectedTo });
    if (i.ponsOverride)
      out.push({
        alert: "pons-override-pending",
        token: i.token,
        to: i.ponsOverride.to,
        effectiveAt: i.ponsOverride.effectiveAt,
      });
  }
  return out;
}

/**
 * Tokens to `collect`: escrow at or above the asset's threshold (and above zero). Exited tokens
 * are included: fees credited to the sink before the exit still belong to the bound account.
 */
export function collectTargets(
  items: WorkItem[],
  escrow: Map<Address, bigint>,
  t: Thresholds,
): Address[] {
  return items
    .filter((i) => {
      const bal = escrow.get(i.token) ?? 0n;
      const min = collectThreshold(t, i.asset);
      return min !== undefined && bal > 0n && bal >= min;
    })
    .map((i) => i.token);
}

/** Tokens whose oldest open batch is past the 30-day window; confirmed with `expirable()`. */
export function releaseCandidates(items: WorkItem[], now: number): Address[] {
  const window = Number(CLAIM_WINDOW_SECONDS);
  return items
    .filter(
      (i) =>
        BigInt(i.credited) > 0n &&
        i.oldestCreditedAt !== null &&
        i.oldestCreditedAt + window <= now,
    )
    .map((i) => i.token);
}

/** Pair assets due for `withdrawFees` (weekly by default). */
export function withdrawDue(
  items: WorkItem[],
  lastWithdrawAt: Map<Address, number>,
  everySeconds: number,
  now: number,
): Address[] {
  const assets = [...new Set(items.map((i) => i.asset.toLowerCase() as Address))];
  return assets.filter((a) => now - (lastWithdrawAt.get(a) ?? 0) >= everySeconds);
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Delay before the next run: the interval, doubled per consecutive failure, capped at 1 h. */
export function nextDelaySeconds(intervalSeconds: number, failures: number): number {
  if (failures <= 0) return intervalSeconds;
  return Math.min(intervalSeconds * 2 ** Math.min(failures, 10), 3600);
}

/** Tracks gas spent in one run against GAS_BUDGET_WEI_PER_RUN. */
export class GasBudget {
  spent = 0n;
  constructor(readonly limit: bigint) {}
  allows(estimate: bigint): boolean {
    return this.spent + estimate <= this.limit;
  }
  add(cost: bigint) {
    this.spent += cost;
  }
}
