import Link from "next/link";
import { Button } from "@feeflow/ui";

/**
 * Logged-out header actions. Stage 2 swaps this for the auth-aware version
 * (X account chip + wallet chip when connected).
 */
export function HeaderActions() {
  return (
    <>
      <Button asChild variant="secondary">
        <Link href="/dashboard">Connect wallet</Link>
      </Button>
      <Button asChild>
        <Link href="/dashboard">Open app</Link>
      </Button>
    </>
  );
}
