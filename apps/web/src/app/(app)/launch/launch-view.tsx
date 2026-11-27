"use client";

import { ponsCurveBuyAbi, ponsLaunchAbi } from "@feeflow/abi";
import { knownPairAssets, NATIVE_ASSET_ADDRESS, THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import { decodeError, shortAddress, UserFacingError } from "@feeflow/sdk";
import { Button, Card, Note, Segmented, cn } from "@feeflow/ui";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { erc20Abi, formatUnits, zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { uploadTokenImage } from "@/api/ipfs";
import { lookupXUser, normalizeHandle, type XUser } from "@/api/x-users";
import { Avatar } from "@/components/app/avatar";
import { appChain, APP_CHAIN_ID } from "@/lib/chain";
import { env } from "@/lib/config";
import { TxButton } from "@/tx/tx-button";
import {
  byteLength,
  launchedFromLogs,
  launchParams,
  LIMITS,
  newSalt,
  parseBuy,
  parseTaxBps,
  routeHref,
  validateDraft,
  type LaunchDraft,
} from "./launch-form";

const fieldCls =
  "min-h-11 w-full rounded-[var(--radius-btn)] border border-line-strong bg-surface px-3 text-sm text-ink";

type Pair = "eth" | "usdg";

interface Launched {
  token: Address;
  curve: Address;
  pair: Pair;
  buy: bigint;
  handle: string;
}

export function LaunchView() {
  const { address: wallet } = useAccount();
  const factory = THIRD_PARTY_ADDRESSES[APP_CHAIN_ID]?.ponsFactory;
  const assets = knownPairAssets(APP_CHAIN_ID);
  const usdg = assets.find((a) => a.symbol === "USDG");

  // ---- form
  const [draft, setDraft] = useState<LaunchDraft>({
    name: "",
    symbol: "",
    description: "",
    logo: null,
    twitter: "",
    telegram: "",
    website: "",
    taxPct: "",
    buy: "",
  });
  const set = (patch: Partial<LaunchDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const [pair, setPair] = useState<Pair>("eth");
  const pairAsset = pair === "usdg" && usdg ? usdg : assets[0]!;
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [launched, setLaunched] = useState<Launched | null>(null);

  // ---- X account
  const [handleInput, setHandleInput] = useState("");
  const [handleQuery, setHandleQuery] = useState<string | null>(null);
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

  // ---- image: preview locally, pin on IPFS right away (Pons stores the URI at launch)
  const [preview, setPreview] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    set({ logo: null });
    setPreview(URL.createObjectURL(file));
    setUpload({ busy: true, error: null });
    try {
      const uri = await uploadTokenImage(env.NEXT_PUBLIC_API_URL, file);
      set({ logo: uri });
      setUpload({ busy: false, error: null });
    } catch (e) {
      setPreview(null);
      setUpload({ busy: false, error: decodeError(e).message });
    }
  };

  // ---- Pons reads
  const reads = { address: factory, abi: ponsLaunchAbi, chainId: appChain.id } as const;
  const launchFee = useReadContract({
    ...reads,
    functionName: "launchFee",
    query: { enabled: Boolean(factory) },
  });
  const maxTax = useReadContract({
    ...reads,
    functionName: "maxCreatorTaxBps",
    query: { enabled: Boolean(factory) },
  });
  const config = useReadContract({
    ...reads,
    functionName: "getLaunchConfig",
    args: [0n],
    query: { enabled: Boolean(factory) },
  });
  const canLaunch = useReadContract({
    ...reads,
    functionName: "canLaunch",
    args: wallet ? [wallet] : undefined,
    query: { enabled: Boolean(factory && wallet) },
  });
  const maxTaxBps = maxTax.data !== undefined ? Number(maxTax.data) : undefined;
  const baseFeeBps = config.data ? Number(config.data.curveFeeBps) : null;

  const errors = validateDraft(draft, { pairDecimals: pairAsset.decimals, maxTaxBps });
  const showErr = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const taxBps = parseTaxBps(draft.taxPct, maxTaxBps) ?? 0;
  const buyAmount = parseBuy(draft.buy, pairAsset.decimals) ?? 0n;
  const ready =
    Object.keys(errors).length === 0 &&
    Boolean(user) &&
    agreed &&
    !upload.busy &&
    launchFee.data !== undefined &&
    config.data?.enabled === true &&
    canLaunch.data !== false;

  const { mutateAsync: writeContract } = useWriteContract();
  const launchRun = async () => {
    setTouched(true);
    if (!factory) throw new UserFacingError("Pons is not available on this network.", false);
    if (!user) throw new UserFacingError("Choose the X account that receives the fees.", false);
    if (!ready) throw new UserFacingError("Complete the form first.", false);
    return writeContract({
      ...reads,
      address: factory,
      functionName: "launchToken",
      args: [
        launchParams(draft, newSalt(), maxTaxBps),
        0n,
        pair === "usdg" ? pairAsset.address : zeroAddress,
      ],
      value: launchFee.data,
    });
  };

  const fee = launchFee.data !== undefined ? `${formatUnits(launchFee.data, 18)} ETH` : "…";
  const tradeFee =
    baseFeeBps !== null
      ? `${pct(baseFeeBps)} base + ${pct(taxBps)} added = ${pct(baseFeeBps + taxBps)}`
      : "…";

  return (
    <>
      <Card className="px-6 py-7 sm:px-8">
        <p className="m-0 font-mono text-[13px] text-muted">For creators</p>
        <h1 className="mt-1.5 mb-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          Launch a token on Pons
        </h1>
        <p className="mt-2.5 mb-0 max-w-[640px] leading-relaxed text-muted">
          Create a Pons v2 token on Robinhood Chain and route its creator fees to an X account
          through FeeFlow. Your wallet signs every step.
        </p>
      </Card>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <Card className="px-5 py-6 sm:px-7 lg:col-span-7">
          {launched ? (
            <AfterLaunch launched={launched} wallet={wallet} pairAsset={pairAsset} />
          ) : (
            <form
              className="flex flex-col gap-5"
              noValidate
              onSubmit={(e) => e.preventDefault()}
              aria-label="Launch token"
            >
              <h2 className="m-0 text-xl font-semibold">Token details</h2>

              {/* X account */}
              <div>
                <div className="flex flex-wrap items-end gap-2.5">
                  <Field label="X account that receives the fees" className="min-w-[200px] flex-1">
                    {(id) => (
                      <input
                        id={id}
                        className={cn(fieldCls, "font-mono")}
                        value={handleInput}
                        onChange={(e) => setHandleInput(e.target.value)}
                        onBlur={() => handleInput.trim() && submitHandle()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            submitHandle();
                          }
                        }}
                        placeholder="@handle"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!handleInput.trim()}
                    onClick={submitHandle}
                  >
                    Find
                  </Button>
                </div>
                {lookup.isFetching ? (
                  <p className="mt-2 mb-0 text-sm text-muted" aria-live="polite">
                    Looking up the X account…
                  </p>
                ) : lookup.isError ? (
                  <p className="mt-2 mb-0 text-sm text-error" role="alert">
                    {decodeError(lookup.error).message}
                  </p>
                ) : lookup.isSuccess && !user ? (
                  <p className="mt-2 mb-0 text-sm text-error" role="alert">
                    No X account with that handle.
                  </p>
                ) : null}
                {user ? (
                  <div className="mt-2.5 flex items-center gap-3 rounded-[var(--radius-tile)] border border-line p-3">
                    <Avatar src={user.avatarUrl} label={user.name || user.username} size={40} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{user.name}</div>
                      <div className="truncate font-mono text-[13px] text-muted">
                        @{user.username} · user id {user.id}
                      </div>
                    </div>
                  </div>
                ) : touched ? (
                  <p className="mt-2 mb-0 text-[13px] text-error">Choose an X account.</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" error={showErr("name")}>
                  {(id) => (
                    <input
                      id={id}
                      className={fieldCls}
                      value={draft.name}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder="Ledger Cat"
                      maxLength={LIMITS.name}
                      autoComplete="off"
                    />
                  )}
                </Field>
                <Field label="Ticker" error={showErr("symbol")}>
                  {(id) => (
                    <input
                      id={id}
                      className={cn(fieldCls, "font-mono uppercase")}
                      value={draft.symbol}
                      onChange={(e) => set({ symbol: e.target.value.replace(/^\$/, "") })}
                      placeholder="LCAT"
                      maxLength={LIMITS.symbol}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                </Field>
              </div>

              {/* image */}
              <div>
                <span className="text-[13px] text-muted">Token image</span>
                <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-[var(--radius-tile)] border border-dashed border-line-strong p-3 hover:border-ink">
                  <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-[10px] bg-line">
                    {preview ? (
                      // A local blob preview; next/image does not load blob: URLs.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="" className="size-full object-cover" />
                    ) : (
                      <ImagePlus size={20} aria-hidden />
                    )}
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold">
                      {upload.busy
                        ? "Uploading to IPFS…"
                        : draft.logo
                          ? "Pinned on IPFS · change image"
                          : "Choose image"}
                    </span>
                    <span className="block text-[13px] text-muted">
                      PNG, JPEG, GIF or WebP, up to 1 MB. Permanent after launch.
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="sr-only"
                    onChange={(e) => void pickImage(e.target.files?.[0])}
                  />
                </label>
                {upload.error ? (
                  <p className="mt-2 mb-0 text-[13px] text-error" role="alert">
                    {upload.error}
                  </p>
                ) : null}
              </div>

              <Field
                label="Description (optional)"
                error={showErr("description")}
                hint={`${byteLength(draft.description.trim())}/${LIMITS.description} bytes`}
              >
                {(id) => (
                  <textarea
                    id={id}
                    className={cn(fieldCls, "min-h-24 py-2.5")}
                    value={draft.description}
                    onChange={(e) => set({ description: e.target.value })}
                    placeholder="What the token is."
                  />
                )}
              </Field>

              <details className="rounded-[var(--radius-tile)] border border-line px-3.5 py-2.5">
                <summary className="cursor-pointer text-sm font-semibold">
                  Social links (optional)
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {(
                    [
                      ["twitter", "X / Twitter", "https://x.com/…"],
                      ["telegram", "Telegram", "https://t.me/…"],
                      ["website", "Website", "https://…"],
                    ] as const
                  ).map(([k, label, ph]) => (
                    <Field key={k} label={label}>
                      {(id) => (
                        <input
                          id={id}
                          className={fieldCls}
                          value={draft[k]}
                          onChange={(e) => set({ [k]: e.target.value })}
                          placeholder={ph}
                          inputMode="url"
                          autoComplete="off"
                        />
                      )}
                    </Field>
                  ))}
                  {showErr("socials") ? (
                    <p className="m-0 text-[13px] text-error">{errors.socials}</p>
                  ) : null}
                </div>
              </details>

              <div>
                <span className="text-[13px] text-muted">Pair asset</span>
                <div className="mt-1.5">
                  <Segmented
                    label="Pair asset"
                    value={pair}
                    onChange={setPair}
                    options={[
                      { value: "eth", label: "ETH" },
                      ...(usdg ? [{ value: "usdg" as const, label: "USDG" }] : []),
                    ]}
                  />
                </div>
                <p className="mt-1.5 mb-0 text-[13px] text-muted">
                  What people buy and sell your token with. Fees are paid out in it.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Added creator tax (%)"
                  error={showErr("taxPct")}
                  hint={`0–${(maxTaxBps ?? 1000) / 100}%. Permanent after launch.`}
                >
                  {(id) => (
                    <input
                      id={id}
                      className={cn(fieldCls, "font-mono")}
                      value={draft.taxPct}
                      onChange={(e) => set({ taxPct: e.target.value })}
                      placeholder="0"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  )}
                </Field>
                <Field
                  label={`Initial buy in ${pairAsset.symbol} (optional)`}
                  error={showErr("buy")}
                  hint="Bought right after launch, from your wallet."
                >
                  {(id) => (
                    <input
                      id={id}
                      className={cn(fieldCls, "font-mono")}
                      value={draft.buy}
                      onChange={(e) => set({ buy: e.target.value })}
                      placeholder="0"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  )}
                </Field>
              </div>

              <Note tone="info">
                Your wallet pays the Pons launch fee ({fee}) plus gas, and stays the token&apos;s
                creator fee recipient until you route it to FeeFlow in the next step (sign, then two
                transactions). A token&apos;s address depends on its recipient, so Pons cannot
                launch it with FeeFlow as the recipient directly.
              </Note>

              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree to the <Link href="/terms">Terms</Link> and have read the{" "}
                  <Link href="/disclosures">Disclosures</Link>.
                </span>
              </label>

              {canLaunch.data === false ? (
                <p className="m-0 text-sm text-error" role="alert">
                  Pons is not accepting launches from this wallet right now.
                </p>
              ) : null}
              {config.data && !config.data.enabled ? (
                <p className="m-0 text-sm text-error" role="alert">
                  Pons launches are paused.
                </p>
              ) : null}

              <TxButton
                block
                requiresDeployment={false}
                label={`Launch ${draft.symbol.trim() ? `$${draft.symbol.trim().toUpperCase()}` : "token"} on Pons`}
                pendingLabel="Launching…"
                noWalletLabel="Connect a wallet to launch"
                successToast="Token launched on Pons"
                disabled={!ready}
                run={launchRun}
                onSuccess={(receipt) => {
                  const out = factory ? launchedFromLogs(receipt.logs, factory) : null;
                  if (out && user)
                    setLaunched({ ...out, pair, buy: buyAmount, handle: user.username });
                }}
              />
              {!ready && !touched ? (
                <button
                  type="button"
                  className="-mt-2 cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] text-muted underline"
                  onClick={() => setTouched(true)}
                >
                  What&apos;s missing?
                </button>
              ) : null}
            </form>
          )}
        </Card>

        {/* ---- preview */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:col-span-5">
          <Card className="p-3">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[12px] bg-line">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Token image preview" className="size-full object-cover" />
              ) : (
                <span className="font-mono text-5xl font-semibold text-muted" aria-hidden>
                  {(draft.symbol.trim() || "?").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="px-1.5 pt-3 pb-1">
              <p className="m-0 truncate text-lg font-semibold">
                {draft.name.trim() || "Token name"}{" "}
                <span className="font-mono text-sm font-normal text-muted">
                  ${draft.symbol.trim().toUpperCase() || "TICKER"}
                </span>
              </p>
              <dl className="mt-3 mb-0 grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                <dt className="text-muted">Fees route to</dt>
                <dd className="m-0 flex items-center justify-end gap-1.5 text-right">
                  {user ? (
                    <>
                      <Avatar src={user.avatarUrl} label={user.username} size={18} />@
                      {user.username}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Pair</dt>
                <dd className="m-0 text-right font-mono">{pairAsset.symbol}</dd>
                <dt className="text-muted">Trade fee</dt>
                <dd className="m-0 text-right font-mono">{tradeFee}</dd>
                <dt className="text-muted">FeeFlow fee</dt>
                <dd className="m-0 text-right font-mono">1% of collected fees</dd>
                <dt className="text-muted">Claim window</dt>
                <dd className="m-0 text-right font-mono">30 days per amount</dd>
                <dt className="text-muted">Launch fee</dt>
                <dd className="m-0 text-right font-mono">{fee}</dd>
              </dl>
            </div>
          </Card>
          <Card>
            <h2 className="m-0 text-base font-semibold">After launch</h2>
            <ol className="mt-2.5 mb-0 flex flex-col gap-1.5 pl-4.5 text-sm leading-normal text-muted">
              <li>Optional initial buy from your wallet.</li>
              <li>Sign the routing message (free).</li>
              <li>Register the token with FeeFlow.</li>
              <li>Point its Pons creator fees to FeeFlow.</li>
            </ol>
            <p className="mt-2.5 mb-0 text-sm leading-normal text-muted">
              Fees then go to the X account&apos;s FeeFlow balance; they claim with X login.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- after launch

function AfterLaunch({
  launched,
  wallet,
  pairAsset,
}: {
  launched: Launched;
  wallet: Address | undefined;
  pairAsset: { address: Address; symbol: string; decimals: number };
}) {
  const client = usePublicClient({ chainId: appChain.id });
  const { mutateAsync: writeContract } = useWriteContract();
  const [bought, setBought] = useState(launched.buy === 0n);
  const isErc20 = pairAsset.address.toLowerCase() !== NATIVE_ASSET_ADDRESS;
  const allowance = useReadContract({
    address: pairAsset.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: wallet ? [wallet, launched.curve] : undefined,
    chainId: appChain.id,
    query: { enabled: isErc20 && launched.buy > 0n && Boolean(wallet) },
  });
  const needsApproval = isErc20 && (allowance.data ?? 0n) < launched.buy;
  const amount = `${formatUnits(launched.buy, pairAsset.decimals)} ${pairAsset.symbol}`;

  const buyRun = async () => {
    if (!client || !wallet) throw new UserFacingError("Connect your wallet.", false);
    const call = {
      address: launched.curve,
      abi: ponsCurveBuyAbi,
      functionName: "buy",
      args: [launched.buy, 0n, wallet],
      value: isErc20 ? 0n : launched.buy,
      account: wallet,
      chain: appChain,
    } as const;
    // Quote by simulation, then accept at most 3% less (another buyer may land first).
    const { result } = await client.simulateContract(call);
    return writeContract({ ...call, args: [launched.buy, (result * 97n) / 100n, wallet] });
  };

  const href = useMemo(() => routeHref(launched.token, launched.handle), [launched]);

  return (
    <div>
      <h2 className="m-0 text-xl font-semibold">Token launched</h2>
      <p className="mt-2 mb-0 text-sm text-muted">
        Token <span className="font-mono text-ink">{shortAddress(launched.token)}</span> is live on
        Pons. Your wallet receives its creator fees until you route them.
      </p>

      {launched.buy > 0n ? (
        <Section title={`Initial buy · ${amount}`} done={bought}>
          {!bought ? (
            <div className="mt-3 flex flex-wrap gap-2.5">
              {needsApproval ? (
                <TxButton
                  requiresDeployment={false}
                  label={`Approve ${pairAsset.symbol}`}
                  pendingLabel="Approving…"
                  noWalletLabel="Connect a wallet"
                  successToast="Approved"
                  run={() =>
                    writeContract({
                      address: pairAsset.address,
                      abi: erc20Abi,
                      functionName: "approve",
                      args: [launched.curve, launched.buy],
                      chainId: appChain.id,
                    })
                  }
                  onSuccess={() => void allowance.refetch()}
                />
              ) : null}
              <TxButton
                requiresDeployment={false}
                label={`Buy ${amount}`}
                pendingLabel="Buying…"
                noWalletLabel="Connect a wallet"
                successToast="Bought"
                disabled={needsApproval}
                run={buyRun}
                onSuccess={() => setBought(true)}
              />
              <Button type="button" variant="ghost" onClick={() => setBought(true)}>
                Skip
              </Button>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title={`Route fees to @${launched.handle}`} done={false}>
        <p className="mt-2 mb-0 text-sm leading-relaxed text-muted">
          Sign once, then two transactions: register the token with FeeFlow and point its Pons
          creator fees to it.
        </p>
        <Button asChild className="mt-3.5" variant={bought ? "primary" : "secondary"}>
          <Link href={href}>Continue to routing</Link>
        </Button>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Section({ title, done, children }: { title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-line pt-5">
      <h3 className="m-0 flex items-center gap-2 text-base font-semibold">
        {title}
        {done ? <span className="font-mono text-[13px] font-normal text-muted">· done</span> : null}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] text-muted">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="m-0 text-[13px] text-error">{error}</p>
      ) : hint ? (
        <p className="m-0 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
