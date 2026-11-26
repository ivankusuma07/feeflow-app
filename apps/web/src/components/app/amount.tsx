import { formatAmount, formatRaw, type Amount as AmountValue } from "@feeflow/sdk";
import { cn } from "@feeflow/ui";
import { APP_CHAIN_ID } from "@/lib/chain";

interface AmountProps {
  value: AmountValue | null | undefined;
  /** Show the asset symbol after the number (default true). */
  unit?: boolean;
  /** Prefix "+" for credits in activity rows. */
  signed?: boolean;
  className?: string;
}

/**
 * Monospace amount, rounded down to display precision, with the full precision in `title`.
 * `null` renders "—" (no data yet); it never renders a sample figure.
 */
export function Amount({ value, unit = true, signed, className }: AmountProps) {
  if (!value) return <span className={cn("font-mono", className)}>—</span>;
  const text = formatAmount(value, { withUnit: unit, chainId: APP_CHAIN_ID });
  const full = formatRaw(value.raw, value.asset, { decimals: value.asset.decimals });
  return (
    <span className={cn("font-mono", className)} title={`${full} ${value.asset.symbol}`}>
      {signed && BigInt(value.raw) > 0n ? "+" : ""}
      {text}
    </span>
  );
}
