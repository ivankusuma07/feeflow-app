import { feeFlowAbi } from "@feeflow/abi";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { decodeError } from "./errors";
import {
  daysLeft,
  formatDate,
  formatRaw,
  formatRelative,
  initials,
  largeXAvatar,
  parseUnitsSafe,
  shortAddress,
} from "./format";

describe("format", () => {
  it("formats USDG to cents and ETH to 4 places, rounding down", () => {
    expect(formatRaw(212_400_000n, "USDG")).toBe("212.40");
    expect(formatRaw(2_480_000_000n, "USDG")).toBe("2,480.00");
    expect(formatRaw(84_299_999_999_999_999n, "ETH")).toBe("0.0842");
    expect(formatRaw("0", "ETH")).toBe("0.0000");
  });

  it("parses decimal strings to base units", () => {
    expect(parseUnitsSafe("212.4", "USDG")).toBe(212_400_000n);
    expect(parseUnitsSafe("0.0842", "ETH")).toBe(84_200_000_000_000_000n);
  });

  it("shortens addresses like the designs", () => {
    expect(shortAddress("0x12a4000000000000000000000000000000009aF3")).toBe("0x12a4…9aF3");
  });

  it("formats dates in UTC and relative times", () => {
    expect(formatDate(1_797_552_000)).toBe("18 Dec 2026");
    const now = 1_800_000_000;
    expect(formatRelative(now - 14 * 60, now)).toBe("14 min ago");
    expect(formatRelative(now - 2 * 3600, now)).toBe("2h ago");
    expect(formatRelative(now - 3 * 86_400, now)).toBe("3 days ago");
    expect(daysLeft(now + 23 * 86_400 - 5, now)).toBe(23);
  });

  it("builds initials and large avatars", () => {
    expect(initials("Example Token A")).toBe("ET");
    expect(initials("@example_one")).toBe("EO");
    expect(largeXAvatar("https://pbs.twimg.com/profile_images/1/abc_normal.jpg")).toBe(
      "https://pbs.twimg.com/profile_images/1/abc_400x400.jpg",
    );
  });
});

describe("decodeError", () => {
  it("detects user rejection", () => {
    const err = new BaseError("User rejected the request.");
    expect(decodeError(err).kind).toBe("user-rejected");
  });

  it("decodes FeeFlow custom errors from revert data", () => {
    const data = encodeErrorResult({ abi: feeFlowAbi, errorName: "AttestationExpired" });
    const err = new ContractFunctionRevertedError({ abi: feeFlowAbi, data, functionName: "claim" });
    const d = decodeError(err);
    expect(d.kind).toBe("attestation-expired");
    expect(d.message).toBe("Attestation expired. Your form is kept.");
  });

  it("decodes nothing to claim", () => {
    const data = encodeErrorResult({ abi: feeFlowAbi, errorName: "NothingToClaim" });
    expect(decodeError({ cause: { data } }).kind).toBe("nothing-to-claim");
  });

  it("detects insufficient gas", () => {
    expect(decodeError(new Error("insufficient funds for gas * price + value")).kind).toBe(
      "insufficient-gas",
    );
  });

  it("falls back to unknown", () => {
    expect(decodeError(new Error("boom")).kind).toBe("unknown");
  });
});

describe("decodeError (Pons)", () => {
  it("decodes the sweep floor error seen on the mainnet fork", () => {
    expect(decodeError({ cause: { data: "0x4e7e2916" } }).errorName).toBe("BelowFloor");
  });
});
