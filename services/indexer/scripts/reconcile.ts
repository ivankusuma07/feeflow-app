/**
 * Reconciliation run (cron on the VPS, e.g. every 15 min). Exits 1 and prints one JSON line per
 * drifting field, so the host's alerting can page on a non-zero exit.
 *
 *   INDEXER_URL=http://127.0.0.1:42069 RPC_URL=... CHAIN_ID=... CONTRACT_ADDRESS=... \
 *     pnpm --filter @feeflow/indexer reconcile
 */
import type { Totals } from "@feeflow/sdk";
import { createPublicClient, http, isAddress } from "viem";
import { indexedBlock, reconcile } from "../src/reconcile";

const { INDEXER_URL, RPC_URL, CHAIN_ID, CONTRACT_ADDRESS } = process.env;
if (!INDEXER_URL || !RPC_URL || !CHAIN_ID || !CONTRACT_ADDRESS || !isAddress(CONTRACT_ADDRESS)) {
  console.error("INDEXER_URL, RPC_URL, CHAIN_ID and CONTRACT_ADDRESS are required");
  process.exit(2);
}

const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), kind: "reconcile", ...entry }));

/** Totals read while the indexer stayed on one block, so both sides describe the same state. */
async function stableTotals(url: string): Promise<{ blockNumber: bigint; totals: Totals }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await indexedBlock(url);
    const res = await fetch(`${url.replace(/\/$/, "")}/api/totals`);
    if (!res.ok) throw new Error(`indexer /api/totals returned ${res.status}`);
    const totals = (await res.json()) as Totals;
    if ((await indexedBlock(url)) === before) return { blockNumber: before, totals };
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("indexer kept advancing; retry the reconciliation later");
}

const { blockNumber, totals } = await stableTotals(INDEXER_URL);

const client = createPublicClient({ transport: http(RPC_URL) });
const drift = await reconcile({ client, contract: CONTRACT_ADDRESS, totals, blockNumber });
for (const d of drift) log({ status: "drift", block: Number(blockNumber), ...d });
log({
  status: drift.length ? "fail" : "ok",
  block: Number(blockNumber),
  assets: totals.assets.length,
});
process.exit(drift.length ? 1 : 0);
