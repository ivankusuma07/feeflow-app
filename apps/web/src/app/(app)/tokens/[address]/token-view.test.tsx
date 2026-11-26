import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, DISABLED_AUTH } from "@/auth/auth-context";
import { DataSourceProvider } from "@/data/context";
import { createMockDataSource, MOCK_TOKEN_ADDRESSES } from "@/data/mock";
import type { DataSource } from "@/data/types";

const HASH = `0x7e57${"00".repeat(30)}` as const;
const wallet: { address: `0x${string}` | undefined } = { address: undefined };
const writeContract = vi.fn<(args: unknown) => Promise<typeof HASH>>(async () => HASH);

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: wallet.address,
    isConnected: Boolean(wallet.address),
    chainId: 4663,
  }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  usePublicClient: () => ({
    waitForTransactionReceipt: async () => ({ status: "success", transactionHash: HASH }),
  }),
  useReadContract: () => ({ data: undefined }),
  useWriteContract: () => ({ mutateAsync: writeContract }),
}));
vi.mock("@/lib/config", () => ({
  env: {
    NEXT_PUBLIC_CHAIN_ID: 4663,
    NEXT_PUBLIC_CONTRACT_ADDRESS: "0x00000000000000000000000000000000000000f1",
    NEXT_PUBLIC_API_URL: "https://api.example",
  },
}));
vi.mock("@feeflow/ui", async (orig) => ({
  ...(await orig<typeof import("@feeflow/ui")>()),
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const { TokenView } = await import("./token-view");

const TOKEN = getAddress(MOCK_TOKEN_ADDRESSES[0]!);

function renderToken(source: DataSource | null, address = TOKEN) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={DISABLED_AUTH}>
        <DataSourceProvider source={Promise.resolve(source)}>
          <TokenView address={address} />
        </DataSourceProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  wallet.address = undefined;
  writeContract.mockClear();
});
afterEach(cleanup);

describe("Token page", () => {
  it("shows the buckets, batches, policy and history", async () => {
    renderToken(createMockDataSource());
    expect(await screen.findByRole("heading", { level: 1, name: /Example Token A/ })).toBeTruthy();
    const buckets = screen.getByRole("region", { name: "Fee buckets" });
    expect(within(buckets).getByText("Unswept on Pons hook")).toBeTruthy();
    expect(within(buckets).getByText("In Pons escrow")).toBeTruthy();
    expect(within(buckets).getByText("Credited in FeeFlow")).toBeTruthy();
    expect(within(buckets).getByText("212.40")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Credited batches" })).toBeTruthy();
    expect(screen.getByText("1% · FEE_BPS = 100")).toBeTruthy();
    expect(screen.getByText("20%")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "History" })).toBeTruthy();
    expect(screen.getAllByText("Collect").length).toBeGreaterThan(0);
  });

  it("shows the Not routed state for unknown tokens", async () => {
    renderToken(createMockDataSource(), getAddress("0x00000000000000000000000000000000000000aa"));
    expect(await screen.findByText("Not routed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Route a token" }).getAttribute("href")).toBe("/route");
  });

  it("shows the not-live note without sample data", async () => {
    renderToken(null);
    expect(
      await screen.findByText("Live data appears after the FeeFlow contract is deployed."),
    ).toBeTruthy();
    expect(screen.queryByText("Example Token A")).toBeNull();
  });

  it("lets only the registering creator move future fees", async () => {
    const detail = (await createMockDataSource().getToken(TOKEN))!;
    renderToken(createMockDataSource());
    fireEvent.click(await screen.findByRole("button", { name: "Move future fees (creator)" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("textbox", { name: "New recipient wallet" });
    fireEvent.change(input, { target: { value: "0x00000000000000000000000000000000000000b2" } });
    expect(within(dialog).getByText(/Connect the registering creator wallet/)).toBeTruthy();

    cleanup();
    wallet.address = detail.creator;
    renderToken(createMockDataSource());
    fireEvent.click(await screen.findByRole("button", { name: "Move future fees (creator)" }));
    const dialog2 = await screen.findByRole("dialog");
    fireEvent.change(within(dialog2).getByRole("textbox", { name: "New recipient wallet" }), {
      target: { value: "0x00000000000000000000000000000000000000b2" },
    });
    await act(async () => {
      fireEvent.click(within(dialog2).getByRole("button", { name: "Move future fees" }));
    });
    expect(writeContract).toHaveBeenCalledTimes(1);
    const call = writeContract.mock.calls[0]![0] as { functionName: string; args: unknown[] };
    expect(call.functionName).toBe("exitByCreator");
    expect((call.args as string[]).map((x) => x.toLowerCase())).toEqual([
      TOKEN.toLowerCase(),
      "0x00000000000000000000000000000000000000b2",
    ]);
  });
});
