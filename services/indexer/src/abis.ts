import { parseAbi } from "viem";

/**
 * Pons curve view used for the `graduated` flag. Verified 26 Nov 2026 on Robinhood Chain (4663):
 * returns true for a token whose `getLaunchedToken(..).phase` is 2 and false for phase-0 tokens.
 */
export const ponsCurveAbi = parseAbi(["function graduated() view returns (bool)"]);

/** Plain ERC-20 metadata reads. Values are untrusted display data. */
export const erc20MetaAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

/**
 * Pons token logo, set from `launchToken(params.logo)`. Verified 27 Nov 2026 on Robinhood Chain
 * (4663): token 0x5Ee3…808f returns the `ipfs://bafkrei…` value passed to its launch. Untrusted
 * display data; only clean `ipfs://` references are kept (see `ipfsImageUrl`).
 */
export const ponsTokenAbi = parseAbi(["function logo() view returns (string)"]);
