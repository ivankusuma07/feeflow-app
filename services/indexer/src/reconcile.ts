import { feeFlowAbi } from "@feeflow/abi";
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

/** Ponder's `/status`: the latest block each chain is indexed to. */
export async function indexedBlock(indexerUrl: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${indexerUrl.replace(/\/$/, "")}/status`);
  if (!res.ok) throw new Error(`indexer /status returned ${res.status}`);
  const body = (await res.json()) as Record<string, { block?: { number?: number } }>;
  const n = body.main?.block?.number;
  if (typeof n !== "number") throw new Error("indexer /status has no block for chain 'main'");
  return BigInt(n);
}
