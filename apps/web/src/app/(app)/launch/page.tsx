import type { Metadata } from "next";
import { LaunchView } from "./launch-view";

export const metadata: Metadata = {
  title: "Launch a token",
  description:
    "Launch a Pons v2 token on Robinhood Chain and route its creator fees to an X account.",
};

export default function LaunchPage() {
  return (
    <main id="main" className="container-page pt-10 pb-20">
      <LaunchView />
    </main>
  );
}
