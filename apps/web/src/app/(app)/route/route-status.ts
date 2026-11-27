import { isAddressEqual, zeroAddress, type Address } from "viem";

/** Pons `getLaunchedToken` fields the route flow needs. */
export interface LaunchedTokenView {
  exists: boolean;
  deployer: Address;
  creatorFeeRecipient: Address;
  pairToken: Address;
}

/** FeeFlow `tokens(token)` fields; null when the contract is not deployed. */
export interface FeeFlowTokenView {
  sink: Address;
  xUserId: bigint;
  exited: boolean;
}

/** Pons `pendingCreatorFeeRecipient(token)`: a protocol-owner override; zero `newRecipient` = none. */
export interface PendingOverrideView {
  newRecipient: Address;
  effectiveAt: bigint;
  expiresAt: bigint;
}

export type RouteStatus =
  /** Not a Pons v2 token. */
  | { kind: "not-pons" }
  /** Routed and Pons already pays the sink: nothing to do. */
  | { kind: "routed"; sink: Address; xUserId: bigint }
  /** Future fees were moved out of FeeFlow; a token can be registered only once. */
  | { kind: "exited" }
  /** Registered with FeeFlow; this wallet still has to point Pons at the sink (step 5). */
  | { kind: "needs-transfer"; sink: Address; xUserId: bigint }
  /** Registered, but the Pons recipient is someone else: only they can finish. */
  | { kind: "registered-other"; xUserId: bigint }
  /** This wallet is the Pons recipient: full flow (sign, register, transfer). */
  | { kind: "ready"; transferNeeded: true }
  /** Launched with the predicted sink as recipient by this wallet: register only. */
  | { kind: "ready"; transferNeeded: false }
  /** Someone else receives this token's creator fees. */
  | { kind: "not-recipient" }
  /** No wallet connected yet. */
  | { kind: "no-wallet" }
  /**
   * The Pons owner proposed a new creator fee recipient. Once it matures it replaces the sink, so
   * routing now would move fees into FeeFlow only until then.
   */
  | { kind: "pons-override"; to: Address; effectiveAt: number };

/** A proposal still inside its execution window; past `expiresAt` it can no longer execute. */
export function liveOverride(
  p: PendingOverrideView | null | undefined,
  now: number,
): { to: Address; effectiveAt: number } | null {
  if (!p || isAddressEqual(p.newRecipient, zeroAddress)) return null;
  if (Number(p.expiresAt) < now) return null;
  return { to: p.newRecipient, effectiveAt: Number(p.effectiveAt) };
}

export function routeStatus(
  lt: LaunchedTokenView,
  info: FeeFlowTokenView | null,
  predictedSink: Address | null,
  wallet: Address | undefined,
  pending: PendingOverrideView | null = null,
  now: number = Math.floor(Date.now() / 1000),
): RouteStatus {
  const s = baseStatus(lt, info, predictedSink, wallet);
  // Refuse only where this wallet could act next; other states already explain themselves.
  if (s.kind === "ready" || s.kind === "needs-transfer") {
    const o = liveOverride(pending, now);
    if (o) return { kind: "pons-override", ...o };
  }
  return s;
}

function baseStatus(
  lt: LaunchedTokenView,
  info: FeeFlowTokenView | null,
  predictedSink: Address | null,
  wallet: Address | undefined,
): RouteStatus {
  if (!lt.exists) return { kind: "not-pons" };
  const registered = info !== null && !isAddressEqual(info.sink, zeroAddress);

  if (registered) {
    if (info.exited) return { kind: "exited" };
    if (isAddressEqual(lt.creatorFeeRecipient, info.sink)) {
      return { kind: "routed", sink: info.sink, xUserId: info.xUserId };
    }
    if (wallet && isAddressEqual(lt.creatorFeeRecipient, wallet)) {
      return { kind: "needs-transfer", sink: info.sink, xUserId: info.xUserId };
    }
    return { kind: "registered-other", xUserId: info.xUserId };
  }

  if (!wallet) return { kind: "no-wallet" };
  if (isAddressEqual(lt.creatorFeeRecipient, wallet))
    return { kind: "ready", transferNeeded: true };
  if (
    predictedSink &&
    isAddressEqual(lt.creatorFeeRecipient, predictedSink) &&
    isAddressEqual(lt.deployer, wallet)
  ) {
    return { kind: "ready", transferNeeded: false };
  }
  return { kind: "not-recipient" };
}
