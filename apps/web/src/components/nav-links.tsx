"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@feeflow/ui";

interface NavItem {
  href: string;
  label: string;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Centred nav links; the current page gets a neon pill with black text. */
export function NavLinks({
  items,
  className,
  onNavigate,
}: {
  items: readonly NavItem[];
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-2 no-underline",
              active
                ? "border-ink bg-accent font-semibold text-black hover:text-black"
                : "border-transparent text-muted hover:text-ink",
              className,
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
