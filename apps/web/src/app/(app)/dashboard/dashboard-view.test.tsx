import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthContext, DISABLED_AUTH, type AuthState } from "@/auth/auth-context";
import { MOCK_X_ACCOUNT } from "@/auth/mock-auth";
import { DataSourceProvider } from "@/data/context";
import { createMockDataSource } from "@/data/mock";
import type { DataSource } from "@/data/types";
import { DashboardView } from "./dashboard-view";

const LOGGED_IN: AuthState = {
  ...DISABLED_AUTH,
  enabled: true,
  authenticated: true,
  xAccount: MOCK_X_ACCOUNT,
};

function renderDashboard(source: DataSource | null, auth: AuthState = LOGGED_IN) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={auth}>
        <DataSourceProvider source={Promise.resolve(source)}>{children}</DataSourceProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return render(wrap(<DashboardView />));
}

afterEach(cleanup);

describe("Dashboard", () => {
  it("asks to log in with X when logged out", () => {
    renderDashboard(createMockDataSource(), { ...LOGGED_IN, authenticated: false, xAccount: null });
    expect(screen.getByRole("heading", { name: "Log in with X" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it("renders the bento from the account view", async () => {
    renderDashboard(createMockDataSource());
    expect(await screen.findByText("Logged in with X as @example_one")).toBeTruthy();
    expect(await screen.findByText("3 tokens")).toBeTruthy();

    const linked = screen
      .getByRole("heading", { name: "Linked tokens" })
      .closest("div")!.parentElement!;
    const tiles = within(linked).getAllByRole("link");
    expect(tiles.map((a) => a.getAttribute("href")?.startsWith("/tokens/0x"))).toEqual([
      true,
      true,
      true,
    ]);
    expect(within(linked).getByText("$EXC · ETH pair")).toBeTruthy();

    // Claimable sums per asset: 212.40 + 100.00 USDG, 0.0842 ETH. Never mixed.
    expect(screen.getByText("312.40")).toBeTruthy();
    expect(screen.getByText("0.0842")).toBeTruthy();
    expect(screen.getByText(/^Claim by \d{1,2} \w{3} \d{4}$/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Claim all" }).getAttribute("href")).toBe("/claim");
    expect(screen.getByRole("link", { name: "Collect pending" })).toBeTruthy();
    expect(
      screen.getAllByText(/claimed so far · FeeFlow fee: 1%, fixed in the contract\./),
    ).toHaveLength(2);
  });

  it("shows the not-live state without any sample figures", async () => {
    renderDashboard(null);
    expect(await screen.findByText("No linked tokens")).toBeTruthy();
    expect(
      screen.getAllByText("Live data appears after the FeeFlow contract is deployed.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Claim all" })).toHaveProperty("disabled", true);
    expect(screen.queryByText(/USDG/)).toBeNull();
  });

  it("shows an error with retry when the indexer fails", async () => {
    const failing = {
      ...createMockDataSource(),
      kind: "indexer",
      getAccount: async () => {
        throw new Error("The FeeFlow indexer could not be reached.");
      },
    } satisfies DataSource;
    renderDashboard(failing);
    expect(await screen.findByText("The FeeFlow indexer could not be reached.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("treats an account with no routed tokens as empty, not an error", async () => {
    const empty = { ...createMockDataSource(), getAccount: async () => null } satisfies DataSource;
    renderDashboard(empty);
    expect(await screen.findByText("No linked tokens")).toBeTruthy();
    expect(
      screen.queryByText("Live data appears after the FeeFlow contract is deployed."),
    ).toBeNull();
  });
});
