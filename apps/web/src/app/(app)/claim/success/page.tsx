import type { Metadata } from "next";
import type { Hash } from "viem";
import { SuccessView } from "./success-view";

export const metadata: Metadata = { title: "Claimed" };

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export default async function ClaimSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tx } = await searchParams;
  const hash = typeof tx === "string" && TX_HASH.test(tx) ? (tx as Hash) : null;
  return (
    <main id="main" className="mx-auto max-w-[640px] px-6 pt-16 pb-20">
      <SuccessView tx={hash} />
    </main>
  );
}
