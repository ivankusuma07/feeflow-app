import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Marketing and legal pages: static header actions, no auth or wallet JavaScript. */
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
