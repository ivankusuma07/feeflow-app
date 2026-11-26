import type { Metadata } from "next";
import { ClaimView } from "./claim-view";

export const metadata: Metadata = { title: "Claim" };

export default function ClaimPage() {
  return (
    <main id="main" className="container-page pt-10 pb-20">
      <ClaimView />
    </main>
  );
}
