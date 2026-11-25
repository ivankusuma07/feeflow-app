import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full whitespace-nowrap px-2 py-[3px] text-xs",
  {
    variants: {
      tone: {
        accent: "bg-accent border border-ink text-black",
        outline: "border border-ink",
        quiet: "border border-line text-ink",
        muted: "border border-line text-muted",
      },
      size: {
        sm: "",
        md: "px-2.5 py-1 text-[13px] font-semibold",
      },
    },
    defaultVariants: { tone: "outline", size: "sm" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/** Small neon dot with a 1 px black ring, for "LIVE" and healthy keeper status. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 rounded-full border border-ink bg-accent", className)}
    />
  );
}

export function LiveLabel({ children = "LIVE" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
      <LiveDot />
      {children}
    </span>
  );
}
