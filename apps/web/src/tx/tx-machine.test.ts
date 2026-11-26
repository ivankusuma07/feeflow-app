import { describe, expect, it } from "vitest";
import { initialTxState, isBusy, txReducer, type TxState } from "./tx-machine";

const HASH = `0x${"ab".repeat(32)}` as const;
const ERR = {
  kind: "unknown",
  message: "Something went wrong. Try again.",
  retryable: true,
} as const;

describe("txReducer", () => {
  it("runs idle → confirming → pending → success", () => {
    let s: TxState = initialTxState;
    s = txReducer(s, { type: "start" });
    expect(s.status).toBe("confirming");
    s = txReducer(s, { type: "submitted", hash: HASH });
    expect(s).toEqual({ status: "pending", hash: HASH });
    s = txReducer(s, { type: "confirmed" });
    expect(s).toEqual({ status: "success", hash: HASH });
  });

  it("blocks a second start while busy (double submit)", () => {
    const confirming = txReducer(initialTxState, { type: "start" });
    expect(txReducer(confirming, { type: "start" })).toBe(confirming);
    const pending = txReducer(confirming, { type: "submitted", hash: HASH });
    expect(txReducer(pending, { type: "start" })).toBe(pending);
    expect(isBusy(pending)).toBe(true);
  });

  it("keeps the hash when a pending tx fails", () => {
    const pending: TxState = { status: "pending", hash: HASH };
    expect(txReducer(pending, { type: "failed", error: ERR })).toEqual({
      status: "error",
      error: ERR,
      hash: HASH,
    });
  });

  it("allows retry from error, ignores out-of-order events", () => {
    const error: TxState = { status: "error", error: ERR };
    expect(txReducer(error, { type: "start" }).status).toBe("confirming");
    expect(txReducer(initialTxState, { type: "submitted", hash: HASH })).toBe(initialTxState);
    expect(txReducer(initialTxState, { type: "confirmed" })).toBe(initialTxState);
    expect(txReducer(initialTxState, { type: "failed", error: ERR })).toBe(initialTxState);
  });

  it("does not reset while busy", () => {
    const confirming = txReducer(initialTxState, { type: "start" });
    expect(txReducer(confirming, { type: "reset" })).toBe(confirming);
    expect(txReducer({ status: "success", hash: HASH }, { type: "reset" })).toBe(initialTxState);
  });
});
