"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@feeflow/ui";
import { NavLinks } from "./nav-links";

interface NavItem {
  href: string;
  label: string;
}

export function MobileMenu({
  items,
  xUrl,
}: {
  items: readonly NavItem[];
  xUrl?: string | undefined;
}) {
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
          className="absolute inset-x-0 top-full border-b border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
        >
          <nav aria-label="Mobile" className="container-page flex flex-col gap-1 py-4 md:hidden">
            <NavLinks items={items} className="text-base" onNavigate={() => setOpen(false)} />
            {xUrl && (
              <a
                href={xUrl}
                target="_blank"
                rel="noopener"
                className="px-3 py-2 text-muted no-underline"
              >
                FeeFlow on X
              </a>
            )}
          </nav>
          <div className="container-page flex flex-wrap gap-2.5 pb-5 md:pt-4">
            <Button asChild variant="secondary" className="flex-1">
              <Link href="/dashboard">Connect wallet</Link>
            </Button>
            <Button asChild className="flex-1">
              <Link href="/dashboard">Open app</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
