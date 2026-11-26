"use client";

import { feeFlowAbi } from "@feeflow/abi";
import { sameAsset, type PairAsset } from "@feeflow/config";
import {
  formatDate,
  shortAddress,
  sumByAsset,
  UserFacingError,
  type AccountToken,
} from "@feeflow/sdk";
import { Card, Table, TableScroll, Td, Th, cn } from "@feeflow/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { getAddress, type Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { requestClaimAttestation } from "@/api/attest";
import { useAuth, type XAccount } from "@/auth/auth-context";
import { Amount } from "@/components/app/amount";
import { AuthGate } from "@/components/app/auth-gate";
import { EmptyState, ErrorState, Skeleton } from "@/components/app/states";
import { notLiveNote } from "@/content/copy";
import { useAccountView } from "@/data/context";
import { byAsset, joinAmounts, nonZero, symbolOf } from "@/lib/assets";
import { appChain } from "@/lib/chain";
import { env } from "@/lib/config";
import { TxButton } from "@/tx/tx-button";

const fieldCls =
  "min-h-11 rounded-[var(--radius-btn)] border border-line-strong bg-surface px-3 text-sm text-ink";
const checkCls = "size-[18px] accent-ink";

export function ClaimView() {
  return <AuthGate>{(account) => <Claim account={account} />}</AuthGate>;
}

function Claim({ account }: { account: XAccount }) {
  const query = useAccountView(account.userId);
  const { isConnected } = useAccount();

  const body = (() => {
    if (query.isError) {
      return (
        <ErrorState
          className="mt-6"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      );
    }
    if (query.isPending) {
      return (
        <div aria-busy="true" className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Skeleton className="h-80 lg:col-span-8" />
          <Skeleton className="h-80 lg:col-span-4" />
        </div>
      );
    }
    const tokens = query.data.live ? (query.data.value?.tokens ?? []) : [];
    if (tokens.length === 0) {
      return (
        <EmptyState
          className="mt-6"
          illustration
          title="No linked tokens"
          body={query.data.live ? undefined : notLiveNote}
        />
      );
    }
    return <ClaimForm account={account} tokens={tokens} />;
  })();

  return (
    <>
      <h1 className="m-0 text-4xl font-semibold tracking-tight">Claim</h1>
      <Steps walletConnected={isConnected} />
      {body}
    </>
  );
}

function Steps({ walletConnected }: { walletConnected: boolean }) {
  const steps = [
    { label: "Logged in with X", done: true },
    { label: walletConnected ? "Wallet connected" : "Connect a wallet", done: walletConnected },
    { label: "Select tokens", done: false },
    { label: "Claim", done: false },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol aria-label="Progress" className="mt-6 mb-0 flex list-none flex-wrap gap-2.5 p-0 text-sm">
      {steps.map((s, i) => (
        <li
          key={s.label}
          aria-current={i === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3.5 py-2",
            s.done && "border-line bg-surface",
            i === current && "border-ink bg-accent font-semibold",
            !s.done && i !== current && "border-line text-muted",
          )}
        >
          {s.done ? (
            <Check size={16} strokeWidth={2} aria-hidden />
          ) : (
            <span className="font-mono">{i + 1}</span>
          )}
          {s.label}
          {s.done ? <span className="sr-only"> (done)</span> : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- form

function ClaimForm({ account, tokens }: { account: XAccount; tokens: AccountToken[] }) {
  const ids = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { address: connected } = useAccount();
  const { mutateAsync: writeContract } = useWriteContract();

  const [search, setSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [hideZero, setHideZero] = useState(true);
  const [selected, setSelected] = useState<Set<Address>>(
    () => new Set(tokens.filter((t) => nonZero(t.claimable)).map((t) => t.address)),
  );
  const [pickedWallet, setPickedWallet] = useState<Address | null>(null);

  const assets = useMemo(() => {
    const list: PairAsset[] = [];
    for (const t of tokens)
      if (!list.some((a) => sameAsset(a, t.pairAsset))) list.push(t.pairAsset);
    return list;
  }, [tokens]);

  const visible = tokens.filter((t) => {
    const q = search.trim().toLowerCase();
    if (
      q &&
      !t.name.toLowerCase().includes(q) &&
      !t.symbol.toLowerCase().includes(q) &&
      !t.address.toLowerCase().includes(q)
    )
      return false;
    if (assetFilter !== "all" && t.pairAsset.address.toLowerCase() !== assetFilter) return false;
    if (hideZero && !nonZero(t.claimable) && !nonZero(t.pending)) return false;
    return true;
  });

  // Only what is selected, visible and claimable is sent: a filter never claims hidden rows.
  const chosen = visible.filter((t) => selected.has(t.address) && nonZero(t.claimable));
  const totals = sumByAsset(chosen.map((t) => t.claimable))
    .filter(nonZero)
    .sort(byAsset);
  const oldest = chosen
    .filter((t) => t.oldestDeadline !== null)
    .sort((a, b) => a.oldestDeadline! - b.oldestDeadline!)[0];
  const collectFrom = tokens.find((t) => nonZero(t.pending));

  // Destination: any wallet linked to this login, defaulting to the connected one.
  const wallets = useMemo(() => {
    const list: Address[] = [];
    const add = (a: Address | undefined) => {
      if (a && !list.some((x) => x.toLowerCase() === a.toLowerCase())) list.push(getAddress(a));
    };
    add(connected);
    for (const w of auth.wallets) add(w.address);
    return list;
  }, [connected, auth.wallets]);
  const to = pickedWallet && wallets.includes(pickedWallet) ? pickedWallet : (wallets[0] ?? null);

  const toggle = (addr: Address) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });

  const run = async () => {
    const contract = env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    if (!contract || !to) throw new UserFacingError("Connect a wallet to claim.", false);
    const identityToken = await auth.getIdentityToken();
    if (!identityToken) throw new UserFacingError("Log in with X again, then claim.", false);
    const att = await requestClaimAttestation({
      apiUrl: env.NEXT_PUBLIC_API_URL,
      identityToken,
      xUserId: account.userId,
      to,
    });
    return writeContract({
      address: contract,
      abi: feeFlowAbi,
      functionName: "claim",
      args: [
        att.xUserId,
        chosen.map((t) => t.address),
        att.to,
        att.expiry,
        att.nonce,
        att.attestation,
      ],
      chainId: appChain.id,
    });
  };

  return (
    <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <Card flush className="lg:col-span-8">
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-6 py-5">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-xs text-muted">
            Search
            <input
              className={fieldCls}
              type="search"
              placeholder="Token name or address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Pair asset
            <select
              className={fieldCls}
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
            >
              <option value="all">All</option>
              {assets.map((a) => (
                <option key={a.address} value={a.address.toLowerCase()}>
                  {symbolOf(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={checkCls}
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
            />
            Hide zero balances
          </label>
        </div>

        <TableScroll>
          <Table className="min-w-[640px]">
            <thead>
              <tr>
                <Th className="w-10 pl-6">
                  <span className="sr-only">Select</span>
                </Th>
                <Th>Token</Th>
                <Th>Claimable</Th>
                <Th>Pending</Th>
                <Th>Claim by</Th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <Td colSpan={5} className="px-6 py-8 text-center text-muted">
                    No tokens match.
                  </Td>
                </tr>
              ) : (
                visible.map((t) => {
                  const claimable = nonZero(t.claimable);
                  return (
                    <tr key={t.address}>
                      <Td className="pl-6">
                        <input
                          type="checkbox"
                          className={checkCls}
                          aria-label={`Select ${t.name}`}
                          checked={claimable && selected.has(t.address)}
                          disabled={!claimable}
                          onChange={() => toggle(t.address)}
                        />
                      </Td>
                      <Td>
                        <div className="font-semibold">{t.name}</div>
                        <div className="font-mono text-xs text-muted">
                          ${t.symbol} · {symbolOf(t.pairAsset)} pair
                        </div>
                      </Td>
                      <Td>
                        <Amount value={t.claimable} />
                      </Td>
                      <Td className="text-muted">
                        <Amount value={t.pending} />
                      </Td>
                      <Td className="font-mono">
                        {t.oldestDeadline !== null ? formatDate(t.oldestDeadline) : "—"}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableScroll>
        <p className="m-0 px-6 py-4 text-[13px] leading-normal text-muted">
          Pending amounts are still on Pons and are not claimable yet.{" "}
          {collectFrom ? (
            <Link href={`/tokens/${collectFrom.address}`}>Collect them from the token page</Link>
          ) : (
            "Collect them from the token page"
          )}
          .
        </p>
      </Card>

      <Card as="aside" className="lg:col-span-4">
        <h2 className="m-0 text-lg font-semibold">Summary</h2>
        <label htmlFor={`${ids}-to`} className="mt-4 block text-xs text-muted">
          Send to wallet
        </label>
        {wallets.length > 0 ? (
          <select
            id={`${ids}-to`}
            className={cn(fieldCls, "mt-1.5 w-full font-mono")}
            value={to ?? ""}
            onChange={(e) => setPickedWallet(e.target.value as Address)}
          >
            {wallets.map((w) => (
              <option key={w} value={w}>
                {shortAddress(w)}
                {connected && w.toLowerCase() === connected.toLowerCase() ? " (connected)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <select id={`${ids}-to`} className={cn(fieldCls, "mt-1.5 w-full")} disabled>
            <option>Connect a wallet</option>
          </select>
        )}

        <dl className="mt-5 mb-0 grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
          <dt className="text-muted">Tokens selected</dt>
          <dd className="m-0 font-mono">{chosen.length}</dd>
          {totals.map((a) => (
            <div key={a.asset.address} className="contents">
              <dt className="text-muted">{symbolOf(a.asset)}</dt>
              <dd className="m-0 font-mono font-medium">
                <Amount value={a} unit={false} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 mb-0 text-[13px] leading-normal text-muted">
          FeeFlow&apos;s 1% fee was already deducted when these fees were collected. Nothing is
          taken at claim.
        </p>
        {oldest ? (
          <p className="mt-3 mb-0 rounded-lg bg-bg px-3 py-2.5 text-[13px] leading-normal">
            <strong>Oldest amount: claim by {formatDate(oldest.oldestDeadline!)}.</strong> Claiming
            now pays everything credited, including it.
          </p>
        ) : null}
        <TxButton
          className="mt-5"
          block
          label={totals.length > 0 ? `Claim ${joinAmounts(totals)}` : "Claim"}
          pendingLabel="Claiming…"
          noWalletLabel="Connect a wallet to claim"
          successToast="Claimed"
          disabled={chosen.length === 0 || !to}
          run={run}
          onSuccess={(receipt) => {
            void queryClient.invalidateQueries({ queryKey: ["ds"] });
            router.push(`/claim/success?tx=${receipt.transactionHash}`);
          }}
        />
        <p className="mt-2.5 mb-0 text-center text-xs text-muted">
          One transaction. You pay a small network fee in ETH.
        </p>
      </Card>
    </div>
  );
}
