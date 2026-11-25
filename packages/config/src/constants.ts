/**
 * Protocol constants. These mirror immutable values in FeeFlow.sol and must
 * never be read from env: the contract has no setter for any of them.
 */

/** FeeFlow fee in basis points. `FEE_BPS` constant in the contract. */
export const FEE_BPS = 100n;
export const BPS_DENOMINATOR = 10_000n;

/** Each credited batch is claimable for this long, from its collect tx. */
export const CLAIM_WINDOW_SECONDS = 30n * 24n * 60n * 60n;
export const CLAIM_WINDOW_DAYS = 30;

/** Attestations signed by the attestation service expire within this window. */
export const MAX_ATTESTATION_TTL_SECONDS = 10 * 60;

export const TOKEN_NAME = "FLOW";
export const TOKEN_TICKER = "$FLOW";

export type PairAsset = "USDG" | "ETH";

export const PAIR_ASSET_DECIMALS: Record<PairAsset, number> = {
  USDG: 6,
  ETH: 18,
};

/** Splits a gross collection into FeeFlow fee and net credit, as the contract does. */
export function splitGross(gross: bigint): { fee: bigint; net: bigint } {
  const fee = (gross * FEE_BPS) / BPS_DENOMINATOR;
  return { fee, net: gross - fee };
}
