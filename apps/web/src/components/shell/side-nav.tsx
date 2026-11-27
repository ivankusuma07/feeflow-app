"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@feeflow/ui";
import { isActive, NAV_ITEMS } from "./nav-items";

/**
 * The sidebar links. The current page gets a neon fill with black text; `compact` shows icons
 * only (the label stays as the accessible name and a tooltip).
 */
export function SideNav({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={compact ? label : undefined}
              title={compact ? label : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] no-underline transition-colors",
                compact && "justify-center px-0",
                active
                  ? "bg-accent font-semibold text-black hover:text-black"
                  : "text-muted hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon size={19} aria-hidden className="flex-none" />
              {!compact && <span>{label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
