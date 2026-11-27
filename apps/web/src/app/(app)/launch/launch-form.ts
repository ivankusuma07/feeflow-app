import { ponsLaunchAbi } from "@feeflow/abi";
import {
  decodeEventLog,
  isAddressEqual,
  parseUnits,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type Log,
} from "viem";

/** Pons metadata limits in bytes (PonsV2LaunchDeployer, verified source). */
export const LIMITS = { name: 64, symbol: 16, logo: 512, description: 2048, social: 256 } as const;
/** Pons' `maxCreatorTaxBps` on mainnet (10%); the page also reads it live. */
export const MAX_TAX_BPS = 1000;

export const byteLength = (s: string) => new TextEncoder().encode(s).length;

export interface LaunchDraft {
  name: string;
  symbol: string;
  description: string;
  /** `ipfs://` URI from the upload, or null for no image. */
  logo: string | null;
  twitter: string;
  telegram: string;
  website: string;
  /** Added creator tax in percent, e.g. "1.5". */
  taxPct: string;
  /** Optional initial buy in the pair asset, e.g. "0.05". */
  buy: string;
}

export type DraftField = "name" | "symbol" | "description" | "socials" | "taxPct" | "buy";

/** "1.5" → 150 bps. At most two decimals, 0..max. Empty = 0. Null when malformed. */
export function parseTaxBps(pct: string, maxBps: number = MAX_TAX_BPS): number | null {
  const t = pct.trim();
  if (t === "") return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps <= maxBps ? bps : null;
}

/** Initial buy in base units; 0n when empty, null when malformed. */
export function parseBuy(amount: string, decimals: number): bigint | null {
  const t = amount.trim();
  if (t === "") return 0n;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const frac = t.split(".")[1] ?? "";
  if (frac.length > decimals) return null;
  return parseUnits(t, decimals);
}

/** Social links are optional; when given they must be https URLs (Pons stores any string). */
export function socialOk(url: string): boolean {
  const t = url.trim();
  if (t === "") return true;
  if (byteLength(t) > LIMITS.social) return false;
  try {
    return new URL(t).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateDraft(
  d: LaunchDraft,
  opts: { pairDecimals: number; maxTaxBps?: number },
): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  const name = d.name.trim();
  const symbol = d.symbol.trim();
  if (!name) e.name = "Enter a name.";
  else if (byteLength(name) > LIMITS.name) e.name = `At most ${LIMITS.name} bytes.`;
  if (!symbol) e.symbol = "Enter a ticker.";
  else if (!/^[A-Za-z0-9]+$/.test(symbol)) e.symbol = "Letters and digits only.";
  else if (symbol.length > LIMITS.symbol) e.symbol = `At most ${LIMITS.symbol} characters.`;
  if (byteLength(d.description.trim()) > LIMITS.description)
    e.description = `At most ${LIMITS.description} bytes.`;
  if (![d.twitter, d.telegram, d.website].every(socialOk))
    e.socials = "Links must be full https:// URLs.";
  const maxTax = opts.maxTaxBps ?? MAX_TAX_BPS;
  if (parseTaxBps(d.taxPct, maxTax) === null)
    e.taxPct = `0 to ${maxTax / 100}%, at most two decimals.`;
  if (parseBuy(d.buy, opts.pairDecimals) === null) e.buy = "Enter an amount, or leave it empty.";
  return e;
}

/** A fresh CREATE2 salt; Pons scopes it to the launching wallet. */
export function newSalt(
  random: (b: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): Hex {
  return toHex(random(new Uint8Array(32)));
}

/**
 * `launchToken` params. The launching wallet stays the creator fee recipient: a token's address
 * depends on its recipient, so it cannot launch with its own FeeFlow sink. Routing follows on
 * /route. Buybacks stay off: Pons would vest bought-back tokens to the recipient (the sink),
 * which FeeFlow does not pay out. `expectedEconomics` zero = no check.
 */
export function launchParams(d: LaunchDraft, salt: Hex, maxTaxBps?: number) {
  return {
    name: d.name.trim(),
    symbol: d.symbol.trim().toUpperCase(),
    logo: d.logo ?? "",
    description: d.description.trim(),
    socials: {
      twitter: d.twitter.trim(),
      telegram: d.telegram.trim(),
      discord: "",
      website: d.website.trim(),
      farcaster: "",
    },
    creatorFeeRecipient: zeroAddress,
    creatorTaxBps: parseTaxBps(d.taxPct, maxTaxBps) ?? 0,
    buybackEnabled: false,
    expectedEconomics: `0x${"0".repeat(64)}` as Hex,
    salt,
  } as const;
}

/** The token and curve from the launch receipt's `TokenLaunched` event. */
export function launchedFromLogs(
  logs: readonly Pick<Log, "address" | "data" | "topics">[],
  factory: Address,
): { token: Address; curve: Address } | null {
  for (const log of logs) {
    if (!isAddressEqual(log.address, factory)) continue;
    try {
      const ev = decodeEventLog({ abi: ponsLaunchAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "TokenLaunched") return { token: ev.args.token, curve: ev.args.curve };
    } catch {
      /* another event */
    }
  }
  return null;
}

/** Hands the new token to /route, with the X account already chosen. */
export function routeHref(token: Address, handle: string): string {
  return `/route?token=${token}&handle=${encodeURIComponent(handle)}`;
}
