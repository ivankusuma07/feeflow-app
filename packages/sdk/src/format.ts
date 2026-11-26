import { isNative, knownPairAssets, sameAsset, type PairAsset } from "@feeflow/config";
import type { Amount } from "./types";

/**
 * Display precision: stablecoin-like assets (6 decimals or fewer, e.g. USDG) to 2 places, ETH and
 * 18-decimal tokens to 4 places, as in the designs. Never more than the asset's own decimals.
 */
export function displayDecimals(asset: PairAsset): number {
  const preferred = !isNative(asset) && asset.decimals <= 6 ? 2 : 4;
  return Math.min(preferred, asset.decimals);
}

export function toBig(v: string | bigint | number): bigint {
  return typeof v === "bigint" ? v : BigInt(v);
}

export function amount(asset: PairAsset, raw: bigint | string | number): Amount {
  return { asset, raw: toBig(raw).toString() };
}

export function zero(asset: PairAsset): Amount {
  return { asset, raw: "0" };
}

export function addAmounts(a: Amount, b: Amount): Amount {
  if (!sameAsset(a.asset, b.asset)) {
    throw new Error(`cannot add ${a.asset.address} and ${b.asset.address}`);
  }
  return amount(a.asset, toBig(a.raw) + toBig(b.raw));
}

/** Sums amounts per asset, keeping first-seen order. */
export function sumByAsset(amounts: Amount[]): Amount[] {
  const out: Amount[] = [];
  for (const a of amounts) {
    const i = out.findIndex((o) => sameAsset(o.asset, a.asset));
    if (i === -1) out.push({ ...a });
    else out[i] = addAmounts(out[i]!, a);
  }
  return out;
}

/** Parses a human decimal string ("212.40") into base units. Truncates extra digits. */
export function parseUnitsSafe(value: string, decimals: number): bigint {
  const [whole = "0", frac = ""] = value.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

/**
 * Formats base units with grouping and fixed display decimals, rounding down so a balance is never
 * shown larger than it is. `formatRaw(212_400_000n, USDG) === "212.40"`.
 */
export function formatRaw(
  raw: bigint | string,
  asset: PairAsset,
  opts: { decimals?: number } = {},
): string {
  const value = toBig(raw);
  const decimals = asset.decimals;
  const shown = Math.min(opts.decimals ?? displayDecimals(asset), decimals);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, shown);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${wholeStr}${shown > 0 ? `.${fracStr}` : ""}`;
}

/** C0/C1 control characters, zero-width characters and bidi overrides/isolates. */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

const RESERVED_SYMBOLS = new Set(["ETH", "WETH", "USDG", "USDC", "USDT"]);

/**
 * Symbol safe to render. Known assets (ETH, USDG) use their fixed names. Other ERC-20 symbols are
 * token-controlled: control and bidi characters are stripped, length is capped, and a symbol that
 * imitates a well-known asset gets the token address appended so it cannot pass as the real one.
 */
export function displaySymbol(asset: PairAsset, chainId?: number): string {
  if (chainId !== undefined) {
    const known = knownPairAssets(chainId).find((k) => sameAsset(k, asset));
    if (known) return known.symbol;
  } else if (isNative(asset)) {
    return "ETH";
  }
  const clean = asset.symbol.replace(UNSAFE_CHARS, "").trim();
  const capped = clean.length > 12 ? `${clean.slice(0, 11)}…` : clean;
  if (!capped) return shortAddress(asset.address);
  if (chainId !== undefined && RESERVED_SYMBOLS.has(capped.toUpperCase())) {
    return `${capped} (${shortAddress(asset.address)})`;
  }
  return capped;
}

export function formatAmount(
  a: Amount,
  opts: { withUnit?: boolean; decimals?: number; chainId?: number } = {},
): string {
  const n = formatRaw(a.raw, a.asset, opts);
  return opts.withUnit === false ? n : `${n} ${displaySymbol(a.asset, opts.chainId)}`;
}

/** "0x12a4…9aF3" */
export function shortAddress(address: string, head = 4, tail = 4): string {
  if (address.length <= 2 + head + tail) return address;
  return `${address.slice(0, 2 + head)}…${address.slice(-tail)}`;
}

/** "0x8c1e…" for tx hashes in tight rows. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "18 Dec 2026", in UTC so server and client render the same string. */
export function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "14 min ago", "2h ago", "3 days ago"; falls back to a date after 30 days. */
export function formatRelative(
  unixSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const diff = Math.max(0, nowSeconds - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86_400);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  return formatDate(unixSeconds);
}

/** Whole days until `deadline` (never negative). */
export function daysLeft(deadline: number, nowSeconds = Math.floor(Date.now() / 1000)): number {
  return Math.max(0, Math.ceil((deadline - nowSeconds) / 86_400));
}

/** Two-letter monogram for tokens and avatars without images. */
export function initials(text: string | null | undefined): string {
  if (!text) return "?";
  const clean = text.replace(/^[@$]/, "").trim();
  const words = clean.split(/[\s_]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

/** X avatars: Privy returns `_normal` (48 px); swap for the 400 px variant. */
export function largeXAvatar(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/_normal(\.[a-z]+)$/i, "_400x400$1");
}
