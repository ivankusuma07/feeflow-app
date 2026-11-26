import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { TokenView } from "./token-view";

export const metadata: Metadata = { title: "Token" };

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  return (
    <main id="main" className="container-page pt-10 pb-20">
      <TokenView address={getAddress(address)} />
    </main>
  );
}
