import * as React from "react";
import { cn } from "./cn";

interface NoteProps extends React.HTMLAttributes<HTMLDivElement> {
  /** "warn" is muted amber, "error" muted red, "info" the page background. Never neon. */
  tone?: "warn" | "error" | "info";
  icon?: boolean;
}

const tones = {
  warn: "bg-warn-bg border border-warn-line",
  error: "bg-error-bg border border-error/40 text-error",
  info: "bg-bg",
} as const;

export function Note({
  tone = "info",
  icon = tone === "warn",
  className,
  children,
  ...props
}: NoteProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-[10px] px-3.5 py-3 text-[13px] leading-normal",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon && (
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6B4A0E"
          strokeWidth="2"
          className="mt-px flex-none"
        >
          <path d="M12 3l10 18H2zM12 10v5M12 18v.5" />
        </svg>
      )}
      <div>{children}</div>
    </div>
  );
}
