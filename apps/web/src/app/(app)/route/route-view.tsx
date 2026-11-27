"use client";

import { feeFlowAbi, ponsFactoryAbi, ponsOverrideAbi } from "@feeflow/abi";
import { knownPairAssets, sameAsset, THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import {
  decodeError,
  displaySymbol,
  feeFlowDomain,
  formatDate,
  routeTypes,
  shortAddress,
  UserFacingError,
} from "@feeflow/sdk";
import { Button, Card, Note, cn } from "@feeflow/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { erc20Abi, getAddress, isAddress, type Address, type Hex } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { requestRegisterAttestation } from "@/api/attest";
import { lookupXUser, normalizeHandle, type XUser } from "@/api/x-users";
import { Avatar } from "@/components/app/avatar";
import { appChain, APP_CHAIN_ID } from "@/lib/chain";
import { env } from "@/lib/config";
import { TxButton } from "@/tx/tx-button";
import { liveOverride, routeStatus, type RouteStatus } from "./route-status";

const fieldCls =
  "min-h-11 rounded-[var(--radius-btn)] border border-line-strong bg-surface px-3 text-sm text-ink";
/** Creator signatures stay valid for 30 minutes: long enough for both transactions. */
const SIGNATURE_TTL_SECONDS = 30n * 60n;

interface RouteSignature {
  token: Address;
  xUserId: string;
  signer: Address;
  deadline: bigint;
  signature: Hex;
}

export function RouteView() {
  const { address: wallet, chainId } = useAccount();
  const contract = env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const factory = THIRD_PARTY_ADDRESSES[APP_CHAIN_ID]?.ponsFactory;

  // /launch hands a new token over as ?token=…&handle=… (both checked like typed input).
  const params = useSearchParams();
  const [tokenInput, setTokenInput] = useState(() => params.get("token") ?? "");
  const [handleInput, setHandleInput] = useState(() => {
    const h = normalizeHandle(params.get("handle") ?? "");
    return h ? `@${h}` : "";
  });
  const [handleQuery, setHandleQuery] = useState<string | null>(() =>
    normalizeHandle(params.get("handle") ?? ""),
  );
  const [signed, setSigned] = useState<RouteSignature | null>(null);

  const trimmed = tokenInput.trim();
  const token = isAddress(trimmed) ? getAddress(trimmed) : null;

  // ---- reads: Pons is live; FeeFlow only once deployed
  const launched = useReadContract({
    address: factory,
    abi: ponsFactoryAbi,
    functionName: "getLaunchedToken",
    args: token ? [token] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(token && factory) },
  });
  // A pending Pons owner override would replace the sink once it matures (IPonsOverride.sol).
  const override = useReadContract({
    address: factory,
    abi: ponsOverrideAbi,
    functionName: "pendingCreatorFeeRecipient",
    args: token ? [token] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(token && factory) },
  });
  const info = useReadContract({
    address: contract,
    abi: feeFlowAbi,
    functionName: "tokens",
    args: token ? [token] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(token && contract) },
  });
  const predicted = useReadContract({
    address: contract,
    abi: feeFlowAbi,
    functionName: "predictSink",
    args: token ? [token] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(token && contract) },
  });

  const lt = launched.data;
  const pairAddress = lt?.exists ? lt.pairToken : undefined;
  const knownPair =
    pairAddress !== undefined
      ? knownPairAssets(APP_CHAIN_ID).find((a) => sameAsset(a, { address: pairAddress }))
      : undefined;
  const meta = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(token && lt?.exists) },
    // The third read is only used for pair assets the app doesn't know by name.
    contracts: [
      { address: token!, abi: erc20Abi, functionName: "name", chainId: appChain.id },
      { address: token!, abi: erc20Abi, functionName: "symbol", chainId: appChain.id },
      {
        address: pairAddress ?? token!,
        abi: erc20Abi,
        functionName: "symbol",
        chainId: appChain.id,
      },
    ],
  });
  const tokenName = meta.data?.[0]?.status === "success" ? String(meta.data[0].result) : null;
  const tokenSymbol = meta.data?.[1]?.status === "success" ? String(meta.data[1].result) : null;
  const pairSymbol = knownPair
    ? displaySymbol(knownPair, APP_CHAIN_ID)
    : meta.data?.[2]?.status === "success"
      ? displaySymbol(
          { address: pairAddress!, symbol: String(meta.data[2].result), decimals: 18 },
          APP_CHAIN_ID,
        )
      : null;

  const status: RouteStatus | null = lt
    ? routeStatus(
        lt,
        contract ? (info.data ?? null) : null,
        contract ? (predicted.data ?? null) : null,
        wallet,
        override.data
          ? {
              newRecipient: override.data[0],
              effectiveAt: override.data[1],
              expiresAt: override.data[2],
            }
          : null,
      )
    : null;
  const deployedReadsPending = Boolean(
    contract && token && (info.isPending || predicted.isPending),
  );

  // ---- X account lookup
  const lookup = useQuery({
    queryKey: ["x-user", handleQuery?.toLowerCase()],
    enabled: handleQuery !== null,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => lookupXUser(env.NEXT_PUBLIC_API_URL, handleQuery!),
  });
  const user: XUser | null = lookup.data ?? null;
  const submitHandle = () => {
    const h = normalizeHandle(handleInput);
    setHandleQuery(h ?? handleInput.trim());
  };

  // ---- writes
  const { mutateAsync: writeContract } = useWriteContract();
  const signature =
    signed &&
    token &&
    user &&
    wallet &&
    signed.token === token &&
    signed.xUserId === user.id &&
    signed.signer === wallet
      ? signed
      : null;

  const refetchAll = () => {
    void launched.refetch();
    void override.refetch();
    void info.refetch();
  };

  /** Re-read right before each write: a proposal can land after the page loaded. */
  const refuseIfOverridePending = async () => {
    const { data } = await override.refetch();
    if (!data) return;
    const o = liveOverride(
      { newRecipient: data[0], effectiveAt: data[1], expiresAt: data[2] },
      Math.floor(Date.now() / 1000),
    );
    if (o)
      throw new UserFacingError(
        `Pons has a pending override of this token's fee recipient (effective ${formatDate(o.effectiveAt)}). Routing is paused.`,
        false,
      );
  };

  const registerRun = async () => {
    if (!contract || !token || !user || !wallet)
      throw new UserFacingError("Complete steps 1–3 first.", false);
    await refuseIfOverridePending();
    if (!signature || signature.deadline <= BigInt(Math.floor(Date.now() / 1000))) {
      setSigned(null);
      throw new UserFacingError("The routing signature expired. Sign again.", false);
    }
    const att = await requestRegisterAttestation({
      apiUrl: env.NEXT_PUBLIC_API_URL,
      token,
      xUserId: user.id,
    });
    return writeContract({
      address: contract,
      abi: feeFlowAbi,
      functionName: "registerToken",
      args: [
        {
          token,
          xUserId: att.xUserId,
          creator: wallet,
          creatorDeadline: signature.deadline,
          nonce: att.nonce,
          expiry: att.expiry,
        },
        signature.signature,
        att.attestation,
      ],
      chainId: appChain.id,
    });
  };

  const sink =
    status?.kind === "needs-transfer" || status?.kind === "routed"
      ? status.sink
      : (predicted.data ?? null);
  const transferRun = async () => {
    if (!factory || !token || !sink) throw new UserFacingError("Register the token first.", false);
    await refuseIfOverridePending();
    return writeContract({
      address: factory,
      abi: ponsFactoryAbi,
      functionName: "transferCreatorFeeRecipient",
      args: [token, sink],
      chainId: appChain.id,
    });
  };

  // ---- step progress
  const registered =
    status?.kind === "needs-transfer" ||
    status?.kind === "routed" ||
    status?.kind === "registered-other";
  const tokenOk = status?.kind === "ready" || status?.kind === "needs-transfer";
  const transferNeeded = !(status?.kind === "ready" && !status.transferNeeded);
  const done = {
    1: tokenOk || status?.kind === "routed",
    2: Boolean(user) || registered,
    3: Boolean(signature) || registered,
    4: registered,
    5: status?.kind === "routed",
  };
  const current = ([1, 2, 3, 4, 5] as const).find((n) => !done[n]) ?? null;
  const handleLabel = user ? `@${user.username}` : null;

  return (
    <>
      <p className="m-0 font-mono text-[13px] text-muted">For creators</p>
      <h1 className="mt-1.5 mb-0 text-4xl font-semibold tracking-tight">
        Route a token to an X account
      </h1>
      <p className="mt-2.5 mb-0 max-w-[640px] leading-relaxed text-muted">
        Connect the wallet that currently receives this token&apos;s creator fees on Pons. Two
        transactions, a few minutes.
      </p>

      <div className="mt-7 grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <Card className="px-5 py-2 sm:px-7 lg:col-span-8">
          {/* 1 · Token */}
          <Step n={1} title="Token" done={done[1]} current={current === 1} first>
            <label className="mt-3 flex flex-col gap-1.5 text-[13px] text-muted">
              Token address
              <input
                className={cn(fieldCls, "font-mono")}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={trimmed !== "" && !token}
              />
            </label>
            {trimmed !== "" && !token ? (
              <p className="mt-2 mb-0 text-[13px] text-error">Enter a full token address (0x…).</p>
            ) : null}
            {token && !factory ? (
              <p className="mt-2 mb-0 text-[13px] text-muted">
                Pons is not available on this network.
              </p>
            ) : null}
            {token && launched.isPending && factory ? (
              <p className="mt-3 mb-0 text-sm text-muted" aria-live="polite">
                Checking the token on Pons…
              </p>
            ) : null}
            {launched.isError ? (
              <p className="mt-3 mb-0 text-sm text-error" role="alert">
                Could not read this token from Pons. Check your connection and try again.
              </p>
            ) : null}
            {status && !deployedReadsPending ? (
              <ul
                className="mt-3.5 mb-0 flex list-none flex-col gap-2 p-0 text-sm"
                aria-live="polite"
              >
                {status.kind === "not-pons" ? (
                  <CheckItem ok={false}>
                    This token was not launched by the Pons v2 factory.
                  </CheckItem>
                ) : (
                  <>
                    <CheckItem ok>
                      Launched by the Pons v2 factory
                      {tokenName ? ` · ${tokenName}${tokenSymbol ? ` ($${tokenSymbol})` : ""}` : ""}
                    </CheckItem>
                    <RecipientItem status={status} token={token!} />
                    {pairSymbol ? (
                      <CheckItem ok>
                        Pair asset {pairSymbol} · payouts in {pairSymbol}
                      </CheckItem>
                    ) : null}
                  </>
                )}
              </ul>
            ) : null}
          </Step>

          {/* 2 · X account */}
          <Step n={2} title="X account to receive fees" done={done[2]} current={current === 2}>
            {registered && status && "xUserId" in status ? (
              <p className="mt-2 mb-0 text-sm text-muted">
                Registered for X user id{" "}
                <span className="font-mono">{status.xUserId.toString()}</span>.
              </p>
            ) : (
              <>
                <form
                  className="mt-3 flex flex-wrap items-end gap-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitHandle();
                  }}
                >
                  <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-[13px] text-muted">
                    X handle
                    <input
                      className={cn(fieldCls, "font-mono")}
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value)}
                      onBlur={() => handleInput.trim() && submitHandle()}
                      placeholder="@handle"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={!tokenOk}
                    />
                  </label>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={!tokenOk || !handleInput.trim()}
                  >
                    Find
                  </Button>
                </form>
                {lookup.isFetching ? (
                  <p className="mt-3 mb-0 text-sm text-muted" aria-live="polite">
                    Looking up the X account…
                  </p>
                ) : lookup.isError ? (
                  <p className="mt-3 mb-0 text-sm text-error" role="alert">
                    {decodeError(lookup.error).message}
                  </p>
                ) : lookup.isSuccess && !user ? (
                  <p className="mt-3 mb-0 text-sm text-error" role="alert">
                    No X account with that handle.
                  </p>
                ) : null}
                {user ? (
                  <div className="mt-3 flex items-center gap-3.5 rounded-[var(--radius-tile)] border border-line p-3.5">
                    <Avatar src={user.avatarUrl} label={user.name || user.username} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{user.name}</div>
                      <div className="truncate font-mono text-[13px] text-muted">
                        @{user.username} · user id {user.id}
                      </div>
                    </div>
                  </div>
                ) : null}
                <p className="mt-2.5 mb-0 text-[13px] leading-normal text-muted">
                  Fees are bound to the numeric user id, so a handle rename does not break routing.
                  Check this is the right account.
                </p>
              </>
            )}
          </Step>

          {/* 3 · Sign */}
          <Step n={3} title="Sign the routing message" done={done[3]} current={current === 3}>
            <p className="mt-2 mb-0 text-sm leading-relaxed text-muted">
              Free, no gas. Your wallet is recorded as the token&apos;s creator: unclaimed amounts
              older than 30 days can be released to it, and it can move future fees out of FeeFlow
              later.
            </p>
            {!registered ? (
              <SignButton
                className="mt-3.5"
                contract={contract}
                ready={Boolean(tokenOk && token && user && wallet)}
                signed={Boolean(signature)}
                walletChainId={chainId}
                onSign={async (sign) => {
                  const deadline = BigInt(Math.floor(Date.now() / 1000)) + SIGNATURE_TTL_SECONDS;
                  const sig = await sign({
                    domain: feeFlowDomain(APP_CHAIN_ID, contract!),
                    types: routeTypes,
                    primaryType: "Route",
                    message: { token: token!, xUserId: BigInt(user!.id), deadline },
                  });
                  setSigned({
                    token: token!,
                    xUserId: user!.id,
                    signer: wallet!,
                    deadline,
                    signature: sig,
                  });
                }}
              />
            ) : null}
          </Step>

          {/* 4 · Register */}
          <Step n={4} title="Register with FeeFlow" done={done[4]} current={current === 4}>
            <p className="mt-2 mb-0 text-sm leading-relaxed text-muted">
              Transaction 1 of {transferNeeded ? 2 : 1}. Creates this token&apos;s fee sink
              {sink ? (
                <>
                  {" "}
                  at <span className="font-mono">{shortAddress(sink)}</span>
                </>
              ) : null}
              .
            </p>
            {!registered ? (
              <TxButton
                className="mt-3.5"
                label="Register token"
                pendingLabel="Registering…"
                noWalletLabel="Connect a wallet to register"
                successToast="Token registered"
                disabled={!signature}
                run={registerRun}
                onSuccess={refetchAll}
              />
            ) : null}
          </Step>

          {/* 5 · Pons transfer */}
          {transferNeeded ? (
            <Step n={5} title="Point Pons fees to FeeFlow" done={done[5]} current={current === 5}>
              <p className="mt-2 mb-0 text-sm leading-relaxed text-muted">
                Transaction 2 of 2, on the Pons factory.
              </p>
              <Note tone="warn" className="mt-3">
                <strong>Only future fees move.</strong> Claim anything already credited to your
                wallet on Pons first. It will not follow to FeeFlow.
              </Note>
              {status?.kind !== "routed" ? (
                <TxButton
                  className="mt-3.5"
                  label="Set FeeFlow as recipient"
                  pendingLabel="Updating Pons…"
                  noWalletLabel="Connect a wallet to continue"
                  successToast="Fees now route through FeeFlow"
                  disabled={status?.kind !== "needs-transfer"}
                  run={transferRun}
                  onSuccess={refetchAll}
                />
              ) : null}
            </Step>
          ) : null}

          {status?.kind === "routed" && token ? (
            <div className="border-t border-line py-6">
              <Note tone="info">
                <strong>Routed.</strong> Future creator fees on this token go through FeeFlow.{" "}
                <Link href={`/tokens/${token}`}>Open the token page</Link>.
              </Note>
            </div>
          ) : null}
        </Card>

        <aside className="flex flex-col gap-5 lg:col-span-4">
          <Card>
            <Image
              src="/illustrations/step2-route.webp"
              alt="A pipe rerouting coins to a profile"
              width={480}
              height={360}
              loading="eager"
              className="h-auto w-full mix-blend-multiply"
            />
            <h2 className="mt-2 mb-0 text-base font-semibold">What happens next</h2>
            <ul className="mt-2.5 mb-0 flex flex-col gap-2 pl-4.5 text-sm leading-normal text-muted">
              <li>
                Fees are collected into FeeFlow and credited to {handleLabel ?? "the X account"}.
              </li>
              <li>FeeFlow keeps a fixed 1% of each collection; 99% is credited.</li>
              <li>
                {handleLabel ?? "The X account"} claims with X login; each amount is claimable for
                30 days.
              </li>
              <li>After that, unreleased amounts can be sent back to your wallet.</li>
            </ul>
          </Card>
          <Card>
            <h2 className="m-0 text-base font-semibold">You can change this later</h2>
            <p className="mt-2 mb-0 text-sm leading-normal text-muted">
              You and the X account owner can both move future fees out of FeeFlow. Amounts already
              credited stay with the X account. Every change is public on the token page.
            </p>
          </Card>
          <Card>
            <h2 className="m-0 text-base font-semibold">Launching a new token?</h2>
            <p className="mt-2 mb-0 text-sm leading-normal text-muted">
              <Link href="/launch">Launch it on Pons from FeeFlow</Link>, then come back here with
              its address filled in.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- pieces

function Step({
  n,
  title,
  done,
  current,
  first,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  current: boolean;
  first?: boolean;
  children: ReactNode;
}) {
  const future = !done && !current;
  return (
    <section
      aria-current={current ? "step" : undefined}
      className={cn("grid grid-cols-[36px_1fr] gap-4 py-6", !first && "border-t border-line")}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-lg border font-mono font-medium",
          done ? "border-ink bg-accent" : future ? "border-line-strong text-muted" : "border-ink",
        )}
      >
        {n}
        {done ? <span className="sr-only"> (done)</span> : null}
      </span>
      <div className="min-w-0">
        <h2 className={cn("mt-1 mb-0 text-[17px] font-semibold", future && "text-muted")}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function CheckItem({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2", !ok && "text-error")}>
      {ok ? (
        <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
      ) : (
        <X size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
      )}
      <span>{children}</span>
    </li>
  );
}

function RecipientItem({ status, token }: { status: RouteStatus; token: Address }) {
  switch (status.kind) {
    case "ready":
      return status.transferNeeded ? (
        <CheckItem ok>Your wallet is the current creator fee recipient</CheckItem>
      ) : (
        <CheckItem ok>
          Launched with this token&apos;s FeeFlow sink as the creator fee recipient
        </CheckItem>
      );
    case "needs-transfer":
      return (
        <CheckItem ok>Registered with FeeFlow · point Pons fees to FeeFlow to finish</CheckItem>
      );
    case "routed":
      return (
        <CheckItem ok>
          Already routed through FeeFlow ·{" "}
          <Link href={`/tokens/${token}`}>open the token page</Link>
        </CheckItem>
      );
    case "registered-other":
      return (
        <CheckItem ok={false}>
          Registered with FeeFlow. Only the current creator fee recipient can finish routing.
        </CheckItem>
      );
    case "exited":
      return <CheckItem ok={false}>Future fees were already moved out of FeeFlow.</CheckItem>;
    case "not-recipient":
      return (
        <CheckItem ok={false}>
          Your wallet is not this token&apos;s current creator fee recipient on Pons.
        </CheckItem>
      );
    case "no-wallet":
      return (
        <CheckItem ok={false}>
          Connect the wallet that currently receives this token&apos;s creator fees.
        </CheckItem>
      );
    case "pons-override":
      return (
        <CheckItem ok={false}>
          Pons has a pending override of this token&apos;s creator fee recipient (effective{" "}
          {formatDate(status.effectiveAt)}). It would replace FeeFlow, so routing is paused.
        </CheckItem>
      );
    default:
      return null;
  }
}

type SignFn = ReturnType<typeof useSignTypedData>["mutateAsync"];

function SignButton({
  contract,
  ready,
  signed,
  walletChainId,
  onSign,
  className,
}: {
  contract: Address | undefined;
  ready: boolean;
  signed: boolean;
  walletChainId: number | undefined;
  onSign: (sign: SignFn) => Promise<void>;
  className?: string;
}) {
  const { mutateAsync } = useSignTypedData();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!contract) {
    return (
      <Button type="button" variant="inert" disabled className={className}>
        Not deployed yet
      </Button>
    );
  }
  if (signed) {
    return (
      <p className={cn("m-0 flex items-center gap-2 text-sm font-medium", className)}>
        <Check size={16} strokeWidth={2} aria-hidden /> Signed
      </p>
    );
  }
  if (ready && walletChainId !== undefined && walletChainId !== appChain.id) {
    return (
      <Button
        type="button"
        variant="secondary"
        className={className}
        disabled={switching}
        onClick={() => switchChain({ chainId: appChain.id })}
      >
        Switch to Robinhood Chain
      </Button>
    );
  }
  return (
    <div className={className}>
      {error ? (
        <p className="mt-0 mb-2 text-[13px] leading-snug text-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={!ready || busy}
        variant={ready ? "primary" : "inert"}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSign(mutateAsync);
          } catch (e) {
            setError(decodeError(e).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Confirm in wallet…" : error ? "Try again" : "Sign message"}
      </Button>
    </div>
  );
}
