import { PAIR_ASSET_DECIMALS, type PairAsset } from "@feeflow/config";
import type { Amount } from "./types";

/** Display precision per asset: USDG to cents, ETH to 4 places (as in the designs). */
export const DISPLAY_DECIMALS: Record<PairAsset, number> = { USDG: 2, ETH: 4 };

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
  if (a.asset !== b.asset) throw new Error(`cannot add ${a.asset} and ${b.asset}`);
  return amount(a.asset, toBig(a.raw) + toBig(b.raw));
}

/** Parses a human decimal string ("212.40") into base units. Truncates extra digits. */
export function parseUnitsSafe(value: string, asset: PairAsset): bigint {
  const decimals = PAIR_ASSET_DECIMALS[asset];
  const [whole = "0", frac = ""] = value.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

/**
 * Formats base units with grouping and fixed display decimals, rounding down so a balance is never
 * shown larger than it is. `formatRaw(212_400_000n, "USDG") === "212.40"`.
 */
export function formatRaw(
  raw: bigint | string,
  asset: PairAsset,
  opts: { decimals?: number } = {},
): string {
  const value = toBig(raw);
  const decimals = PAIR_ASSET_DECIMALS[asset];
  const shown = opts.decimals ?? DISPLAY_DECIMALS[asset];
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, shown);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${wholeStr}${shown > 0 ? `.${fracStr}` : ""}`;
}

export function formatAmount(
  a: Amount,
  opts: { withUnit?: boolean; decimals?: number } = {},
): string {
  const n = formatRaw(a.raw, a.asset, opts);
  return opts.withUnit === false ? n : `${n} ${a.asset}`;
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
