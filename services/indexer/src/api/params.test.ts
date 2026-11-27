import { describe, expect, it } from "vitest";
import { likeLiteral, parseLeaderboardQuery, parseLimit, parseTokenListQuery } from "./params";

const USDG = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

describe("parseLimit", () => {
  it("defaults, accepts 1..100 and rejects the rest", () => {
    expect(parseLimit(undefined)).toBe(10);
    expect(parseLimit("25")).toBe(25);
    for (const bad of ["0", "101", "-1", "1e2", "abc", "10.5"]) expect(parseLimit(bad)).toBeNull();
  });
});

describe("parseLeaderboardQuery", () => {
  const now = 1_000_000;
  it("maps periods to a start time and lowercases the asset", () => {
    expect(parseLeaderboardQuery({ period: "7d", asset: USDG }, now)).toEqual({
      asset: USDG.toLowerCase(),
      since: now - 7 * 86_400,
      limit: 50,
    });
    expect(parseLeaderboardQuery({ period: "all", asset: USDG, limit: "5" }, now)).toMatchObject({
      since: 0,
      limit: 5,
    });
  });
  it("rejects unknown periods, missing or malformed assets", () => {
    expect(parseLeaderboardQuery({ period: "1y", asset: USDG }, now)).toBeNull();
    expect(parseLeaderboardQuery({ period: "7d" }, now)).toBeNull();
    expect(parseLeaderboardQuery({ period: "7d", asset: "0x123" }, now)).toBeNull();
  });
});

describe("parseTokenListQuery", () => {
  it("defaults to the newest tokens, 30 per page", () => {
    expect(parseTokenListQuery({})).toEqual({
      sort: "recent",
      asset: null,
      q: null,
      limit: 30,
      offset: 0,
    });
  });

  it("ranks by amount paid only within one asset", () => {
    expect(parseTokenListQuery({ sort: "paid" })).toBeNull();
    expect(parseTokenListQuery({ sort: "paid", asset: USDG })).toMatchObject({
      sort: "paid",
      asset: USDG.toLowerCase(),
    });
  });

  it("rejects bad input and normalises search text", () => {
    expect(parseTokenListQuery({ sort: "mc" })).toBeNull();
    expect(parseTokenListQuery({ asset: "0x12" })).toBeNull();
    expect(parseTokenListQuery({ limit: "61" })).toBeNull();
    expect(parseTokenListQuery({ offset: "-1" })).toBeNull();
    expect(parseTokenListQuery({ q: "  FLOW " })?.q).toBe("flow");
    expect(parseTokenListQuery({ q: "   " })?.q).toBeNull();
  });

  it("escapes LIKE wildcards", () => {
    // Input 50%_a\b; output 50\%\_a\\b.
    expect(likeLiteral(String.raw`50%_a\b`)).toBe(String.raw`50\%\_a\\b`);
  });
});
