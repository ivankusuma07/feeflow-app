import { indexerEnvSchema, knownPairAssets, parseServerEnv } from "@feeflow/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, count, desc, eq, gte, ilike, inArray, or, sql, sum } from "ponder";
import { db } from "ponder:api";
import {
  account,
  asset,
  assetTotals,
  batch,
  escrowSnapshot,
  token,
  tokenEvent,
} from "ponder:schema";
import { isAddress } from "viem";
import {
  accountView,
  claimRecords,
  leaderboard,
  pairAsset,
  tokenDetail,
  tokenSummary,
  totals,
  type Lookups,
} from "../views";
import { createKeeperStatus } from "../keeper-status";
import { createXProfiles, noXProfiles } from "../x-profiles";
import {
  likeLiteral,
  parseLeaderboardQuery,
  parseLimit,
  parseTokenListQuery,
  X_USER_ID,
} from "./params";

const env = parseServerEnv(indexerEnvSchema, process.env, "indexer");
const profiles = env.X_API_BEARER ? createXProfiles(env.X_API_BEARER) : noXProfiles;
const knownFirst = knownPairAssets(env.CHAIN_ID).map((a) => a.address);
const nowSeconds = () => Math.floor(Date.now() / 1000);
const keeperStatus = createKeeperStatus({
  healthUrl: env.KEEPER_HEALTH_URL,
  staleAfterSeconds: env.KEEPER_STALE_AFTER,
});

/** Assets, account flags and X display data for the X ids in one response. */
async function lookups(xUserIds: string[]): Promise<Lookups> {
  const ids = [...new Set(xUserIds)];
  const [assetRows, accountRows, profileMap] = await Promise.all([
    db.select().from(asset),
    ids.length ? db.select().from(account).where(inArray(account.xUserId, ids)) : [],
    profiles.get(ids),
  ]);
  return {
    assets: new Map(assetRows.map((a) => [a.address, a])),
    accounts: new Map(accountRows.map((a) => [a.xUserId, a])),
    profiles: profileMap,
  };
}

async function snapshotsFor(addresses: `0x${string}`[]) {
  if (!addresses.length) return new Map<string, typeof escrowSnapshot.$inferSelect>();
  const rows = await db
    .select()
    .from(escrowSnapshot)
    .where(inArray(escrowSnapshot.token, addresses));
  return new Map(rows.map((r) => [r.token, r]));
}

const app = new Hono();

app.use(
  "/api/*",
  cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()), allowMethods: ["GET"] }),
);
// Never cached: a page reloaded right after the user's own claim or collect must not show the
// state from before it.
app.use("/api/*", async (c, next) => {
  await next();
  c.header("cache-control", "no-store");
});

app.get("/api/totals", async (c) => {
  const [rows, accrued, routed] = await Promise.all([
    db.select().from(assetTotals),
    db
      .select({ asset: token.asset, escrow: sum(escrowSnapshot.escrow) })
      .from(escrowSnapshot)
      .innerJoin(token, eq(token.address, escrowSnapshot.token))
      .where(eq(token.exited, false))
      .groupBy(token.asset),
    db.select({ n: count() }).from(token),
  ]);
  const l = await lookups([]);
  return c.json(
    totals(
      l,
      rows,
      new Map(accrued.map((r) => [r.asset, BigInt(r.escrow ?? 0)])),
      routed[0]?.n ?? 0,
      knownFirst,
      nowSeconds(),
    ),
  );
});

app.get("/api/claims/recent", async (c) => {
  const limit = parseLimit(c.req.query("limit"));
  if (limit === null) return c.json({ error: "invalid limit" }, 400);
  // A claim tx emits one log per token; read enough logs to fill `limit` grouped rows.
  const events = await db
    .select()
    .from(tokenEvent)
    .where(eq(tokenEvent.kind, "claim"))
    .orderBy(desc(tokenEvent.blockNumber), desc(tokenEvent.logIndex))
    .limit(limit * 10);
  const addrs = [...new Set(events.map((e) => e.token))];
  const tokens = addrs.length
    ? await db.select().from(token).where(inArray(token.address, addrs))
    : [];
  const l = await lookups(events.map((e) => e.xUserId));
  return c.json(
    claimRecords(l, events, new Map(tokens.map((t) => [t.address, t]))).slice(0, limit),
  );
});

/**
 * Every routed token, a page at a time (Explore). `sort=recent` is newest first; `sort=paid`
 * ranks by the amount claimed and needs `asset`. `q` matches name, symbol or an address prefix.
 */
app.get("/api/tokens", async (c) => {
  const q = parseTokenListQuery({
    sort: c.req.query("sort"),
    asset: c.req.query("asset"),
    q: c.req.query("q"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  if (!q) return c.json({ error: "invalid query" }, 400);
  const filters = [
    q.asset ? eq(token.asset, q.asset) : undefined,
    q.q
      ? or(
          ilike(token.name, `%${likeLiteral(q.q)}%`),
          ilike(token.symbol, `%${likeLiteral(q.q)}%`),
          ilike(token.address, `${likeLiteral(q.q)}%`),
        )
      : undefined,
  ].filter((f) => f !== undefined);
  const order =
    q.sort === "paid"
      ? [desc(token.claimed), desc(token.routedBlock), desc(token.address)]
      : [desc(token.routedBlock), desc(token.address)];
  // One extra row tells whether another page exists.
  const rows = await db
    .select()
    .from(token)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(...order)
    .limit(q.limit + 1)
    .offset(q.offset);
  const page = rows.slice(0, q.limit);
  const [snaps, l] = await Promise.all([
    snapshotsFor(page.map((t) => t.address)),
    lookups(page.map((t) => t.xUserId)),
  ]);
  return c.json({
    tokens: page.map((t) => tokenSummary(l, t, snaps.get(t.address))),
    hasMore: rows.length > q.limit,
  });
});

/**
 * Top tokens by activity (collections and claims). Amounts in different assets are never
 * compared, so the ranking counts fee events rather than summing values across assets.
 */
app.get("/api/tokens/top", async (c) => {
  const limit = parseLimit(c.req.query("limit"));
  if (limit === null) return c.json({ error: "invalid limit" }, 400);
  const ranked = await db
    .select({ token: tokenEvent.token, n: count() })
    .from(tokenEvent)
    .where(inArray(tokenEvent.kind, ["collect", "claim"]))
    .groupBy(tokenEvent.token)
    .orderBy(desc(count()), desc(sql`max(${tokenEvent.timestamp})`))
    .limit(limit);
  // Fill with the newest routed tokens when few have fee activity yet.
  const extra =
    ranked.length < limit
      ? await db.select().from(token).orderBy(desc(token.routedBlock)).limit(limit)
      : [];
  const order = [...new Set([...ranked.map((r) => r.token), ...extra.map((t) => t.address)])].slice(
    0,
    limit,
  );
  if (!order.length) return c.json([]);
  const rows = await db.select().from(token).where(inArray(token.address, order));
  const byAddr = new Map(rows.map((t) => [t.address, t]));
  const [snaps, l] = await Promise.all([snapshotsFor(order), lookups(rows.map((t) => t.xUserId))]);
  return c.json(order.map((a) => tokenSummary(l, byAddr.get(a)!, snaps.get(a))));
});

app.get("/api/leaderboard", async (c) => {
  const q = parseLeaderboardQuery(
    { period: c.req.query("period"), asset: c.req.query("asset"), limit: c.req.query("limit") },
    nowSeconds(),
  );
  if (!q) return c.json({ error: "invalid query" }, 400);
  const received = sum(tokenEvent.amount);
  const rows = await db
    .select({ xUserId: tokenEvent.xUserId, received })
    .from(tokenEvent)
    .where(
      and(
        eq(tokenEvent.kind, "collect"),
        eq(tokenEvent.asset, q.asset),
        gte(tokenEvent.timestamp, q.since),
      ),
    )
    .groupBy(tokenEvent.xUserId)
    .orderBy(desc(received))
    .limit(q.limit);
  const l = await lookups(rows.map((r) => r.xUserId));
  return c.json(
    leaderboard(
      l,
      pairAsset(l, q.asset),
      rows.map((r) => ({ xUserId: r.xUserId, received: BigInt(r.received ?? 0) })),
      q.limit,
    ),
  );
});

app.get("/api/accounts/:xUserId", async (c) => {
  const id = c.req.param("xUserId");
  if (!X_USER_ID.test(id)) return c.json({ error: "invalid X user id" }, 400);
  const tokens = await db.select().from(token).where(eq(token.xUserId, id));
  if (!tokens.length) return c.json({ error: "not found" }, 404);
  const addrs = tokens.map((t) => t.address);
  const [batches, events, snaps, l] = await Promise.all([
    db
      .select()
      .from(batch)
      .where(and(inArray(batch.token, addrs), eq(batch.open, true))),
    db
      .select()
      .from(tokenEvent)
      .where(and(eq(tokenEvent.xUserId, id), inArray(tokenEvent.kind, ["collect", "claim"])))
      .orderBy(desc(tokenEvent.blockNumber), desc(tokenEvent.logIndex))
      .limit(100),
    snapshotsFor(addrs),
    lookups([id]),
  ]);
  return c.json(accountView(l, id, tokens, snaps, batches, events));
});

app.get("/api/tokens/:address", async (c) => {
  const raw = c.req.param("address");
  if (!isAddress(raw, { strict: false })) return c.json({ error: "invalid address" }, 400);
  const address = raw.toLowerCase() as `0x${string}`;
  const [t] = await db.select().from(token).where(eq(token.address, address));
  if (!t) return c.json({ error: "not found" }, 404);
  const [batches, events, snaps] = await Promise.all([
    db
      .select()
      .from(batch)
      .where(and(eq(batch.token, address), eq(batch.open, true))),
    db
      .select()
      .from(tokenEvent)
      .where(eq(tokenEvent.token, address))
      .orderBy(desc(tokenEvent.blockNumber), desc(tokenEvent.logIndex))
      .limit(200),
    snapshotsFor([address]),
  ]);
  const l = await lookups([t.xUserId, ...events.map((e) => e.xUserId)]);
  return c.json(tokenDetail(l, t, snaps.get(address), batches, events, nowSeconds()));
});

app.get("/api/keeper/status", async (c) => c.json(await keeperStatus()));

/**
 * Work list for services/keeper: every routed token with what the keeper needs to decide.
 * Public data only; the keeper re-reads balances and expirable amounts on chain before acting.
 */
app.get("/api/keeper/work", async (c) => {
  const [tokens, oldest, snaps] = await Promise.all([
    db.select().from(token),
    db
      .select({ token: batch.token, creditedAt: sql<number>`min(${batch.creditedAt})` })
      .from(batch)
      .where(eq(batch.open, true))
      .groupBy(batch.token),
    db.select().from(escrowSnapshot),
  ]);
  const oldestBy = new Map(oldest.map((o) => [o.token, Number(o.creditedAt)]));
  const snapBy = new Map(snaps.map((s) => [s.token, s]));
  return c.json(
    tokens.map((t) => ({
      token: t.address,
      sink: t.sink,
      asset: t.asset,
      curve: t.curve,
      exited: t.exited,
      graduated: snapBy.get(t.address)?.graduated ?? false,
      credited: t.credited.toString(),
      oldestCreditedAt: oldestBy.get(t.address) ?? null,
    })),
  );
});

export default app;
