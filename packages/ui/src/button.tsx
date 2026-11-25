import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./cn";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-[var(--radius-btn)]",
    "font-semibold text-[15px] no-underline whitespace-nowrap cursor-pointer select-none",
    "transition-colors disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        /** Neon fill, black text: the one primary action per view. */
        primary:
          "bg-accent text-black border border-ink hover:bg-accent-hover hover:text-black disabled:hover:bg-accent",
        /** White with a 1 px ink border. */
        secondary: "bg-surface text-ink border border-ink hover:bg-bg disabled:hover:bg-surface",
        ghost: "bg-transparent text-ink border border-transparent hover:bg-subtle",
        /** Unavailable action that still explains itself in its label. */
        inert: "bg-disabled text-muted border border-line-strong cursor-not-allowed",
      },
      size: {
        md: "",
        sm: "min-h-9 px-3 text-sm",
        lg: "px-7",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild = false, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
});
