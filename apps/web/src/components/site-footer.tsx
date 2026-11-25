import Link from "next/link";
import { Wordmark } from "@feeflow/ui";
import { footerNote } from "@/content/copy";
import { contractLabel, links } from "@/lib/config";

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:\/\//.test(href);
  return external ? (
    <a href={href} target="_blank" rel="noopener">
      {children}
    </a>
  ) : (
    <Link href={href}>{children}</Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-line bg-surface">
      <div className="container-page flex flex-wrap justify-between gap-8 py-10">
        <div className="max-w-[360px]">
          <Wordmark height={26} />
          <p className="mt-3 text-sm leading-normal text-muted">
            Creator fees, routed to X accounts. Built on Robinhood Chain.
          </p>
          <p className="mt-3 font-mono text-[13px] break-all text-muted">
            Contract: {contractLabel}
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap content-start gap-5 text-sm">
          {links.x && <FooterLink href={links.x}>X</FooterLink>}
          <FooterLink href={links.docs}>Docs</FooterLink>
          {links.telegram && <FooterLink href={links.telegram}>Telegram</FooterLink>}
          <FooterLink href={links.terms}>Terms</FooterLink>
          <FooterLink href={links.privacy}>Privacy</FooterLink>
          <FooterLink href="/disclosures">Disclosures</FooterLink>
        </nav>
      </div>
      <div className="container-page border-t border-line pt-4 pb-8 text-[13px] text-muted">
        {footerNote}
      </div>
    </footer>
  );
}
