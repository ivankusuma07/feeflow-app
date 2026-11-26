import { NATIVE_ETH, sameAsset } from "@feeflow/config";
import { describe, expect, it, vi } from "vitest";
import { createIndexerDataSource } from "./indexer";
import { MOCK_TOKEN_ADDRESSES, createMockDataSource } from "./mock";
import { DataSourceError } from "./types";

function fakeFetch(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("indexer adapter", () => {
  it("calls the documented REST paths", async () => {
    const f = fakeFetch(200, []);
    const ds = createIndexerDataSource("https://indexer.example/", f);
    await ds.getTotals();
    await ds.getRecentClaims(5);
    await ds.getTopTokens(3);
    await ds.getLeaderboard("30d", "0xABC", 50);
    await ds.getAccount("1234567890");
    await ds.getToken("0xAbCd");
    await ds.getKeeperStatus();
    expect(f.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      "https://indexer.example/api/totals",
      "https://indexer.example/api/claims/recent?limit=5",
      "https://indexer.example/api/tokens/top?limit=3",
      "https://indexer.example/api/leaderboard?period=30d&asset=0xABC&limit=50",
      "https://indexer.example/api/accounts/1234567890",
      "https://indexer.example/api/tokens/0xabcd",
      "https://indexer.example/api/keeper/status",
    ]);
  });

  it("maps 404 to null for accounts and tokens only", async () => {
    const ds = createIndexerDataSource("https://i.example", fakeFetch(404));
    expect(await ds.getAccount("1")).toBeNull();
    expect(await ds.getToken("0x1")).toBeNull();
    await expect(ds.getTotals()).rejects.toBeInstanceOf(DataSourceError);
  });

  it("throws DataSourceError on server and network errors", async () => {
    await expect(
      createIndexerDataSource("https://i.example", fakeFetch(500)).getTotals(),
    ).rejects.toMatchObject({ status: 500 });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      createIndexerDataSource("https://i.example", down).getKeeperStatus(),
    ).rejects.toThrow("could not be reached");
  });
});

describe("mock adapter (dev only)", () => {
  const ds = createMockDataSource();

  it("identifies itself so the MOCK DATA banner shows", () => {
    expect(ds.kind).toBe("mock");
  });

  it("reports totals per asset, including a non-USDG/ETH pair", async () => {
    const totals = await ds.getTotals();
    const symbols = totals.assets.map((a) => a.asset.symbol);
    expect(symbols).toEqual(["ETH", "USDG", "GME"]);
    for (const a of totals.assets) {
      expect(BigInt(a.credited)).toBe(BigInt(a.claimed) + BigInt(a.unclaimed));
    }
  });

  it("returns token detail with batches inside the 30-day window maths", async () => {
    const t = await ds.getToken(MOCK_TOKEN_ADDRESSES[0]!);
    expect(t?.name).toBe("Example Token A");
    for (const b of t!.batches) expect(b.deadline - b.creditedAt).toBe(30 * 86_400);
    const credited = t!.batches.reduce((s, b) => s + BigInt(b.amount.raw), 0n);
    expect(credited.toString()).toBe(t!.buckets.credited.raw);
    expect(await ds.getToken("0x0000000000000000000000000000000000000bad")).toBeNull();
  });

  it("ranks the leaderboard in one asset only", async () => {
    const rows = await ds.getLeaderboard("all", NATIVE_ETH.address, 5);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => sameAsset(r.received.asset, NATIVE_ETH))).toBe(true);
    const values = rows.map((r) => BigInt(r.received.raw));
    expect([...values].sort((a, b) => (a < b ? 1 : -1))).toEqual(values);
    expect(await ds.getLeaderboard("all", "0x000000000000000000000000000000000000dead", 5)).toEqual(
      [],
    );
  });

  it("returns the account view for the logged-in id", async () => {
    const view = await ds.getAccount("999");
    expect(view?.account.userId).toBe("999");
    expect(view?.tokens.map((t) => t.name)).toEqual([
      "Example Token A",
      "Example Token B",
      "Example Token C",
    ]);
  });
});
