import { feeFlowAbi } from "@feeflow/abi";
import { knownPairAssets, sameAsset, type PairAsset } from "@feeflow/config";
import { amount, type Amount } from "@feeflow/sdk";
import { isAddressEqual, parseEventLogs, type Address, type TransactionReceipt } from "viem";

export interface ClaimedRow {
  token: Address;
  amounts: Amount[];
}

export interface ClaimedSummary {
  to: Address;
  rows: ClaimedRow[];
}

export type ClaimedParse =
  | { ok: true; summary: ClaimedSummary; unknownAssets: Address[] }
  | { ok: false; reason: "reverted" | "not-a-claim" };

/**
 * Reads FeeFlow `Claimed(token, xUserId, to, asset, amount, nonce)` events from a receipt.
 * Only logs emitted by the configured FeeFlow contract count. Asset metadata comes from
 * `assets` (the account's pair assets and the known ones); unknown assets are returned so the
 * caller can read their ERC-20 symbol and decimals, and are shown once those resolve.
 */
export function parseClaimed(
  receipt: TransactionReceipt,
  contract: Address,
  chainId: number,
  assets: PairAsset[],
): ClaimedParse {
  if (receipt.status !== "success") return { ok: false, reason: "reverted" };
  const logs = parseEventLogs({ abi: feeFlowAbi, eventName: "Claimed", logs: receipt.logs }).filter(
    (l) => isAddressEqual(l.address, contract),
  );
  if (logs.length === 0) return { ok: false, reason: "not-a-claim" };

  const catalog = [...assets, ...knownPairAssets(chainId)];
  const unknown: Address[] = [];
  const rows: ClaimedRow[] = [];

  for (const l of logs) {
    const { token, asset, amount: raw } = l.args;
    const meta = catalog.find((a) => sameAsset(a, { address: asset }));
    if (!meta) {
      if (!unknown.some((u) => isAddressEqual(u, asset))) unknown.push(asset);
      continue;
    }
    const value = amount(meta, raw.toString());
    const row = rows.find((r) => isAddressEqual(r.token, token));
    if (row) row.amounts.push(value);
    else rows.push({ token, amounts: [value] });
  }

  return { ok: true, summary: { to: logs[0]!.args.to, rows }, unknownAssets: unknown };
}
