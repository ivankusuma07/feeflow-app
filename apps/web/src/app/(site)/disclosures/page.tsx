import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@feeflow/ui";
import { disclosuresFull } from "@/content/copy";

export const metadata: Metadata = {
  title: "Disclosures",
  description: "Risks, trust assumptions and fixed rules of FeeFlow.",
};

export default function DisclosuresPage() {
  return (
    <main id="main" className="container-page max-w-[860px] pt-10 pb-20">
      <h1 className="section-title">Disclosures</h1>
      <p className="mt-3 max-w-[640px] leading-normal text-muted">
        Read these before routing a token or claiming fees. The{" "}
        <Link href="/docs#trust">trust assumptions</Link> explain who can do what.
      </p>
      <Card className="mt-8">
        <ul className="m-0 flex flex-col gap-3 pl-5 leading-relaxed text-body">
          {disclosuresFull.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
