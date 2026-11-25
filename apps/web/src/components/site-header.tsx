import Link from "next/link";
import { Wordmark } from "@feeflow/ui";
import { links } from "@/lib/config";
import { HeaderActions } from "./header-actions";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";
import { XIcon } from "./x-icon";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/payments", label: "Payments" },
  { href: "/docs", label: "Docs" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="container-page flex min-h-16 items-center gap-5">
        <Link href="/" className="no-underline" aria-label="FeeFlow home">
          <Wordmark height={30} />
        </Link>
        <nav aria-label="Main" className="hidden flex-1 justify-center gap-2 text-[15px] md:flex">
          <NavLinks items={NAV_ITEMS} />
        </nav>
        <div className="ml-auto flex items-center gap-2.5 md:ml-0">
          {links.x && (
            <a
              href={links.x}
              aria-label="FeeFlow on X"
              rel="noopener"
              target="_blank"
              className="hidden size-10 flex-none items-center justify-center rounded-full border border-line sm:inline-flex"
            >
              <XIcon size={16} />
            </a>
          )}
          <div className="hidden gap-2.5 lg:flex">
            <HeaderActions />
          </div>
          <MobileMenu items={NAV_ITEMS} xUrl={links.x} />
        </div>
      </div>
    </header>
  );
}
