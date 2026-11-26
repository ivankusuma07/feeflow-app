import Link from "next/link";
import { Button } from "@feeflow/ui";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page max-w-[640px] pt-24 pb-20 text-center">
        <h1 className="section-title">Page not found</h1>
        <p className="mt-3 text-muted">This page does not exist.</p>
        <Button asChild className="mt-8">
          <Link href="/">Back to home</Link>
        </Button>
      </main>
      <SiteFooter />
    </>
  );
}
