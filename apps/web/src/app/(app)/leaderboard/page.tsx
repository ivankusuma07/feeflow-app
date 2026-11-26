import type { Metadata } from "next";
import { LeaderboardView } from "./leaderboard-view";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <main id="main" className="container-page pt-10 pb-20">
      <LeaderboardView />
    </main>
  );
}
