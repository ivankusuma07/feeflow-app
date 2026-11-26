import { feeFlowAbi } from "@feeflow/abi";
import { NATIVE_ETH, type PairAsset } from "@feeflow/config";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  pad,
  type Address,
  type TransactionReceipt,
} from "viem";
import { describe, expect, it } from "vitest";
import { parseClaimed } from "./claimed";

const FEEFLOW = "0x00000000000000000000000000000000000000f1" as Address;
const TO = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const TOKEN_A = getAddress("0x00000000000000000000000000000000000000a1");
const TOKEN_B = getAddress("0x00000000000000000000000000000000000000b1");
const GME = getAddress("0x00000000000000000000000000000000000000d1");
const USDG: PairAsset = {
  address: "0x00000000000000000000000000000000000000c1",
  symbol: "USDG",
  decimals: 6,
};

function claimedLog(token: Address, asset: Address, amount: bigint, from: Address = FEEFLOW) {
  return {
    address: from,
    topics: encodeEventTopics({
      abi: feeFlowAbi,
      eventName: "Claimed",
      args: { token, xUserId: 1000000000n, to: TO },
    }),
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [asset, amount, 7n],
    ),
    blockHash: pad("0x1"),
    blockNumber: 1n,
    logIndex: 0,
    transactionHash: pad("0x2"),
    transactionIndex: 0,
    removed: false,
  };
}

const receipt = (logs: ReturnType<typeof claimedLog>[], status = "success") =>
  ({ status, logs }) as unknown as TransactionReceipt;

describe("parseClaimed", () => {
  it("groups Claimed events per token with asset metadata", () => {
    const r = parseClaimed(
      receipt([
        claimedLog(TOKEN_A, USDG.address, 212_400_000n),
        claimedLog(TOKEN_B, NATIVE_ETH.address, 84_200_000_000_000_000n),
      ]),
      FEEFLOW,
      4663,
      [USDG],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.to).toBe(TO);
    expect(r.summary.rows).toEqual([
      { token: TOKEN_A, amounts: [{ asset: USDG, raw: "212400000" }] },
      { token: TOKEN_B, amounts: [{ asset: NATIVE_ETH, raw: "84200000000000000" }] },
    ]);
    expect(r.unknownAssets).toEqual([]);
  });

  it("reports pair assets it has no metadata for", () => {
    const r = parseClaimed(receipt([claimedLog(TOKEN_A, GME, 5n * 10n ** 18n)]), FEEFLOW, 4663, []);
    expect(r.ok && r.unknownAssets).toEqual([GME]);
  });

  it("ignores look-alike events from other contracts", () => {
    const other = "0x00000000000000000000000000000000000000ee" as Address;
    expect(
      parseClaimed(receipt([claimedLog(TOKEN_A, USDG.address, 1n, other)]), FEEFLOW, 4663, [USDG]),
    ).toEqual({ ok: false, reason: "not-a-claim" });
  });

  it("reports a reverted transaction", () => {
    expect(parseClaimed(receipt([], "reverted"), FEEFLOW, 4663, [])).toEqual({
      ok: false,
      reason: "reverted",
    });
  });
});
