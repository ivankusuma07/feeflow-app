"use client";

import { shortAddress } from "@feeflow/sdk";
import { Button, cn } from "@feeflow/ui";
import { useAccount } from "wagmi";
import { useAuth } from "@/auth/auth-context";
import { Avatar } from "./avatar";
import { Skeleton } from "./states";

const chip = "inline-flex min-h-10 items-center gap-2 rounded-full border border-line text-sm";

/**
 * Header actions on app routes (dashboard design): X account chip and wallet chip when logged in;
 * "Connect wallet" and "Log in with X" otherwise. The X chip opens a small menu with "Log out".
 */
export function AppHeaderActions() {
  const auth = useAuth();
  const { address } = useAccount();

  if (!auth.ready) {
    return (
      <span className="flex gap-2.5" aria-hidden>
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </span>
    );
  }

  if (!auth.enabled) {
    return (
      <Button type="button" variant="inert" disabled title="Login is not configured in this build">
        Log in with X
      </Button>
    );
  }

  const wallet = address ?? auth.wallets[0]?.address;

  const walletPart = wallet ? (
    <span className={cn(chip, "px-3 font-mono text-[13px]")} title={wallet}>
      {shortAddress(wallet)}
    </span>
  ) : (
    <Button type="button" variant="secondary" onClick={auth.connectWallet}>
      Connect wallet
    </Button>
  );

  // Logged out: secondary first, primary last (as on the landing page).
  if (!auth.xAccount) {
    return (
      <>
        {walletPart}
        <Button type="button" onClick={auth.login}>
          Log in with X
        </Button>
      </>
    );
  }

  return (
    <>
      <details className="relative">
        <summary
          className={cn(
            chip,
            "cursor-pointer list-none py-0 pr-3 pl-1 [&::-webkit-details-marker]:hidden",
          )}
        >
          <Avatar src={auth.xAccount.avatarUrl} label={auth.xAccount.username} />
          <span className="font-mono">@{auth.xAccount.username ?? auth.xAccount.userId}</span>
        </summary>
        <div className="absolute right-0 z-50 mt-2 min-w-40 rounded-[12px] border border-line bg-surface p-1.5">
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-subtle"
            onClick={() => void auth.logout()}
          >
            Log out
          </button>
        </div>
      </details>
      {walletPart}
    </>
  );
}
