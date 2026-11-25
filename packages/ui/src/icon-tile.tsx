import * as React from "react";
import { cn } from "./cn";

/** 40 px rounded tile holding a 20 px line icon (stroke 1.75, ink). */
export function IconTile({
  children,
  className,
  onAccent = false,
}: {
  children: React.ReactNode;
  className?: string;
  onAccent?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mb-3.5 flex size-10 items-center justify-center rounded-[10px] border border-line",
        onAccent ? "bg-surface" : "bg-bg",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Square monogram for tokens without Pons metadata images. */
export function Monogram({
  text,
  size = 44,
  className,
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-[10px] bg-subtle font-mono font-medium",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size / 3.4)) }}
    >
      {text.slice(0, 2).toUpperCase()}
    </span>
  );
}
