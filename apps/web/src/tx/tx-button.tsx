"use client";

import { decodeError, shortHash } from "@feeflow/sdk";
import { Button, cn } from "@feeflow/ui";
import { useReducer, useRef } from "react";
import type { Hash, TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { appChain } from "@/lib/chain";
import { env } from "@/lib/config";
import { initialTxState, isBusy, txReducer } from "./tx-machine";
import { TxLink, txToast } from "./tx-toast";

export interface TxButtonProps {
  /** Idle label, e.g. "Claim 312.40 USDG + 0.0842 ETH". */
  label: string;
  /** Pending label after the hash is known, e.g. "Claiming…". */
  pendingLabel: string;
  /** Shown when no wallet is connected, e.g. "Connect a wallet to claim". */
  noWalletLabel: string;
  /** Toast title on success, e.g. "Claimed". */
  successToast: string;
  /** Fetches whatever it needs (attestation, simulation) and sends the tx; returns its hash. */
  run: () => Promise<Hash>;
  onSuccess?: (receipt: TransactionReceipt) => void;
  /** FeeFlow writes stay disabled until a contract address is configured. Pons-only writes pass false. */
  requiresDeployment?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  block?: boolean;
  className?: string;
}

/**
 * Every contract write goes through this button. States follow the claim design:
 * no wallet · wrong network ("Switch to Robinhood Chain") · confirm in wallet · pending with
 * explorer link · decoded error with "Try again" (form state is kept by the caller).
 */
export function TxButton({
  label,
  pendingLabel,
  noWalletLabel,
  successToast,
  run,
  onSuccess,
  requiresDeployment = true,
  disabled,
  variant = "primary",
  block,
  className,
}: TxButtonProps) {
  const [state, dispatch] = useReducer(txReducer, initialTxState);
  const inFlight = useRef(false);
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const client = usePublicClient({ chainId: appChain.id });

  const notDeployed = requiresDeployment && !env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const cls = cn(block && "w-full", className);

  if (notDeployed) {
    return (
      <Button type="button" variant="inert" disabled className={cls}>
        Not deployed yet
      </Button>
    );
  }
  if (!isConnected) {
    return (
      <Button type="button" variant="inert" disabled className={cls}>
        {noWalletLabel}
      </Button>
    );
  }
  if (chainId !== appChain.id) {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled={switching}
        onClick={() => switchChain({ chainId: appChain.id })}
        className={cls}
      >
        Switch to {appChain.name}
      </Button>
    );
  }

  async function submit() {
    // Ref guard: a second click before React re-renders must not start a second tx.
    if (inFlight.current || isBusy(state)) return;
    inFlight.current = true;
    dispatch({ type: "start" });
    let hash: Hash | undefined;
    try {
      hash = await run();
      dispatch({ type: "submitted", hash });
      txToast.pending(hash, pendingLabel);
      if (!client) throw new Error("No RPC client for the app chain");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      dispatch({ type: "confirmed" });
      txToast.success(hash, successToast);
      onSuccess?.(receipt);
    } catch (err) {
      const decoded = decodeError(err);
      dispatch({ type: "failed", error: decoded });
      if (decoded.kind !== "user-rejected") txToast.error(decoded.message, hash);
    } finally {
      inFlight.current = false;
    }
  }

  switch (state.status) {
    case "confirming":
      return (
        <Button type="button" variant={variant} disabled className={cls}>
          Confirm in wallet…
        </Button>
      );
    case "pending":
      return (
        <Button type="button" variant="secondary" disabled className={cls} aria-live="polite">
          <span className="font-mono">{shortHash(state.hash)}</span>
          {pendingLabel}
        </Button>
      );
    case "error":
      return (
        <div className={cn("flex flex-col gap-2", block && "w-full")} role="alert">
          <p className="m-0 text-sm text-error">
            {state.error.message}
            {state.hash ? (
              <>
                {" "}
                <TxLink hash={state.hash} />
              </>
            ) : null}
          </p>
          <Button type="button" variant="secondary" onClick={() => void submit()} className={cls}>
            Try again
          </Button>
        </div>
      );
    default:
      return (
        <Button
          type="button"
          variant={variant}
          disabled={disabled}
          onClick={() => void submit()}
          className={cls}
        >
          {label}
        </Button>
      );
  }
}
