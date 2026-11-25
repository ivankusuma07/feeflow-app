"use client";

import { cn } from "./cn";

interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
  className?: string;
}

/** Pill toggle group (period / asset filters). Selected option is a neon pill. */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<V>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex rounded-full border border-line bg-surface p-[3px]", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-[38px] cursor-pointer rounded-full border px-4 text-sm",
              on
                ? "border-ink bg-accent font-semibold text-black"
                : "border-transparent bg-transparent text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
