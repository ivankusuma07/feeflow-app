"use client";

import type { PairAsset } from "@feeflow/config";
import { shortAddress, shortHash, sumByAsset } from "@feeflow/sdk";
import { Button, Card } from "@feeflow/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { erc20Abi, isAddressEqual, type Hash } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import type { XAccount } from "@/auth/auth-context";
import { AuthGate } from "@/components/app/auth-gate";
import { EmptyState, ErrorState, Skeleton } from "@/components/app/states";
import { useAccountView } from "@/data/context";
import { byAsset, joinAmounts } from "@/lib/assets";
import { appChain, APP_CHAIN_ID, explorerTxUrl } from "@/lib/chain";
import { env, links } from "@/lib/config";
import { parseClaimed } from "./claimed";

const backToDashboard = (
  <Button asChild variant="secondary">
    <Link href="/dashboard">Back to dashboard</Link>
  </Button>
);

export function SuccessView({ tx }: { tx: Hash | null }) {
  if (!tx) {
    return <EmptyState title="That transaction link is not valid." action={backToDashboard} />;
  }
  return <AuthGate>{(account) => <Success account={account} tx={tx} />}</AuthGate>;
}

function Success({ account, tx }: { account: XAccount; tx: Hash }) {
  const contract = env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const client = usePublicClient({ chainId: appChain.id });
  const view = useAccountView(account.userId);
  const tokens = useMemo(
    () => (view.data?.live ? (view.data.value?.tokens ?? []) : []),
    [view.data],
  );

  // Waits for the receipt when arriving straight from the claim, reads it on a reload.
  const receipt = useQuery({
    queryKey: ["receipt", appChain.id, tx],
    enabled: Boolean(client && contract),
    staleTime: Infinity,
    queryFn: () => client!.waitForTransactionReceipt({ hash: tx, timeout: 120_000 }),
  });

  const accountAssets = useMemo(() => {
    const list: PairAsset[] = [];
    for (const t of tokens) list.push(t.pairAsset);
    return list;
  }, [tokens]);

  const first = useMemo(
    () =>
      receipt.data && contract
        ? parseClaimed(receipt.data, contract, APP_CHAIN_ID, accountAssets)
        : null,
    [receipt.data, contract, accountAssets],
  );

  // Assets FeeFlow doesn't know yet (any Pons pair asset): read symbol and decimals on-chain.
  const unknown = useMemo(() => (first?.ok ? first.unknownAssets : []), [first]);
  const meta = useReadContracts({
    allowFailure: false,
    query: { enabled: unknown.length > 0 },
    contracts: unknown.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol", chainId: appChain.id } as const,
      { address, abi: erc20Abi, functionName: "decimals", chainId: appChain.id } as const,
    ]),
  });

  const parsed = useMemo(() => {
    if (!first?.ok || unknown.length === 0) return first;
    if (!meta.data) return null;
    const extra: PairAsset[] = unknown.map((address, i) => ({
      address,
      symbol: String(meta.data[i * 2]),
      decimals: Number(meta.data[i * 2 + 1]),
    }));
    return parseClaimed(receipt.data!, contract!, APP_CHAIN_ID, [...accountAssets, ...extra]);
  }, [first, unknown, meta.data, receipt.data, contract, accountAssets]);

  if (!contract) {
    return <EmptyState title="Not deployed yet" action={backToDashboard} />;
  }
  if (receipt.isError || meta.isError) {
    return (
      <ErrorState
        message="This transaction could not be read. Check your connection and try again."
        onRetry={() => void (receipt.isError ? receipt.refetch() : meta.refetch())}
      />
    );
  }
  if (parsed && !parsed.ok) {
    return (
      <EmptyState
        title={
          parsed.reason === "reverted"
            ? "This claim transaction failed. Nothing was sent."
            : "This transaction is not a FeeFlow claim."
        }
        action={
          <Button asChild>
            <Link href="/claim">Back to claim</Link>
          </Button>
        }
      />
    );
  }
  if (!parsed) {
    return (
      <Card className="p-9" aria-busy="true">
        <Skeleton className="h-40 w-60" />
        <Skeleton className="mt-5 h-9 w-40" />
        <Skeleton className="mt-6 h-32" />
      </Card>
    );
  }

  const { summary } = parsed;
  const total = sumByAsset(summary.rows.flatMap((r) => r.amounts)).sort(byAsset);
  const url = explorerTxUrl(tx);

  return (
    <Card className="p-9">
      <Image
        src="/illustrations/success.webp"
        alt="A wallet full of coins with a check mark"
        width={240}
        height={180}
        loading="eager"
        className="-mt-3 -mb-2 -ml-4 block h-auto w-60 mix-blend-multiply"
      />
      <h1 className="mt-5 mb-0 text-[32px] font-semibold tracking-tight">Claimed</h1>
      <p className="mt-2 mb-0 text-base text-muted">
        Sent to <span className="font-mono">{shortAddress(summary.to)}</span> in one transaction.
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        <caption className="sr-only">Amounts claimed per token</caption>
        <tbody>
          {summary.rows.map((r) => {
            const t = tokens.find((x) => isAddressEqual(x.address, r.token));
            return (
              <tr key={r.token}>
                <td className="border-t border-line py-3">
                  {t ? (
                    <>
                      {t.name} <span className="font-mono text-xs text-muted">${t.symbol}</span>
                    </>
                  ) : (
                    <span className="font-mono">{shortAddress(r.token)}</span>
                  )}
                </td>
                <td className="border-t border-line py-3 text-right font-mono">
                  {joinAmounts(r.amounts)}
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="border-t border-ink py-3.5 font-semibold">Total</td>
            <td className="border-t border-ink py-3.5 text-right font-mono font-medium">
              {joinAmounts(total)}
            </td>
          </tr>
        </tbody>
      </table>
      {url ? (
        <a
          className="mt-1.5 inline-block font-mono text-[13px]"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View transaction {shortHash(tx)} <span aria-hidden>↗</span>
        </a>
      ) : (
        <p className="mt-1.5 mb-0 font-mono text-[13px]">Transaction {shortHash(tx)}</p>
      )}

      <div className="mt-7 border-t border-line pt-6">
        {links.dexSwap ? (
          <>
            <h2 className="m-0 text-base font-semibold">Want to swap what you claimed?</h2>
            <p className="mt-1.5 mb-0 text-sm leading-normal text-muted">
              Swap from your own wallet on Uniswap. FeeFlow is not involved in the swap.
            </p>
          </>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2.5">
          {links.dexSwap ? (
            <Button asChild>
              <a href={links.dexSwap} target="_blank" rel="noopener noreferrer">
                Swap on Uniswap <ArrowUpRight size={16} aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          ) : null}
          {backToDashboard}
        </div>
        {links.dexSwap ? (
          <p className="mt-3 mb-0 text-xs text-muted">
            Stock Tokens aren&apos;t available in some countries.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
