"use client";

import { Toaster as Sonner, toast } from "sonner";

/** App-wide toast host, restyled to FeeFlow cards. Status colours stay muted; never neon. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "!bg-surface !text-ink !border !border-line !rounded-[12px] !shadow-none !font-sans",
          description: "!text-muted",
          actionButton: "!bg-accent !text-black !border !border-ink",
          error: "!border-error/40",
        },
      }}
    />
  );
}

export { toast };
