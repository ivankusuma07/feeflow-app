import { feeFlowAbi } from "@feeflow/abi";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { encodeErrorResult } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HASH = `0x9d07${"00".repeat(30)}` as const;

const wallet = { isConnected: true, chainId: 4663 };
const switchChain = vi.fn();
let receiptStatus: "success" | "reverted" = "success";
let resolveReceipt: (() => void) | null = null;

vi.mock("wagmi", () => ({
  useAccount: () => wallet,
  useSwitchChain: () => ({ switchChain, isPending: false }),
  usePublicClient: () => ({
    waitForTransactionReceipt: () =>
      new Promise((resolve) => {
        resolveReceipt = () => resolve({ status: receiptStatus });
      }),
  }),
}));

vi.mock("@/lib/config", () => ({
  env: {
    NEXT_PUBLIC_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
    NEXT_PUBLIC_CHAIN_ID: 4663,
  },
}));

vi.mock("@/lib/chain", () => ({
  appChain: { id: 4663, name: "Robinhood Chain" },
  explorerTxUrl: (h: string) => `https://explorer.example/tx/${h}`,
}));

vi.mock("@feeflow/ui", async (orig) => ({
  ...(await orig<typeof import("@feeflow/ui")>()),
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const { TxButton } = await import("./tx-button");

function renderButton(run: () => Promise<`0x${string}`>, props: Record<string, unknown> = {}) {
  return render(
    <TxButton
      label="Claim 312.40 USDG"
      pendingLabel="Claiming…"
      noWalletLabel="Connect a wallet to claim"
      successToast="Claimed"
      run={run}
      {...props}
    />,
  );
}

beforeEach(() => {
  wallet.isConnected = true;
  wallet.chainId = 4663;
  receiptStatus = "success";
  resolveReceipt = null;
});
afterEach(cleanup);

describe("TxButton", () => {
  it("asks for a wallet when none is connected", () => {
    wallet.isConnected = false;
    renderButton(vi.fn());
    expect(screen.getByRole("button", { name: "Connect a wallet to claim" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("offers a network switch on the wrong chain", () => {
    wallet.chainId = 1;
    renderButton(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Switch to Robinhood Chain" }));
    expect(switchChain).toHaveBeenCalledWith({ chainId: 4663 });
  });

  it("walks confirm in wallet → pending with hash → success, and blocks double submit", async () => {
    let send: (h: `0x${string}`) => void = () => {};
    const run = vi.fn(() => new Promise<`0x${string}`>((r) => (send = r)));
    const onSuccess = vi.fn();
    renderButton(run, { onSuccess });

    const button = screen.getByRole("button", { name: "Claim 312.40 USDG" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Confirm in wallet…" })).toHaveProperty(
      "disabled",
      true,
    );

    await act(async () => send(HASH));
    const pending = await screen.findByRole("button", { name: /Claiming…/ });
    expect(pending.textContent).toContain("0x9d07…");

    await act(async () => resolveReceipt?.());
    expect(await screen.findByRole("button", { name: "Claim 312.40 USDG" })).toBeTruthy();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("shows the decoded contract error and retries", async () => {
    const data = encodeErrorResult({ abi: feeFlowAbi, errorName: "AttestationExpired" });
    const run = vi
      .fn()
      .mockRejectedValueOnce({ cause: { data } })
      .mockReturnValue(new Promise(() => {}));
    renderButton(run);

    fireEvent.click(screen.getByRole("button", { name: "Claim 312.40 USDG" }));
    expect(await screen.findByText("Attestation expired. Your form is kept.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(run).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "Confirm in wallet…" })).toBeTruthy();
  });

  it("reports a reverted receipt as an error", async () => {
    receiptStatus = "reverted";
    renderButton(vi.fn().mockResolvedValue(HASH));
    fireEvent.click(screen.getByRole("button", { name: "Claim 312.40 USDG" }));
    await screen.findByRole("button", { name: /Claiming…/ });
    await act(async () => resolveReceipt?.());
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("stays disabled until FeeFlow is deployed", async () => {
    vi.resetModules();
    vi.doMock("@/lib/config", () => ({ env: { NEXT_PUBLIC_CHAIN_ID: 4663 } }));
    const { TxButton: Fresh } = await import("./tx-button");
    render(
      <Fresh
        label="Claim"
        pendingLabel="Claiming…"
        noWalletLabel="x"
        successToast="y"
        run={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Not deployed yet" })).toHaveProperty(
      "disabled",
      true,
    );
    vi.doUnmock("@/lib/config");
  });
});
