"use client";

import { AuthGate } from "@/components/app/auth-gate";

/** Foundations only: heading and auth gate. The bento content lands in the dashboard PR. */
export function DashboardView() {
  return (
    <AuthGate>
      {(account) => (
        <div>
          <p className="m-0 font-mono text-[13px] text-muted">
            Logged in with X as @{account.username ?? account.userId}
          </p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-tight">Dashboard</h1>
        </div>
      )}
    </AuthGate>
  );
}
