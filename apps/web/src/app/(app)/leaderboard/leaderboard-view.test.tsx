import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataSourceProvider } from "@/data/context";
import { createMockDataSource } from "@/data/mock";
import type { DataSource } from "@/data/types";
import { LeaderboardView } from "./leaderboard-view";

function renderBoard(source: DataSource | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DataSourceProvider source={Promise.resolve(source)}>
        <LeaderboardView />
      </DataSourceProvider>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("Leaderboard", () => {
  it("ranks accounts in one asset at a time", async () => {
    const source = createMockDataSource();
    const spy = vi.spyOn(source, "getLeaderboard");
    renderBoard(source);

    const list = await screen.findByRole("list", { name: "Ranking" });
    const rows = within(list).getAllByRole("listitem").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.textContent).toMatch(/USDG$/);
    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(spy).toHaveBeenLastCalledWith("30d", expect.stringMatching(/^0x/), 50);

    fireEvent.click(screen.getByRole("button", { name: "ETH" }));
    await screen.findAllByText(/ETH$/);
    const ethRows = within(await screen.findByRole("list", { name: "Ranking" }))
      .getAllByRole("listitem")
      .slice(1);
    for (const r of ethRows) expect(r.textContent).toMatch(/ETH$/);

    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    await vi.waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith("7d", "0x0000000000000000000000000000000000000000", 50),
    );
  });

  it("offers other pair assets with activity in a separate picker", async () => {
    renderBoard(createMockDataSource());
    const picker = await screen.findByRole("combobox", { name: "Other pair asset" });
    const options = within(picker)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toContain("GME");
    expect(options).not.toContain("USDG");
  });

  it("shows the not-live note without sample rows", async () => {
    renderBoard(null);
    expect(
      await screen.findByText("Live data appears after the FeeFlow contract is deployed."),
    ).toBeTruthy();
    expect(screen.queryByText("LIVE")).toBeNull();
    expect(screen.queryByRole("list", { name: "Ranking" })).toBeNull();
  });
});
