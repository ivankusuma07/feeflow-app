"use client";

import { useDataSourceKind } from "@/data/context";

/** Brief Stage 2: every app page shows this while the mock data source is active (dev only). */
export function MockBanner() {
  const { data } = useDataSourceKind();
  if (!data?.live || data.value !== "mock") return null;
  return (
    <div className="bg-ink px-3 py-1.5 text-center font-mono text-xs text-white" role="status">
      MOCK DATA — DEV ONLY
    </div>
  );
}
