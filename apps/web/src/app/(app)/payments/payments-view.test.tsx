import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataSourceProvider } from "@/data/context";
import { createMockDataSource } from "@/data/mock";
import type { DataSource } from "@/data/types";
import { PaymentsView } from "./payments-view";

function renderPayments(source: DataSource | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DataSourceProvider source={Promise.resolve(source)}>
        <PaymentsView />
      </DataSourceProvider>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("Payments", () => {
  it("shows totals per asset, top tokens, claims and the full table", async () => {
    renderPayments(createMockDataSource());
    expect(await screen.findByText("Total fees collected into FeeFlow")).toBeTruthy();
    const table = (await screen.findByRole("heading", { name: "All routed tokens" })).closest(
      "#all-tokens",
    ) as HTMLElement;
    const rows = await within(table).findAllByRole("row");
    expect(rows.length).toBeGreaterThan(3);
    // Every token links to its page.
    for (const a of within(table).getAllByRole("link")) {
      expect(a.getAttribute("href")).toMatch(/^\/tokens\/0x[0-9a-fA-F]{40}$/);
    }
    // Secondary totals show each asset separately, never a cross-asset sum.
    expect((await screen.findAllByText(/USDG \+ [\d.,]+ ETH/, { selector: "dd" })).length).toBe(2);
    // All-zero totals show one zero, not "0.00 USDG + 0.0000 ETH + …".
    expect(screen.getByText("0.00 USDG", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText(/Last keeper run: \d+ min ago/)).toBeTruthy();
    expect(screen.getAllByText(/claimed by/).length).toBeGreaterThan(0);
  });

  it("shows dashes and the not-live note without sample figures", async () => {
    renderPayments(null);
    expect(
      (await screen.findAllByText("Live data appears after the FeeFlow contract is deployed."))
        .length,
    ).toBeGreaterThan(0);
    // No figures at all: the About section still names USDG, but no amount is shown.
    expect(screen.queryAllByText(/\d[\d,]*\.\d+ (USDG|ETH)/)).toHaveLength(0);
    expect(screen.getByText("Last keeper run: —")).toBeTruthy();
  });

  it("shows an error with retry per section when the indexer fails", async () => {
    const failing = {
      ...createMockDataSource(),
      kind: "indexer",
      getTopTokens: async () => {
        throw new Error("The FeeFlow indexer could not be reached.");
      },
    } satisfies DataSource;
    renderPayments(failing);
    expect((await screen.findAllByText("The FeeFlow indexer could not be reached.")).length).toBe(
      2,
    );
    // Other sections still render.
    expect(await screen.findByText("Total claimed")).toBeTruthy();
  });
});
