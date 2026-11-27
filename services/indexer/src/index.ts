import { feeFlowAbi, ponsFactoryAbi, ponsFeeEscrowAbi } from "@feeflow/abi";
import { NATIVE_ASSET_ADDRESS } from "@feeflow/config";
import { ipfsImageUrl, shortAddress } from "@feeflow/sdk";
import { and, asc, eq } from "ponder";
import { ponder, type Context } from "ponder:registry";
import {
  account,
  asset,
  assetTotals,
  batch,
  escrowSnapshot,
  token,
  tokenEvent,
} from "ponder:schema";
import type { Address, Hex } from "viem";
import { erc20MetaAbi, ponsCurveAbi, ponsTokenAbi } from "./abis";

type Ctx = Context;
const lower = (a: string) => a.toLowerCase() as Address;

interface LogRef {
  log: { logIndex: number };
  transaction: { hash: Hex };
  block: { number: bigint; timestamp: bigint };
}
const ref = (e: LogRef) => ({
  id: `${e.transaction.hash}-${e.log.logIndex}`,
  txHash: e.transaction.hash,
  blockNumber: Number(e.block.number),
  logIndex: e.log.logIndex,
  timestamp: Number(e.block.timestamp),
});

/** Reads that only feed display data: a failing token contract must not stop indexing. */
async function tryRead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

async function ensureAsset(context: Ctx, address: Address) {
  if (await context.db.find(asset, { address })) return;
  if (address === NATIVE_ASSET_ADDRESS) {
    await context.db.insert(asset).values({ address, symbol: "ETH", decimals: 18 });
    return;
  }
  const [symbol, decimals] = await Promise.all([
    tryRead(() =>
      context.client.readContract({
        retryEmptyResponse: false,
        abi: erc20MetaAbi,
        address,
        functionName: "symbol",
      }),
    ),
    tryRead(() =>
      context.client.readContract({
        retryEmptyResponse: false,
        abi: erc20MetaAbi,
        address,
        functionName: "decimals",
      }),
    ),
  ]);
  await context.db.insert(asset).values({
    address,
    symbol: symbol || shortAddress(address),
    decimals: decimals ?? 18,
  });
}

const ZERO_TOTALS = {
  collectedGross: 0n,
  feesTaken: 0n,
  credited: 0n,
  claimed: 0n,
  expiredToCreators: 0n,
  feesWithdrawn: 0n,
};
type TotalsDelta = Partial<typeof ZERO_TOTALS>;

async function addTotals(context: Ctx, assetAddress: Address, d: TotalsDelta) {
  await context.db
    .insert(assetTotals)
    .values({ asset: assetAddress, ...ZERO_TOTALS, ...d })
    .onConflictDoUpdate((row) => ({
      collectedGross: row.collectedGross + (d.collectedGross ?? 0n),
      feesTaken: row.feesTaken + (d.feesTaken ?? 0n),
      credited: row.credited + (d.credited ?? 0n),
      claimed: row.claimed + (d.claimed ?? 0n),
      expiredToCreators: row.expiredToCreators + (d.expiredToCreators ?? 0n),
      feesWithdrawn: row.feesWithdrawn + (d.feesWithdrawn ?? 0n),
    }));
}

async function markLoggedIn(context: Ctx, xUserId: string) {
  await context.db.update(account, { xUserId }).set({ hasLoggedIn: true });
}

// ------------------------------------------------------------------ registration

ponder.on("FeeFlow:TokenRegistered", async ({ event, context }) => {
  const { token: tokenAddr, xUserId, creator, sink } = event.args;
  const address = lower(tokenAddr);
  const pairAsset = lower(event.args.asset);
  const r = ref(event);
  await ensureAsset(context, pairAsset);

  const ff = context.contracts.FeeFlow;
  const factory = await context.client.readContract({
    abi: feeFlowAbi,
    address: ff.address,
    functionName: "FACTORY",
  });
  const [name, symbol, logo, launched, policy] = await Promise.all([
    tryRead(() =>
      context.client.readContract({
        retryEmptyResponse: false,
        abi: erc20MetaAbi,
        address: tokenAddr,
        functionName: "name",
      }),
    ),
    tryRead(() =>
      context.client.readContract({
        retryEmptyResponse: false,
        abi: erc20MetaAbi,
        address: tokenAddr,
        functionName: "symbol",
      }),
    ),
    tryRead(() =>
      context.client.readContract({
        retryEmptyResponse: false,
        abi: ponsTokenAbi,
        address: tokenAddr,
        functionName: "logo",
      }),
    ),
    tryRead(() =>
      context.client.readContract({
        retryEmptyResponse: false,
        abi: ponsFactoryAbi,
        address: factory,
        functionName: "getLaunchedToken",
        args: [tokenAddr],
      }),
    ),
    tryRead(() =>
      context.client.readContract({
        retryEmptyResponse: false,
        abi: ponsFactoryAbi,
        address: factory,
        functionName: "getLaunchFeePolicy",
        args: [tokenAddr],
      }),
    ),
  ]);

  const id = xUserId.toString();
  await context.db.insert(token).values({
    address,
    sink: lower(sink),
    xUserId: id,
    creator: lower(creator),
    asset: pairAsset,
    name: name || shortAddress(address),
    symbol: symbol || shortAddress(address),
    logo: ipfsImageUrl(logo) ? logo!.trim() : null,
    curve: launched?.exists ? lower(launched.curve) : null,
    routedAt: r.timestamp,
    routedTx: r.txHash,
    routedBlock: r.blockNumber,
    exited: false,
    credited: 0n,
    collectedGross: 0n,
    feesTaken: 0n,
    claimed: 0n,
    expiredToCreator: 0n,
    lastActivityAt: r.timestamp,
    protocolShareBps: policy?.protocolFeeShareBps ?? null,
    buybackBurnBps: policy?.buybackBurnBps ?? null,
  });
  await context.db
    .insert(account)
    .values({ xUserId: id, firstRoutedAt: r.timestamp, hasLoggedIn: false })
    .onConflictDoNothing();
  await context.db.insert(tokenEvent).values({
    ...r,
    token: address,
    xUserId: id,
    kind: "routed",
    asset: pairAsset,
    counterparty: lower(creator),
  });
});

// ------------------------------------------------------------------ collection

ponder.on("FeeFlow:Collected", async ({ event, context }) => {
  const { gross, fee, net, batchIndex, creditedAt } = event.args;
  const address = lower(event.args.token);
  const pairAsset = lower(event.args.asset);
  const r = ref(event);

  await addTotals(context, pairAsset, { collectedGross: gross, feesTaken: fee, credited: net });
  await context.db.update(token, { address }).set((row) => ({
    credited: row.credited + net,
    collectedGross: row.collectedGross + gross,
    feesTaken: row.feesTaken + fee,
    lastActivityAt: r.timestamp,
  }));
  if (net > 0n) {
    // Same-timestamp collections share one batch (the contract adds to the tail batch).
    await context.db
      .insert(batch)
      .values({
        token: address,
        index: Number(batchIndex),
        amount: net,
        creditedAt: Number(creditedAt),
        open: true,
      })
      .onConflictDoUpdate((row) => ({ amount: row.amount + net }));
  }
  await context.db.insert(tokenEvent).values({
    ...r,
    token: address,
    xUserId: event.args.xUserId.toString(),
    kind: "collect",
    asset: pairAsset,
    amount: net,
    gross,
    fee,
  });
});

// ------------------------------------------------------------------ claims

ponder.on("FeeFlow:Claimed", async ({ event, context }) => {
  const { amount, to } = event.args;
  const address = lower(event.args.token);
  const pairAsset = lower(event.args.asset);
  const xUserId = event.args.xUserId.toString();
  const r = ref(event);

  await addTotals(context, pairAsset, { claimed: amount });
  await context.db.update(token, { address }).set((row) => ({
    credited: 0n,
    claimed: row.claimed + amount,
    lastActivityAt: r.timestamp,
  }));
  // A claim pays the whole credit: every open batch closes (batchHead = batchTail).
  await context.db.sql
    .update(batch)
    .set({ open: false })
    .where(and(eq(batch.token, address), eq(batch.open, true)));
  await markLoggedIn(context, xUserId);
  await context.db.insert(tokenEvent).values({
    ...r,
    token: address,
    xUserId,
    kind: "claim",
    asset: pairAsset,
    amount,
    counterparty: lower(to),
  });
});

// ------------------------------------------------------------------ expiry

ponder.on("FeeFlow:Expired", async ({ event, context }) => {
  const { amount, creator, batches } = event.args;
  const address = lower(event.args.token);
  const pairAsset = lower(event.args.asset);
  const r = ref(event);
  const t = await context.db.find(token, { address });

  // `totals.credited` is cumulative on chain (expiry does not reduce it); mirror that exactly.
  await addTotals(context, pairAsset, { expiredToCreators: amount });
  await context.db.update(token, { address }).set((row) => ({
    credited: row.credited - amount,
    expiredToCreator: row.expiredToCreator + amount,
    lastActivityAt: r.timestamp,
  }));
  // releaseExpired pops the oldest `batches` batches from the head of the queue.
  const oldest = await context.db.sql
    .select({ index: batch.index })
    .from(batch)
    .where(and(eq(batch.token, address), eq(batch.open, true)))
    .orderBy(asc(batch.index))
    .limit(Number(batches));
  for (const b of oldest) {
    await context.db.update(batch, { token: address, index: b.index }).set({ open: false });
  }
  await context.db.insert(tokenEvent).values({
    ...r,
    token: address,
    xUserId: t?.xUserId ?? "0",
    kind: "expired",
    asset: pairAsset,
    amount,
    counterparty: lower(creator),
  });
});

// ------------------------------------------------------------------ exits

ponder.on("FeeFlow:Exited", async ({ event, context }) => {
  const { role, newRecipient } = event.args;
  const address = lower(event.args.token);
  const xUserId = event.args.xUserId.toString();
  const r = ref(event);
  const t = await context.db
    .update(token, { address })
    .set({ exited: true, lastActivityAt: r.timestamp });
  const exitRole = role === 0 ? "handle" : "creator";
  if (exitRole === "handle") await markLoggedIn(context, xUserId);
  await context.db.insert(tokenEvent).values({
    ...r,
    token: address,
    xUserId,
    kind: "exit",
    asset: t.asset,
    counterparty: lower(newRecipient),
    exitRole,
  });
});

// ------------------------------------------------------------------ protocol fee

ponder.on("FeeFlow:FeesWithdrawn", async ({ event, context }) => {
  await addTotals(context, lower(event.args.asset), { feesWithdrawn: event.args.amount });
});

// ------------------------------------------------------------------ escrow snapshot

/**
 * "Accrued, not yet sent" (brief §Indexer): each routed, not-exited token's balance waiting in
 * the Pons escrow for its sink, plus the curve's graduation flag. Runs on live blocks only.
 */
ponder.on("EscrowSnapshot:block", async ({ event, context }) => {
  const routed = await context.db.sql
    .select({
      address: token.address,
      sink: token.sink,
      asset: token.asset,
      curve: token.curve,
      graduated: escrowSnapshot.graduated,
    })
    .from(token)
    .leftJoin(escrowSnapshot, eq(escrowSnapshot.token, token.address))
    .where(eq(token.exited, false));
  // Nothing routed yet (this also covers blocks before FeeFlow is deployed).
  if (routed.length === 0) return;
  const escrow = await context.client.readContract({
    abi: feeFlowAbi,
    address: context.contracts.FeeFlow.address,
    functionName: "ESCROW",
  });

  const blockNumber = Number(event.block.number);
  const timestamp = Number(event.block.timestamp);
  for (let i = 0; i < routed.length; i += 20) {
    await Promise.all(
      routed.slice(i, i + 20).map(async (t) => {
        const balance = await tryRead(() =>
          t.asset === NATIVE_ASSET_ADDRESS
            ? context.client.readContract({
                retryEmptyResponse: false,
                abi: ponsFeeEscrowAbi,
                address: escrow,
                functionName: "balanceOf",
                args: [t.sink],
              })
            : context.client.readContract({
                retryEmptyResponse: false,
                abi: ponsFeeEscrowAbi,
                address: escrow,
                functionName: "balanceOfToken",
                args: [t.sink, t.asset],
              }),
        );
        // Graduation is one-way: stop reading the curve once it reports true.
        const graduated =
          t.graduated === true || !t.curve
            ? (t.graduated ?? null)
            : await tryRead(() =>
                context.client.readContract({
                  retryEmptyResponse: false,
                  abi: ponsCurveAbi,
                  address: t.curve!,
                  functionName: "graduated",
                }),
              );
        if (balance === null) return;
        await context.db
          .insert(escrowSnapshot)
          .values({ token: t.address, escrow: balance, graduated, blockNumber, timestamp })
          .onConflictDoUpdate({ escrow: balance, graduated, blockNumber, timestamp });
      }),
    );
  }
});
