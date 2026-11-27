/**
 * Reconciliation run (cron on the VPS, e.g. every 15 min). Exits 1 and prints one JSON line per
 * drifting field or pending Pons override, so the host's alerting can page on a non-zero exit.
 *
 *   INDEXER_URL=http://127.0.0.1:42069 RPC_URL=... CHAIN_ID=... CONTRACT_ADDRESS=... \
 *     pnpm --filter @feeflow/indexer reconcile
 */
import { THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import type { Totals } from "@feeflow/sdk";
import { createPublicClient, http, isAddress } from "viem";
import { checkPonsOverrides, indexedBlock, reconcile, type RoutedToken } from "../src/reconcile";

const { INDEXER_URL, RPC_URL, CHAIN_ID, CONTRACT_ADDRESS } = process.env;
if (!INDEXER_URL || !RPC_URL || !CHAIN_ID || !CONTRACT_ADDRESS || !isAddress(CONTRACT_ADDRESS)) {
  console.error("INDEXER_URL, RPC_URL, CHAIN_ID and CONTRACT_ADDRESS are required");
  process.exit(2);
}
const factory = THIRD_PARTY_ADDRESSES[Number(CHAIN_ID)]?.ponsFactory;
if (!factory) {
  console.error(`No Pons factory address for chain ${CHAIN_ID}`);
  process.exit(2);
}

const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), kind: "reconcile", ...entry }));

async function getJson<T>(url: string, path: string): Promise<T> {
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`);
  if (!res.ok) throw new Error(`indexer ${path} returned ${res.status}`);
  return (await res.json()) as T;
}

/** Totals and tokens read while the indexer stayed on one block, so both sides match. */
async function stableState(
  url: string,
): Promise<{ blockNumber: bigint; totals: Totals; tokens: RoutedToken[] }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await indexedBlock(url);
    const [totals, tokens] = await Promise.all([
      getJson<Totals>(url, "/api/totals"),
      getJson<RoutedToken[]>(url, "/api/keeper/work"),
    ]);
    if ((await indexedBlock(url)) === before) return { blockNumber: before, totals, tokens };
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("indexer kept advancing; retry the reconciliation later");
}

const { blockNumber, totals, tokens } = await stableState(INDEXER_URL);

const client = createPublicClient({ transport: http(RPC_URL) });
const drift = await reconcile({ client, contract: CONTRACT_ADDRESS, totals, blockNumber });
for (const d of drift) log({ status: "drift", block: Number(blockNumber), ...d });

// Pons owner overrides: a pending one is time-critical (it executes after 3 days), so it fails
// the run; an executed redirect is logged every run but no longer fails it (nothing left to stop).
const overrides = await checkPonsOverrides({
  client,
  factory,
  tokens,
  blockNumber,
  now: Math.floor(Date.now() / 1000),
});
for (const o of overrides) log({ block: Number(blockNumber), ...o });
const failing = overrides.filter((o) => o.status !== "pons-redirected");

const failed = drift.length > 0 || failing.length > 0;
log({
  status: failed ? "fail" : "ok",
  block: Number(blockNumber),
  assets: totals.assets.length,
  tokens: tokens.length,
  ponsOverridesPending: overrides.filter((o) => o.status === "pons-override-pending").length,
  ponsRedirected: overrides.filter((o) => o.status === "pons-redirected").length,
});
process.exit(failed ? 1 : 0);
