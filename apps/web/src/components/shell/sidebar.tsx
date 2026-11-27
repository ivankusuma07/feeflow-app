"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon, cn, Wordmark } from "@feeflow/ui";
import { XIcon } from "../x-icon";
import { SideNav } from "./side-nav";

const STORAGE_KEY = "feeflow.sidebar.compact";

/** Desktop sidebar (lg and up). Collapses to icons; the choice is remembered per browser. */
export function Sidebar({ xUrl }: { xUrl?: string | undefined }) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try {
      // Read after mount so the server and first client render match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === "1") setCompact(true);
    } catch {
      // Storage can be unavailable (private mode); the sidebar simply starts expanded.
    }
  }, []);
  const toggle = () => {
    const next = !compact;
    setCompact(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; the toggle still works for this visit.
    }
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen flex-none flex-col border-r border-line bg-surface lg:flex",
        compact ? "w-[76px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-16 items-center", compact ? "justify-center" : "px-5")}>
        <Link href="/" className="no-underline" aria-label="FeeFlow home">
          {compact ? <AppIcon size={30} /> : <Wordmark height={28} />}
        </Link>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-2">
        <SideNav compact={compact} />
      </nav>
      <div
        className={cn("flex items-center gap-2 border-t border-line p-3", compact && "flex-col")}
      >
        {xUrl && (
          <a
            href={xUrl}
            target="_blank"
            rel="noopener"
            aria-label="FeeFlow on X"
            className="inline-flex size-10 flex-none items-center justify-center rounded-full border border-line text-ink no-underline"
          >
            <XIcon size={15} />
          </a>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink",
            !compact && "ml-auto",
          )}
        >
          {compact ? (
            <ChevronsRight size={17} aria-hidden />
          ) : (
            <ChevronsLeft size={17} aria-hidden />
          )}
        </button>
      </div>
    </aside>
  );
}
