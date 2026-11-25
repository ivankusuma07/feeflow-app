import { cn } from "./cn";
import { MARK_PATH } from "./mark-path";

interface MarkProps {
  /** Rendered height in px. The mark reads down to 24 px; use the app icon below that. */
  height?: number;
  color?: "neon" | "black";
  className?: string;
  title?: string;
}

const COLORS = { neon: "#CCFF00", black: "#000000" } as const;

/** Bare FeeFlow mark (no circle). Decorative by default. */
export function Mark({ height = 30, color = "neon", className, title }: MarkProps) {
  const width = Math.round((height * 1000) / 1155);
  return (
    <svg
      viewBox="0 0 1000 1155"
      width={width}
      height={height}
      className={cn("flex-none", className)}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      <path fill={COLORS[color]} fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/** Neon mark on a black circle: favicon and app icon only, never the navbar. */
export function AppIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <circle cx="500" cy="500" r="500" fill="#000000" />
      <path
        fill="#CCFF00"
        fillRule="evenodd"
        transform="translate(250 211.25) scale(0.5)"
        d={MARK_PATH}
      />
    </svg>
  );
}

/** Mark + "FeeFlow" wordmark in Geist semibold, vertically centred. */
export function Wordmark({ height = 30, className }: { height?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold text-ink", className)}>
      <Mark height={height} />
      <span style={{ fontSize: Math.round(height * 0.63) }}>FeeFlow</span>
    </span>
  );
}
