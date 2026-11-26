"use client";

import { Button } from "@feeflow/ui";
import type { ReactNode } from "react";
import { useAuth, type XAccount } from "@/auth/auth-context";
import { EmptyState, Skeleton } from "./states";

/**
 * Renders `children(xAccount)` once the user is logged in with X. Shows skeletons while Privy
 * restores the session and a login prompt otherwise. Never renders another account's data.
 */
export function AuthGate({ children }: { children: (account: XAccount) => ReactNode }) {
  const auth = useAuth();

  if (!auth.ready) {
    return (
      <div aria-busy="true" className="mt-7 grid gap-5">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!auth.xAccount) {
    return (
      <EmptyState
        className="mt-7"
        illustration
        title="Log in with X"
        action={
          auth.enabled ? (
            <Button type="button" onClick={auth.login}>
              Log in with X
            </Button>
          ) : (
            <Button type="button" variant="inert" disabled>
              Login is not configured in this build
            </Button>
          )
        }
      />
    );
  }

  return <>{children(auth.xAccount)}</>;
}
