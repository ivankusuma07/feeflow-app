import Link from "next/link";
import { Card, Note } from "@feeflow/ui";
import { termsSummary } from "@/content/copy";

/** Placeholder for /terms and /privacy until the documents are drafted. */
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <main id="main" className="container-page max-w-[860px] pt-10 pb-20">
      <h1 className="section-title">{title}</h1>
      <Note tone="warn" className="mt-6 text-sm">
        <strong>Draft in progress.</strong> This page will hold the full {title}. Until then, the
        summary below and the <Link href="/disclosures">disclosures</Link> apply.
      </Note>
      <Card className="mt-6">
        <h2 className="m-0 text-lg font-semibold">Terms and privacy</h2>
        <p className="mt-3 leading-relaxed text-body">{termsSummary}</p>
      </Card>
    </main>
  );
}
