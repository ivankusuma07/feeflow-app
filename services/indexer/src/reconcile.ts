import { feeFlowAbi, ponsFactoryAbi, ponsOverrideAbi } from "@feeflow/abi";
import type { Totals } from "@feeflow/sdk";
import type { Address, PublicClient } from "viem";

/**
 * Brief §Indexer: a reconciliation job compares indexed totals with `totals(asset)` on chain and
 * alerts on drift. The chain is read at the block the indexer has reached, so a lagging indexer
 * is not reported as drift.
 */

export const RECONCILED_FIELDS = [
  "collectedGross",
  "feesTaken",
  "credited",
  "claimed",
  "expiredToCreators",
] as const;

export interface Drift {
  asset: string;
  field: (typeof RECONCILED_FIELDS)[number];
  indexed: string;
  onChain: string;
}

export async function reconcile(opts: {
  client: Pick<PublicClient, "readContract">;
  contract: Address;
  totals: Totals;
  blockNumber: bigint;
}): Promise<Drift[]> {
  const drift: Drift[] = [];
  for (const a of opts.totals.assets) {
    const chain = await opts.client.readContract({
      address: opts.contract,
      abi: feeFlowAbi,
      functionName: "totals",
      args: [a.asset.address],
      blockNumber: opts.blockNumber,
    });
    for (const field of RECONCILED_FIELDS) {
      const onChain = chain[field].toString();
      if (onChain !== a[field])
        drift.push({ asset: a.asset.address, field, indexed: a[field], onChain });
    }
  }
  return drift;
}

/** One row of `/api/keeper/work`, as far as the override check needs it. */
export interface RoutedToken {
  token: Address;
  sink: Address;
  exited: boolean;
  ponsOverride: { to: Address; effectiveAt: number } | null;
  redirectedTo: Address | null;
}

export type OverrideFinding =
  /** Pons has a proposal to move this token's creator fees off its sink. */
  | { status: "pons-override-pending"; token: Address; to: Address; effectiveAt: number }
  /** Pons no longer pays the sink and FeeFlow did not exit the token. */
  | { status: "pons-redirected"; token: Address; to: Address }
  /** The indexer's view of the override disagrees with the chain. */
  | { status: "override-drift"; token: Address; field: string; indexed: string; onChain: string };

const lc = (a: string | null | undefined) => (a ?? "").toLowerCase();

/**
 * Reads the Pons override state of every routed (not exited) token straight from the factory,
 * independent of the indexer, and reports pending overrides, executed redirects and any place
 * the indexer disagrees. Read at the indexed block, like `reconcile`.
 */
export async function checkPonsOverrides(opts: {
  client: Pick<PublicClient, "readContract">;
  factory: Address;
  tokens: RoutedToken[];
  blockNumber: bigint;
  /** Unix seconds; a proposal past its execution window can no longer execute. */
  now: number;
}): Promise<OverrideFinding[]> {
  const out: OverrideFinding[] = [];
  const drift = (token: Address, field: string, indexed: string, onChain: string) =>
    out.push({ status: "override-drift", token, field, indexed, onChain });
  for (const t of opts.tokens) {
    if (t.exited) continue;
    const [pending, launched] = await Promise.all([
      opts.client.readContract({
        address: opts.factory,
        abi: ponsOverrideAbi,
        functionName: "pendingCreatorFeeRecipient",
        args: [t.token],
        blockNumber: opts.blockNumber,
      }),
      opts.client.readContract({
        address: opts.factory,
        abi: ponsFactoryAbi,
        functionName: "getLaunchedToken",
        args: [t.token],
        blockNumber: opts.blockNumber,
      }),
    ]);

    // Pending: proposed and still executable. Pons keeps an expired proposal in storage until it
    // is replaced, so expiry is checked here, as the indexer does.
    const [to, effectiveAt, expiresAt] = pending;
    const live = BigInt(to) !== 0n && Number(expiresAt) >= opts.now;
    if (live)
      out.push({
        status: "pons-override-pending",
        token: t.token,
        to,
        effectiveAt: Number(effectiveAt),
      });
    const indexedTo = lc(t.ponsOverride?.to);
    if (indexedTo !== (live ? lc(to) : ""))
      drift(t.token, "ponsOverride", indexedTo, live ? lc(to) : "");

    // Redirected: the indexer saw the recipient leave the sink. A recipient that never became the
    // sink (routing step 5 not done yet) is not a redirect, so only the indexer's claim is checked.
    const recipient = lc(launched.creatorFeeRecipient);
    if (t.redirectedTo) {
      out.push({ status: "pons-redirected", token: t.token, to: t.redirectedTo });
      if (recipient !== lc(t.redirectedTo))
        drift(t.token, "redirectedTo", lc(t.redirectedTo), recipient);
    }
  }
  return out;
}

/** Ponder's `/status`: the latest block each chain is indexed to. */
export async function indexedBlock(indexerUrl: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${indexerUrl.replace(/\/$/, "")}/status`);
  if (!res.ok) throw new Error(`indexer /status returned ${res.status}`);
  const body = (await res.json()) as Record<string, { block?: { number?: number } }>;
  const n = body.main?.block?.number;
  if (typeof n !== "number") throw new Error("indexer /status has no block for chain 'main'");
  return BigInt(n);
}
