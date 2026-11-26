"use client";

import { feeFlowAbi, ponsFactoryAbi } from "@feeflow/abi";
import { isNative, THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import {
  daysLeft,
  formatDate,
  formatRaw,
  formatRelative,
  initials,
  shortAddress,
  shortHash,
  UserFacingError,
  type TokenDetail,
  type TokenEvent,
} from "@feeflow/sdk";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Dialog,
  DialogContent,
  DialogTrigger,
  Monogram,
  Note,
  Table,
  TableScroll,
  Td,
  Th,
} from "@feeflow/ui";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { getAddress, isAddress, isAddressEqual, type Address } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { requestExitAttestation } from "@/api/attest";
import { useAuth } from "@/auth/auth-context";
import { Address as AddressLink } from "@/components/app/address";
import { Amount } from "@/components/app/amount";
import { Avatar } from "@/components/app/avatar";
import { EmptyState, ErrorState, Skeleton } from "@/components/app/states";
import { notLiveNote } from "@/content/copy";
import { useTokenDetail } from "@/data/context";
import { symbolOf } from "@/lib/assets";
import { appChain, APP_CHAIN_ID, explorerTxUrl } from "@/lib/chain";
import { env } from "@/lib/config";
import { ponsSweepOperatorAbi } from "@/lib/pons";
import { TxButton } from "@/tx/tx-button";

/** Releases at most this many batches per transaction to bound gas. */
const MAX_RELEASE_BATCHES = 50;
const fieldCls =
  "min-h-11 w-full rounded-[var(--radius-btn)] border border-line-strong bg-surface px-3 font-mono text-sm text-ink";

export function TokenView({ address }: { address: Address }) {
  const query = useTokenDetail(address);

  if (query.isError) {
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  }
  if (query.isPending) {
    return (
      <div aria-busy="true">
        <Skeleton className="h-16 w-96 max-w-full" />
        <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="mt-5 h-64" />
      </div>
    );
  }
  if (!query.data.live) {
    return <EmptyState illustration title="Token" body={notLiveNote} />;
  }
  if (!query.data.value) {
    return (
      <EmptyState
        illustration
        title="Not routed"
        body={
          <>
            <span className="font-mono">{shortAddress(address)}</span> is not routed through
            FeeFlow.
          </>
        }
        action={
          <Button asChild>
            <Link href="/route">Route a token</Link>
          </Button>
        }
      />
    );
  }
  return <Token t={query.data.value} />;
}

function handleOf(t: TokenDetail) {
  return t.recipient.username ? `@${t.recipient.username}` : `X user ${t.recipient.userId}`;
}

function Token({ t }: { t: TokenDetail }) {
  const queryClient = useQueryClient();
  const { mutateAsync: writeContract } = useWriteContract();
  const contract = env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const pons = THIRD_PARTY_ADDRESSES[APP_CHAIN_ID];
  const handle = handleOf(t);
  const exited = t.status === "exited";
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["ds"] });

  // The curve address comes from Pons; sweeping a curve goes through the public operator.
  const launched = useReadContract({
    address: pons?.ponsFactory,
    abi: ponsFactoryAbi,
    functionName: "getLaunchedToken",
    args: [t.address],
    chainId: appChain.id,
    query: { enabled: Boolean(pons && !t.graduated) },
  });
  const curve = launched.data?.exists ? launched.data.curve : null;

  // Captured once per mount: batch status is day-granular.
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const expiredBatches = t.batches.filter((b) => b.deadline <= now).length;
  const policy = t.feePolicy;
  const pct = (bps: number | null) => (bps === null ? "—" : `${bps / 100}%`);

  return (
    <>
      {/* ---- header */}
      <div className="flex flex-wrap items-center gap-4">
        <Monogram text={initials(t.name)} size={56} />
        <div className="min-w-0">
          <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t.name} <span className="font-mono text-xl font-normal text-muted">${t.symbol}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <Badge className="gap-1.5">
              <Avatar src={t.recipient.avatarUrl} label={handle} size={18} />
              {exited ? `Moved out of FeeFlow · was ${handle}` : `Routed to ${handle}`}
            </Badge>
            <Badge className="font-mono">{symbolOf(t.pairAsset)} pair</Badge>
            {t.graduated ? <Badge className="font-mono">Graduated</Badge> : null}
          </div>
        </div>
      </div>

      <dl className="mt-6 mb-0 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[13px]">
        <Meta label="Token">
          <AddressLink address={t.address} />
        </Meta>
        <Meta label="Fee sink">
          <AddressLink address={t.sink} />
        </Meta>
        <Meta label="Registering creator">
          <AddressLink address={t.creator} />
        </Meta>
        <Meta label="Routed since">{formatDate(t.routedAt)}</Meta>
        <Meta label="Claims in last 30 days">{t.claimsLast30d}</Meta>
        <Meta label="Expired to creator">
          <Amount value={t.expiredToCreator} />
        </Meta>
      </dl>

      {!t.recipient.hasLoggedIn ? (
        <Note tone="warn" className="mt-5">
          <strong>{handle} has never logged in to FeeFlow.</strong> Amounts not claimed within 30
          days can be released to the registering creator.
        </Note>
      ) : null}

      {t.pendingTakeover ? (
        <Note tone="warn" className="mt-5">
          <strong>Pons community takeover proposed.</strong> A new creator fee recipient{" "}
          <span className="font-mono">{shortAddress(t.pendingTakeover.proposedRecipient)}</span> can
          be executed from <strong>{formatDate(t.pendingTakeover.effectiveAt)}</strong> until{" "}
          {formatDate(t.pendingTakeover.expiresAt)}. If executed, future fees stop flowing to
          FeeFlow. <TxAnchor hash={t.pendingTakeover.txHash}>Proposal tx</TxAnchor>
        </Note>
      ) : null}

      {/* ---- buckets */}
      <section aria-label="Fee buckets" className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-3">
        <Bucket
          title="Unswept on Pons hook"
          value={<Amount value={t.buckets.unswept} unit={false} />}
          unit={symbolOf(t.pairAsset)}
        >
          <p className="mt-2 mb-0 text-xs text-muted">
            Read from <span className="font-mono">pendingFees + pendingCreatorTax</span>.
          </p>
          {!t.graduated && pons && curve && !exited ? (
            <>
              <TxButton
                className="mt-4"
                variant="secondary"
                requiresDeployment={false}
                label="Sweep"
                pendingLabel="Sweeping…"
                noWalletLabel="Connect a wallet to sweep"
                successToast="Swept"
                run={() =>
                  writeContract({
                    address: pons.ponsSweepOperator,
                    abi: ponsSweepOperatorAbi,
                    functionName: "sweepCurve",
                    args: [curve],
                    chainId: appChain.id,
                  })
                }
                onSuccess={refresh}
              />
              <p className="mt-2 mb-0 text-xs text-muted">
                Some sweeps need the Pons operator; you&apos;ll see why if so.
              </p>
            </>
          ) : null}
        </Bucket>

        <Bucket
          title="In Pons escrow"
          value={<Amount value={t.buckets.escrow} unit={false} />}
          unit={symbolOf(t.pairAsset)}
        >
          <p className="mt-2 mb-0 text-xs text-muted">
            Read from{" "}
            <span className="font-mono">
              {isNative(t.pairAsset)
                ? "balanceOf(sink)"
                : `balanceOfToken(sink, ${symbolOf(t.pairAsset)})`}
            </span>
            .
          </p>
          {!exited ? (
            <>
              <TxButton
                className="mt-4"
                label="Collect into FeeFlow"
                pendingLabel="Collecting…"
                noWalletLabel="Connect a wallet to collect"
                successToast="Collected into FeeFlow"
                run={() =>
                  writeContract({
                    address: contract!,
                    abi: feeFlowAbi,
                    functionName: "collect",
                    args: [t.address],
                    chainId: appChain.id,
                  })
                }
                onSuccess={refresh}
              />
              <p className="mt-2 mb-0 text-xs text-muted">
                Anyone can do this. 1% goes to FeeFlow, 99% to {handle}.
              </p>
            </>
          ) : null}
        </Bucket>

        <Bucket
          title="Credited in FeeFlow"
          value={<Amount value={t.buckets.credited} unit={false} />}
          unit={symbolOf(t.pairAsset)}
        >
          <p className="mt-2 mb-0 text-xs text-muted">
            Claimable by {handle}. Read from <span className="font-mono">credited(token)</span>.
          </p>
          <Button asChild variant="secondary" className="mt-4">
            <Link href="/claim">Claim as {handle}</Link>
          </Button>
        </Bucket>
      </section>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* ---- batches */}
        <Card flush className="lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
            <CardTitle>Credited batches</CardTitle>
            <TxButton
              variant="secondary"
              label={`Release expired (${expiredBatches})`}
              pendingLabel="Releasing…"
              noWalletLabel={`Release expired (${expiredBatches})`}
              successToast="Released to the creator"
              disabled={expiredBatches === 0}
              run={() =>
                writeContract({
                  address: contract!,
                  abi: feeFlowAbi,
                  functionName: "releaseExpired",
                  args: [t.address, BigInt(Math.min(expiredBatches, MAX_RELEASE_BATCHES))],
                  chainId: appChain.id,
                })
              }
              onSuccess={refresh}
            />
          </div>
          <TableScroll className="mt-3">
            <Table className="min-w-[520px]">
              <thead>
                <tr>
                  <Th className="pl-6">Collected</Th>
                  <Th>Amount (net)</Th>
                  <Th>Claim by</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {t.batches.length === 0 ? (
                  <tr>
                    <Td colSpan={4} className="px-6 py-6 text-muted">
                      No credited batches.
                    </Td>
                  </tr>
                ) : (
                  t.batches.map((b, i) => {
                    const left = daysLeft(b.deadline, now);
                    const expired = b.deadline <= now;
                    return (
                      <tr key={b.index}>
                        <Td className="pl-6 font-mono">{formatDate(b.creditedAt)}</Td>
                        <Td>
                          <Amount value={b.amount} />
                        </Td>
                        <Td className="font-mono">{formatDate(b.deadline)}</Td>
                        <Td>
                          {expired ? (
                            <Badge tone="quiet">Expired · releasable</Badge>
                          ) : i === 0 ? (
                            <Badge>
                              Oldest · {left} {left === 1 ? "day" : "days"} left
                            </Badge>
                          ) : (
                            `${left} ${left === 1 ? "day" : "days"} left`
                          )}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableScroll>
          <p className="m-0 px-6 py-4 text-[13px] leading-normal text-muted">
            Each batch is claimable for 30 days from its collect transaction. After that, anyone can
            release it to the registering creator, never to FeeFlow. Unreleased batches stay
            claimable.
          </p>
        </Card>

        {/* ---- policy + exits */}
        <Card className="lg:col-span-5">
          <CardTitle>Fee policy</CardTitle>
          <dl className="mt-4 mb-0 grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
            <dt className="text-muted">Creator share (Pons)</dt>
            <dd className="m-0 text-right font-mono">{pct(policy.creatorShareBps)}</dd>
            <dt className="text-muted">Pons protocol share</dt>
            <dd className="m-0 text-right font-mono">{pct(policy.protocolShareBps)}</dd>
            <dt className="text-muted">FeeFlow fee</dt>
            <dd className="m-0 text-right font-mono">1% · FEE_BPS = 100</dd>
            <dt className="text-muted">Claim window</dt>
            <dd className="m-0 text-right font-mono">30 days per batch</dd>
          </dl>
          <div className="mt-5 border-t border-line pt-5">
            <h3 className="m-0 text-base font-semibold">Who can change the routing</h3>
            <p className="mt-2 mb-0 text-sm leading-normal text-muted">
              Both the X account owner and the registering creator can move future fees out of
              FeeFlow at any time. FeeFlow does not arbitrate. Amounts already credited stay
              claimable by {handle}.
            </p>
            {exited ? (
              <p className="mt-3 mb-0 text-sm font-medium">
                Future fees were already moved out of FeeFlow.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2.5">
                <ExitDialog role="handle" token={t} />
                <ExitDialog role="creator" token={t} />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ---- history */}
      <Card flush className="mt-5">
        <CardTitle className="px-6 pt-5">History</CardTitle>
        <TableScroll className="mt-3">
          <Table className="min-w-[680px]">
            <thead>
              <tr>
                <Th className="pl-6">Event</Th>
                <Th>Detail</Th>
                <Th>Amount</Th>
                <Th>When</Th>
                <Th>Tx</Th>
              </tr>
            </thead>
            <tbody>
              {t.history.map((e) => (
                <tr key={`${e.txHash}-${e.kind}`}>
                  <Td className="pl-6">
                    <Badge>{EVENT_LABEL[e.kind]}</Badge>
                  </Td>
                  <Td>{eventDetail(e, t)}</Td>
                  <Td className="font-mono">{e.amount ? <Amount value={e.amount} /> : "—"}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    <time dateTime={new Date(e.timestamp * 1000).toISOString()}>
                      {e.kind === "routed" ? formatDate(e.timestamp) : formatRelative(e.timestamp)}
                    </time>
                  </Td>
                  <Td>
                    <TxAnchor hash={e.txHash}>{shortHash(e.txHash)}</TxAnchor>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      </Card>
    </>
  );
}

const EVENT_LABEL: Record<TokenEvent["kind"], string> = {
  routed: "Routed",
  collect: "Collect",
  claim: "Claim",
  expired: "Released",
  exit: "Moved out",
};

function eventDetail(e: TokenEvent, t: TokenDetail): ReactNode {
  const s = (raw: string | undefined) => (raw === undefined ? "—" : formatRaw(raw, t.pairAsset));
  const who = e.actor?.username ? `@${e.actor.username}` : handleOf(t);
  const to = e.counterparty ? shortAddress(e.counterparty) : "—";
  switch (e.kind) {
    case "collect":
      return `Gross ${s(e.gross)} · fee ${s(e.fee)} · net ${s(e.amount?.raw)}`;
    case "claim":
      return `By ${who} → ${to}`;
    case "routed":
      return `Creator ${shortAddress(t.creator)} bound ${handleOf(t)}`;
    case "expired":
      return `Released to creator ${to}`;
    case "exit":
      return `By the ${e.exitRole === "handle" ? "X account owner" : "creator"} → ${to}`;
  }
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-sans text-xs text-muted">{label}</dt>
      <dd className="m-0 mt-1">{children}</dd>
    </div>
  );
}

function Bucket({
  title,
  value,
  unit,
  children,
}: {
  title: string;
  value: ReactNode;
  unit: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <div className="text-sm text-muted">{title}</div>
      <div className="mt-2 font-mono text-[28px] leading-tight font-medium">
        {value} <span className="text-base">{unit}</span>
      </div>
      {children}
    </Card>
  );
}

function TxAnchor({ hash, children }: { hash: `0x${string}`; children: ReactNode }) {
  const url = explorerTxUrl(hash);
  if (!url) return <span className="font-mono">{children}</span>;
  return (
    <a className="font-mono" href={url} target="_blank" rel="noopener noreferrer" title={hash}>
      {children}
      <span aria-hidden>↗</span>
      <span className="sr-only"> (on the explorer)</span>
    </a>
  );
}

// ---------------------------------------------------------------- exits

function ExitDialog({ role, token: t }: { role: "handle" | "creator"; token: TokenDetail }) {
  const auth = useAuth();
  const { address: wallet } = useAccount();
  const queryClient = useQueryClient();
  const { mutateAsync: writeContract } = useWriteContract();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const contract = env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const handle = handleOf(t);

  const trimmed = input.trim();
  const recipient = isAddress(trimmed) ? getAddress(trimmed) : null;
  const sameAsSink = recipient !== null && isAddressEqual(recipient, t.sink);

  // Who may do this: the X owner logged in as this id, or the registering creator's wallet.
  const allowed =
    role === "handle"
      ? auth.xAccount?.userId === t.recipient.userId
      : Boolean(wallet && isAddressEqual(wallet, t.creator));
  const blocker =
    role === "handle"
      ? `Log in with X as ${handle} to do this.`
      : `Connect the registering creator wallet (${shortAddress(t.creator)}) to do this.`;

  const run = async () => {
    if (!contract || !recipient)
      throw new UserFacingError("Enter the new recipient wallet.", false);
    if (role === "creator") {
      return writeContract({
        address: contract,
        abi: feeFlowAbi,
        functionName: "exitByCreator",
        args: [t.address, recipient],
        chainId: appChain.id,
      });
    }
    const identityToken = await auth.getIdentityToken();
    if (!identityToken) throw new UserFacingError("Log in with X again, then try again.", false);
    const att = await requestExitAttestation({
      apiUrl: env.NEXT_PUBLIC_API_URL,
      identityToken,
      xUserId: t.recipient.userId,
      token: t.address,
      newRecipient: recipient,
    });
    return writeContract({
      address: contract,
      abi: feeFlowAbi,
      functionName: "exitByHandle",
      args: [t.address, att.newRecipient, att.expiry, att.nonce, att.attestation],
      chainId: appChain.id,
    });
  };

  const label = role === "handle" ? "Move future fees (X owner)" : "Move future fees (creator)";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={label}
        description={`Points this token's Pons creator fees at a wallet you choose. Only future fees move; amounts already credited stay claimable by ${handle}. This is public on the token page.`}
      >
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          New recipient wallet
          <input
            className={fieldCls}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={trimmed !== "" && (!recipient || sameAsSink)}
          />
        </label>
        {trimmed !== "" && !recipient ? (
          <p className="mt-2 mb-0 text-[13px] text-error">Enter a full wallet address (0x…).</p>
        ) : sameAsSink ? (
          <p className="mt-2 mb-0 text-[13px] text-error">Choose a different recipient wallet.</p>
        ) : null}
        {!allowed ? <p className="mt-3 mb-0 text-sm text-muted">{blocker}</p> : null}
        <TxButton
          className="mt-4"
          block
          label="Move future fees"
          pendingLabel="Moving…"
          noWalletLabel="Connect a wallet to continue"
          successToast="Future fees moved out of FeeFlow"
          disabled={!allowed || !recipient || sameAsSink}
          run={run}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["ds"] });
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
