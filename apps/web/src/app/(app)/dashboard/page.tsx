import type { Metadata } from "next";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <main id="main" className="container-page pt-10 pb-20">
      <DashboardView />
    </main>
  );
}
