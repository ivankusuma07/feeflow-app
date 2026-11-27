import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon } from "@feeflow/ui";
import { links } from "@/lib/config";
import { HeaderActions } from "../header-actions";
import { SiteFooter } from "../site-footer";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { TokenSearch } from "./token-search";

/**
 * The layout of every page: a sidebar on the left (a menu panel below lg), a top bar with the
 * token search and the account actions, then the page and the footer.
 * `actions` defaults to the static logged-out buttons (marketing pages ship without auth JS);
 * app routes pass the auth-aware actions rendered inside `AppProviders`.
 */
export function AppShell({
  actions,
  banner,
  children,
}: {
  actions?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const headerActions = actions ?? <HeaderActions />;
  return (
    <div className="flex min-h-screen">
      <Sidebar xUrl={links.x} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-surface">
          <div className="relative flex h-16 items-center gap-3 px-4 sm:px-6">
            <Link href="/" className="no-underline lg:hidden" aria-label="FeeFlow home">
              <AppIcon size={32} />
            </Link>
            <TokenSearch className="mx-auto hidden w-full max-w-[440px] md:block" />
            <div className="ml-auto flex items-center gap-2.5 md:ml-0">
              <div className="hidden items-center gap-2.5 sm:flex">{headerActions}</div>
              <MobileNav xUrl={links.x} actions={headerActions} />
            </div>
          </div>
        </header>
        {banner}
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </div>
  );
}
