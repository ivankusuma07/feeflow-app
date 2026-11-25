import { cn } from "./cn";

interface BarProps {
  /** 0..1. Values outside the range are clamped. */
  value: number | null;
  label: string;
  className?: string;
  /** "card" bars are 8 px with an outlined track; "row" bars are thinner leaderboard bars. */
  variant?: "card" | "row" | "empty";
}

/**
 * Neon fill with a 1 px ink outline on a light track, so the bar meets 3 : 1
 * against its surroundings. `value: null` renders an empty placeholder track.
 */
export function ProgressBar({ value, label, className, variant = "card" }: BarProps) {
  if (value === null || variant === "empty") {
    return <div aria-hidden="true" className={cn("h-1.5 rounded-[3px] bg-line", className)} />;
  }
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  if (variant === "row") {
    return (
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={cn("h-2 overflow-hidden rounded-[4px] bg-track", className)}
      >
        <span
          className="block h-full rounded-[4px] border border-ink bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-2 overflow-hidden rounded-[4px] border border-ink bg-line", className)}
    >
      <div
        className={cn("h-full bg-accent", pct > 0 && pct < 100 && "border-r border-ink")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
