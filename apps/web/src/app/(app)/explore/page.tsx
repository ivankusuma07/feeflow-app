import type { Metadata } from "next";
import { ExploreView } from "./explore-view";

export const metadata: Metadata = { title: "Explore tokens" };

export default function ExplorePage() {
  return (
    <main id="main" className="container-page pt-8 pb-20">
      <ExploreView />
    </main>
  );
}
