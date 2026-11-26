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

/**
 * The asset a Pons token is paired with, which is the asset its creator fees are paid in.
 * FeeFlow accepts any pair Pons allows: native ETH (`address(0)`), USDG, or any other ERC-20.
 * `symbol` and `decimals` of other ERC-20s come from the token contract (indexer) and are
 * untrusted display data; identify assets by `address` only.
 */
export interface PairAsset {
  /** `0x0000…0000` for native ETH. Lowercase or checksummed; compare with `sameAsset`. */
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}

export const NATIVE_ASSET_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const NATIVE_ETH: PairAsset = { address: NATIVE_ASSET_ADDRESS, symbol: "ETH", decimals: 18 };

export function isNative(asset: Pick<PairAsset, "address">): boolean {
  return asset.address.toLowerCase() === NATIVE_ASSET_ADDRESS;
}

export function sameAsset(a: Pick<PairAsset, "address">, b: Pick<PairAsset, "address">): boolean {
  return a.address.toLowerCase() === b.address.toLowerCase();
}

/** Splits a gross collection into FeeFlow fee and net credit, as the contract does. */
export function splitGross(gross: bigint): { fee: bigint; net: bigint } {
  const fee = (gross * FEE_BPS) / BPS_DENOMINATOR;
  return { fee, net: gross - fee };
}
