"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { XIcon } from "../x-icon";
import { SideNav } from "./side-nav";
import { TokenSearch } from "./token-search";

/** Below lg: the sidebar becomes a panel opened from the top bar. */
export function MobileNav({ xUrl, actions }: { xUrl?: string | undefined; actions: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const id = useId();

  // Close on route change (adjusting state during render, not in an effect) and on Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface"
      >
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
      </button>
      {open && (
        <div
          id={id}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-64px)] overflow-y-auto border-b border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
        >
          <div className="px-4 pt-4 sm:px-6 md:hidden">
            <TokenSearch />
          </div>
          <nav aria-label="Mobile" className="px-4 py-4 sm:px-6">
            <SideNav onNavigate={() => setOpen(false)} />
            {xUrl && (
              <a
                href={xUrl}
                target="_blank"
                rel="noopener"
                className="mt-1 flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] text-muted no-underline"
              >
                <XIcon size={16} />
                FeeFlow on X
              </a>
            )}
          </nav>
          <div className="flex flex-wrap gap-2.5 px-4 pb-5 sm:hidden sm:px-6 [&>*]:flex-1">
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}
