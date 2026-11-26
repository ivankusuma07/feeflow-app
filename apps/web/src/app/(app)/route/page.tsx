import type { Metadata } from "next";
import { RouteView } from "./route-view";

export const metadata: Metadata = { title: "Route a token" };

export default function RoutePage() {
  return (
    <main id="main" className="container-page pt-10 pb-20">
      <RouteView />
    </main>
  );
}
