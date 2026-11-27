import { getAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  routeStatus,
  type FeeFlowTokenView,
  type LaunchedTokenView,
  type PendingOverrideView,
} from "./route-status";

const ME = getAddress("0x00000000000000000000000000000000000000a1");
const OTHER = getAddress("0x00000000000000000000000000000000000000b2");
const SINK = getAddress("0x00000000000000000000000000000000000000c3");

const lt = (over: Partial<LaunchedTokenView> = {}): LaunchedTokenView => ({
  exists: true,
  deployer: ME,
  creatorFeeRecipient: ME,
  pairToken: zeroAddress,
  ...over,
});
const unregistered: FeeFlowTokenView = { sink: zeroAddress, xUserId: 0n, exited: false };
const registered = (over: Partial<FeeFlowTokenView> = {}): FeeFlowTokenView => ({
  sink: SINK,
  xUserId: 42n,
  exited: false,
  ...over,
});

describe("routeStatus", () => {
  it("rejects tokens Pons did not launch", () => {
    expect(routeStatus(lt({ exists: false }), null, null, ME)).toEqual({ kind: "not-pons" });
  });

  it("runs the full flow for the current recipient", () => {
    expect(routeStatus(lt(), unregistered, SINK, ME)).toEqual({
      kind: "ready",
      transferNeeded: true,
    });
    // Before deployment there is no FeeFlow state yet; the Pons check alone still applies.
    expect(routeStatus(lt(), null, null, ME)).toEqual({ kind: "ready", transferNeeded: true });
  });

  it("skips the Pons transfer when the token launched with the predicted sink", () => {
    expect(routeStatus(lt({ creatorFeeRecipient: SINK }), unregistered, SINK, ME)).toEqual({
      kind: "ready",
      transferNeeded: false,
    });
    // ...but only for the deployer.
    expect(
      routeStatus(lt({ creatorFeeRecipient: SINK, deployer: OTHER }), unregistered, SINK, ME),
    ).toEqual({ kind: "not-recipient" });
  });

  it("blocks wallets that don't receive the fees, and asks for a wallet first", () => {
    expect(routeStatus(lt({ creatorFeeRecipient: OTHER }), unregistered, SINK, ME)).toEqual({
      kind: "not-recipient",
    });
    expect(routeStatus(lt(), unregistered, SINK, undefined)).toEqual({ kind: "no-wallet" });
  });

  it("resumes at the Pons transfer after registering", () => {
    expect(routeStatus(lt(), registered(), SINK, ME)).toEqual({
      kind: "needs-transfer",
      sink: SINK,
      xUserId: 42n,
    });
    expect(routeStatus(lt(), registered(), SINK, OTHER)).toEqual({
      kind: "registered-other",
      xUserId: 42n,
    });
  });

  it("recognises routed and exited tokens", () => {
    expect(routeStatus(lt({ creatorFeeRecipient: SINK }), registered(), SINK, undefined)).toEqual({
      kind: "routed",
      sink: SINK,
      xUserId: 42n,
    });
    expect(routeStatus(lt(), registered({ exited: true }), SINK, ME)).toEqual({ kind: "exited" });
  });

  describe("with a pending Pons owner override", () => {
    const NOW = 1_800_000_000;
    const pending: PendingOverrideView = {
      newRecipient: OTHER,
      effectiveAt: BigInt(NOW + 3 * 86_400),
      expiresAt: BigInt(NOW + 6 * 86_400),
    };
    const refused = { kind: "pons-override", to: OTHER, effectiveAt: NOW + 3 * 86_400 };

    it("refuses to start or finish routing", () => {
      expect(routeStatus(lt(), unregistered, SINK, ME, pending, NOW)).toEqual(refused);
      expect(routeStatus(lt(), registered(), SINK, ME, pending, NOW)).toEqual(refused);
      expect(
        routeStatus(lt({ creatorFeeRecipient: SINK }), unregistered, SINK, ME, pending, NOW),
      ).toEqual(refused);
    });

    it("ignores an empty or expired proposal", () => {
      const none = { newRecipient: zeroAddress, effectiveAt: 0n, expiresAt: 0n };
      expect(routeStatus(lt(), unregistered, SINK, ME, none, NOW).kind).toBe("ready");
      expect(routeStatus(lt(), unregistered, SINK, ME, pending, NOW + 7 * 86_400).kind).toBe(
        "ready",
      );
    });

    it("keeps states this wallet cannot act on", () => {
      const routed = lt({ creatorFeeRecipient: SINK });
      expect(routeStatus(routed, registered(), SINK, ME, pending, NOW).kind).toBe("routed");
      expect(routeStatus(lt(), unregistered, SINK, undefined, pending, NOW).kind).toBe("no-wallet");
    });
  });
});
