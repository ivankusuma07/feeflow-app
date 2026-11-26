"use client";

import { Button, Note } from "@feeflow/ui";
import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { appChain } from "@/lib/chain";

/**
 * Wraps write areas. With a wallet on another chain it shows a note and the switch button
 * instead of the children; with no wallet or the right chain it renders the children.
 */
export function NetworkGuard({ children }: { children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === appChain.id) return <>{children}</>;
  return (
    <Note tone="warn" className="items-center justify-between">
      <span>Your wallet is on another network. FeeFlow runs on {appChain.name}.</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => switchChain({ chainId: appChain.id })}
      >
        Switch to {appChain.name}
      </Button>
    </Note>
  );
}
