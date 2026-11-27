import { ponsLaunchAbi } from "@feeflow/abi";
import { encodeAbiParameters, encodeEventTopics, getAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  launchedFromLogs,
  launchParams,
  newSalt,
  parseBuy,
  parseTaxBps,
  routeHref,
  socialOk,
  validateDraft,
  type LaunchDraft,
} from "./launch-form";

const draft = (over: Partial<LaunchDraft> = {}): LaunchDraft => ({
  name: " Ledger Cat ",
  symbol: "lcat",
  description: "",
  logo: null,
  twitter: "",
  telegram: "",
  website: "",
  taxPct: "",
  buy: "",
  ...over,
});
const FACTORY = getAddress("0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e");
const TOKEN = getAddress("0x00000000000000000000000000000000000000aa");
const CURVE = getAddress("0x00000000000000000000000000000000000000bb");

describe("launch draft", () => {
  it("parses the added tax in percent, within Pons' maximum", () => {
    expect(parseTaxBps("")).toBe(0);
    expect(parseTaxBps("1.5")).toBe(150);
    expect(parseTaxBps("10")).toBe(1000);
    expect(parseTaxBps("10.01")).toBeNull();
    expect(parseTaxBps("1.555")).toBeNull();
    expect(parseTaxBps("-1")).toBeNull();
  });

  it("parses the initial buy in the pair's decimals", () => {
    expect(parseBuy("", 18)).toBe(0n);
    expect(parseBuy("0.05", 18)).toBe(5n * 10n ** 16n);
    expect(parseBuy("1.5", 6)).toBe(1_500_000n);
    expect(parseBuy("1.0000001", 6)).toBeNull();
    expect(parseBuy("abc", 18)).toBeNull();
  });

  it("accepts only https social links", () => {
    expect(socialOk("")).toBe(true);
    expect(socialOk("https://x.com/example")).toBe(true);
    expect(socialOk("http://example.com")).toBe(false);
    expect(socialOk("javascript:alert(1)")).toBe(false);
    expect(socialOk(`https://e.com/${"a".repeat(300)}`)).toBe(false);
  });

  it("validates Pons' metadata limits", () => {
    expect(validateDraft(draft(), { pairDecimals: 18 })).toEqual({});
    const e = validateDraft(
      draft({
        name: "x".repeat(65),
        symbol: "TOO-LONG",
        description: "é".repeat(1025),
        website: "ftp://x",
        taxPct: "11",
        buy: "1..2",
      }),
      { pairDecimals: 18 },
    );
    expect(Object.keys(e).sort()).toEqual([
      "buy",
      "description",
      "name",
      "socials",
      "symbol",
      "taxPct",
    ]);
    expect(validateDraft(draft({ name: " ", symbol: "" }), { pairDecimals: 18 })).toMatchObject({
      name: "Enter a name.",
      symbol: "Enter a ticker.",
    });
  });

  it("builds launchToken params: wallet as recipient, no buybacks, no economics check", () => {
    const salt = newSalt((b) => b.fill(7));
    const p = launchParams(draft({ taxPct: "2", logo: "ipfs://bafk" }), salt);
    expect(p).toMatchObject({
      name: "Ledger Cat",
      symbol: "LCAT",
      logo: "ipfs://bafk",
      creatorFeeRecipient: zeroAddress,
      creatorTaxBps: 200,
      buybackEnabled: false,
      salt,
    });
    expect(BigInt(p.expectedEconomics)).toBe(0n);
    expect(salt).toBe(`0x${"07".repeat(32)}`);
  });

  it("reads the new token from the TokenLaunched event", () => {
    const topics = encodeEventTopics({
      abi: ponsLaunchAbi,
      eventName: "TokenLaunched",
      args: { token: TOKEN, curve: CURVE, deployer: zeroAddress },
    });
    const data = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [zeroAddress, 0n, 1n],
    );
    const log = { address: FACTORY, topics: topics as never, data };
    expect(launchedFromLogs([{ ...log, address: CURVE }, log], FACTORY)).toEqual({
      token: TOKEN,
      curve: CURVE,
    });
    expect(launchedFromLogs([], FACTORY)).toBeNull();
  });

  it("links to /route with the token and handle", () => {
    expect(routeHref(TOKEN, "example_one")).toBe(`/route?token=${TOKEN}&handle=example_one`);
  });
});
