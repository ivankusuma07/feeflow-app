import { isNative, type PairAsset } from "@feeflow/config";
import { displaySymbol, formatRaw, type Amount } from "@feeflow/sdk";
import { APP_CHAIN_ID } from "./chain";

/** USDG first (the designs' headline figure), then ETH, then other pair assets. */
function assetRank(a: PairAsset): number {
  if (displaySymbol(a, APP_CHAIN_ID) === "USDG") return 0;
  if (isNative(a)) return 1;
  return 2;
}

export const byAsset = (x: Amount, y: Amount) =>
  assetRank(x.asset) - assetRank(y.asset) || x.asset.symbol.localeCompare(y.asset.symbol);

export const nonZero = (a: Amount) => BigInt(a.raw) > 0n;

export const symbolOf = (a: PairAsset) => displaySymbol(a, APP_CHAIN_ID);

/** "312.40 USDG + 0.0842 ETH": one figure per asset, never summed across assets. */
export const joinAmounts = (amounts: Amount[]) =>
  amounts.map((a) => `${formatRaw(a.raw, a.asset)} ${symbolOf(a.asset)}`).join(" + ");
