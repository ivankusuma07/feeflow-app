import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, DISABLED_AUTH, type AuthState } from "@/auth/auth-context";
import { MOCK_WALLET, MOCK_X_ACCOUNT } from "@/auth/mock-auth";
import { DataSourceProvider } from "@/data/context";
import { createMockDataSource } from "@/data/mock";

const HASH = `0x9d07${"00".repeat(30)}` as const;
const CONTRACT = "0x00000000000000000000000000000000000000f1";

const writeContract = vi.fn<(args: unknown) => Promise<typeof HASH>>(async () => HASH);
const push = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: MOCK_WALLET, isConnected: true, chainId: 4663 }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  usePublicClient: () => ({
    waitForTransactionReceipt: async () => ({ status: "success", transactionHash: HASH }),
  }),
  useWriteContract: () => ({ mutateAsync: writeContract }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
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

const { ClaimView } = await import("./claim-view");

const AUTH: AuthState = {
  ...DISABLED_AUTH,
  enabled: true,
  authenticated: true,
  xAccount: MOCK_X_ACCOUNT,
  getIdentityToken: async () => "id-token",
};

function renderClaim() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={AUTH}>
        <DataSourceProvider source={Promise.resolve(createMockDataSource())}>
          <ClaimView />
        </DataSourceProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const claimButton = () => screen.getByRole("button", { name: /^Claim/ });

beforeEach(() => {
  writeContract.mockClear();
  push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        xUserId: MOCK_X_ACCOUNT.userId,
        to: MOCK_WALLET,
        nonce: "7",
        expiry: Math.floor(Date.now() / 1000) + 300,
        attestation: `0x${"ab".repeat(65)}`,
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Claim", () => {
  it("preselects every claimable token and totals per asset", async () => {
    renderClaim();
    expect(await screen.findByRole("checkbox", { name: "Select Example Token A" })).toBeTruthy();
    expect(claimButton().textContent).toBe("Claim 312.40 USDG + 0.0842 ETH");
    expect(screen.getByRole("combobox", { name: "Send to wallet" })).toBeTruthy();
    expect(screen.getByText(/^Oldest amount: claim by/)).toBeTruthy();
  });

  it("only claims selected, visible rows", async () => {
    renderClaim();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Example Token B" }));
    expect(claimButton().textContent).toBe("Claim 212.40 USDG + 0.0842 ETH");

    fireEvent.change(screen.getByRole("combobox", { name: "Pair asset" }), {
      target: { value: "0x0000000000000000000000000000000000000000" },
    });
    expect(screen.queryByText("Example Token A")).toBeNull();
    expect(claimButton().textContent).toBe("Claim 0.0842 ETH");
  });

  it("fetches an attestation, sends one claim and opens the success page", async () => {
    renderClaim();
    await screen.findByRole("checkbox", { name: "Select Example Token A" });
    await act(async () => {
      fireEvent.click(claimButton());
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledTimes(1);
    const args = writeContract.mock.calls[0]![0] as {
      address: string;
      functionName: string;
      args: readonly unknown[];
    };
    expect(args.address).toBe(CONTRACT);
    expect(args.functionName).toBe("claim");
    const [xUserId, tokens, to, , nonce] = args.args;
    expect(xUserId).toBe(BigInt(MOCK_X_ACCOUNT.userId));
    expect(tokens).toHaveLength(3);
    expect(to).toBe(MOCK_WALLET);
    expect(nonce).toBe(7n);
    expect(push).toHaveBeenCalledWith(`/claim/success?tx=${HASH}`);
  });

  it("keeps the form and shows the reason when the approval fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    renderClaim();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Example Token B" }));
    await act(async () => {
      fireEvent.click(claimButton());
    });
    expect(
      await screen.findByText("Your X login has expired. Log in with X again, then claim."),
    ).toBeTruthy();
    expect(writeContract).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("checkbox", { name: "Select Example Token B" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
});
