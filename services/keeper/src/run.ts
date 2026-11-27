import { feeFlowAbi, ponsFeeEscrowAbi } from "@feeflow/abi";
import { NATIVE_ASSET_ADDRESS } from "@feeflow/config";
import { decodeError } from "@feeflow/sdk";
import { parseAbi, type Abi, type Address, type PublicClient, type WalletClient } from "viem";
import {
  chunk,
  collectTargets,
  GasBudget,
  overrideAlerts,
  releaseCandidates,
  sweepCandidates,
  withdrawDue,
  type Thresholds,
  type WorkItem,
} from "./plan";

/** Pons sweep operator (ADR-001): curves only accept sweeps from it. */
const sweepOperatorAbi = parseAbi(["function sweepCurve(address curve)"]);

export type Log = (entry: Record<string, unknown>) => void;

export interface KeeperDeps {
  publicClient: PublicClient;
  walletClient: WalletClient;
  contract: Address;
  /** Unset (e.g. Anvil mocks): sweeps are skipped. */
  sweepOperator: Address | undefined;
  indexerUrl: string;
  thresholds: Thresholds;
  gasBudgetWei: bigint;
  maxReleaseBatches: number;
  withdrawEverySeconds: number;
  minBalanceWei: bigint;
  log: Log;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

/** Survives between runs (in memory: every action is re-checked on chain, so a restart is safe). */
export interface KeeperState {
  lastWithdrawAt: Map<Address, number>;
}

export interface RunSummary {
  tokens: number;
  swept: number;
  collected: number;
  released: number;
  withdrawn: number;
  skipped: number;
  spentWei: string;
  budgetExhausted: boolean;
}

const COLLECT_BATCH = 20;

export async function fetchWork(indexerUrl: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${indexerUrl.replace(/\/$/, "")}/api/keeper/work`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`indexer /api/keeper/work returned ${res.status}`);
  return (await res.json()) as WorkItem[];
}

/** One keeper pass: sweep → collect → release expired → withdraw fees, within the gas budget. */
export async function runOnce(deps: KeeperDeps, state: KeeperState): Promise<RunSummary> {
  const pc = deps.publicClient;
  const account = deps.walletClient.account!;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const budget = new GasBudget(deps.gasBudgetWei);
  const summary: RunSummary = {
    tokens: 0,
    swept: 0,
    collected: 0,
    released: 0,
    withdrawn: 0,
    skipped: 0,
    spentWei: "0",
    budgetExhausted: false,
  };

  const balance = await pc.getBalance({ address: account.address });
  if (balance < deps.minBalanceWei) {
    deps.log({
      kind: "alert",
      alert: "low-balance",
      address: account.address,
      balanceWei: balance.toString(),
    });
  }

  /** Estimate (which reverts like the real call), check the budget, send, wait. */
  async function send(
    action: string,
    call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
    detail: Record<string, unknown>,
  ): Promise<boolean> {
    if (summary.budgetExhausted) return false;
    let gas: bigint;
    try {
      gas = await pc.estimateContractGas({ ...call, account } as never);
    } catch (err) {
      summary.skipped += 1;
      deps.log({
        kind: "skip",
        action,
        ...detail,
        reason: decodeError(err).errorName ?? "reverted",
      });
      return false;
    }
    const gasPrice = await pc.getGasPrice();
    const estimate = ((gas * 12n) / 10n) * gasPrice;
    if (!budget.allows(estimate)) {
      summary.budgetExhausted = true;
      deps.log({ kind: "budget", action, ...detail, spentWei: budget.spent.toString() });
      return false;
    }
    const hash = await deps.walletClient.writeContract({
      ...call,
      account,
      chain: pc.chain,
      gas: (gas * 12n) / 10n,
    } as never);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    budget.add(receipt.gasUsed * receipt.effectiveGasPrice);
    const ok = receipt.status === "success";
    deps.log({
      kind: ok ? "tx" : "tx-reverted",
      action,
      ...detail,
      txHash: hash,
      gasUsed: receipt.gasUsed.toString(),
    });
    return ok;
  }

  const items = await fetchWork(deps.indexerUrl, deps.fetchImpl);
  summary.tokens = items.length;
  for (const a of overrideAlerts(items)) deps.log({ kind: "alert", ...a });
  const escrowAddr = await pc.readContract({
    address: deps.contract,
    abi: feeFlowAbi,
    functionName: "ESCROW",
  });

  // 1. Sweep curves into the escrow. The operator reverts below Pons's floor (BelowFloor) and
  //    for internal swaps (InternalSwapRequiresOperator): both show up as a skipped estimate.
  if (deps.sweepOperator) {
    for (const i of sweepCandidates(items)) {
      if (
        await send(
          "sweep",
          {
            address: deps.sweepOperator,
            abi: sweepOperatorAbi,
            functionName: "sweepCurve",
            args: [i.curve],
          },
          { token: i.token, curve: i.curve },
        )
      )
        summary.swept += 1;
    }
  }

  // 2. Collect: live escrow balances (after the sweeps), in collectMany batches.
  const escrow = new Map<Address, bigint>();
  for (const part of chunk(items, 20)) {
    await Promise.all(
      part.map(async (i) => {
        const bal =
          i.asset.toLowerCase() === NATIVE_ASSET_ADDRESS
            ? await pc.readContract({
                address: escrowAddr,
                abi: ponsFeeEscrowAbi,
                functionName: "balanceOf",
                args: [i.sink],
              })
            : await pc.readContract({
                address: escrowAddr,
                abi: ponsFeeEscrowAbi,
                functionName: "balanceOfToken",
                args: [i.sink, i.asset],
              });
        escrow.set(i.token, bal);
      }),
    );
  }
  for (const tokens of chunk(collectTargets(items, escrow, deps.thresholds), COLLECT_BATCH)) {
    if (
      await send(
        "collect",
        { address: deps.contract, abi: feeFlowAbi, functionName: "collectMany", args: [tokens] },
        { tokens },
      )
    )
      summary.collected += tokens.length;
  }

  // 3. Release batches past the 30-day window to each token's creator. The window is checked
  //    against block time, as the contract does.
  const chainNow = Number((await pc.getBlock()).timestamp);
  for (const token of releaseCandidates(items, chainNow)) {
    const expirable = await pc.readContract({
      address: deps.contract,
      abi: feeFlowAbi,
      functionName: "expirable",
      args: [token],
    });
    if (expirable === 0n) continue;
    if (
      await send(
        "release",
        {
          address: deps.contract,
          abi: feeFlowAbi,
          functionName: "releaseExpired",
          args: [token, BigInt(deps.maxReleaseBatches)],
        },
        { token, expirable: expirable.toString() },
      )
    )
      summary.released += 1;
  }

  // 4. Protocol fee to the immutable FEE_RECIPIENT, weekly per asset.
  for (const asset of withdrawDue(items, state.lastWithdrawAt, deps.withdrawEverySeconds, now())) {
    const accrued = await pc.readContract({
      address: deps.contract,
      abi: feeFlowAbi,
      functionName: "accruedFees",
      args: [asset],
    });
    if (accrued > 0n) {
      const ok = await send(
        "withdraw-fees",
        { address: deps.contract, abi: feeFlowAbi, functionName: "withdrawFees", args: [asset] },
        { asset, amount: accrued.toString() },
      );
      if (!ok) continue;
      summary.withdrawn += 1;
    }
    state.lastWithdrawAt.set(asset, now());
  }

  summary.spentWei = budget.spent.toString();
  return summary;
}
