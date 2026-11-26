import type { DecodedError } from "@feeflow/sdk";
import type { Hash } from "viem";

/**
 * Write lifecycle (brief Stage 2): idle → confirm in wallet → pending (explorer link) →
 * success | decoded error. Pure so every transition is unit-tested.
 */
export type TxState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "pending"; hash: Hash }
  | { status: "success"; hash: Hash }
  | { status: "error"; error: DecodedError; hash?: Hash };

export type TxAction =
  | { type: "start" }
  | { type: "submitted"; hash: Hash }
  | { type: "confirmed" }
  | { type: "failed"; error: DecodedError }
  | { type: "reset" };

export const initialTxState: TxState = { status: "idle" };

/** True while a write is in flight; a second submit is ignored (double-submit blocked). */
export function isBusy(state: TxState): boolean {
  return state.status === "confirming" || state.status === "pending";
}

export function txReducer(state: TxState, action: TxAction): TxState {
  switch (action.type) {
    case "start":
      return isBusy(state) ? state : { status: "confirming" };
    case "submitted":
      return state.status === "confirming" ? { status: "pending", hash: action.hash } : state;
    case "confirmed":
      return state.status === "pending" ? { status: "success", hash: state.hash } : state;
    case "failed":
      if (!isBusy(state)) return state;
      return state.status === "pending"
        ? { status: "error", error: action.error, hash: state.hash }
        : { status: "error", error: action.error };
    case "reset":
      return isBusy(state) ? state : initialTxState;
  }
}
