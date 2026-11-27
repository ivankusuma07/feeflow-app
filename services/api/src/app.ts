import { randomBytes } from "node:crypto";
import { claimTypes, exitTypes, feeFlowDomain, registerTypes } from "@feeflow/sdk";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { z } from "zod";
import type { Attester } from "./attester";
import type { IdentityVerifier } from "./identity";
import { MAX_IMAGE_BYTES, PinUnavailableError, sniffImage, type ImagePinner } from "./ipfs";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { XUnavailableError, type XClient } from "./x-client";

export interface AppDeps {
  chainId: number;
  contract: Address;
  attester: Attester;
  identity: IdentityVerifier;
  /** Null when X_API_BEARER is unset: lookups and register attestations answer 503. */
  x: XClient | null;
  corsOrigins: string[];
  ttlSeconds: number;
  /** Reverse proxies in front; 0 = use the socket address. */
  trustedProxies: number;
  /** Socket address resolver (node server); tests pass a constant. */
  remoteAddress: (c: Context) => string | undefined;
  audit: (entry: Record<string, unknown>) => void;
  now?: () => number;
  limits?: { perIp: RateLimiter; perX: RateLimiter; uploads?: RateLimiter };
  /** Null when PINATA_JWT is unset: image uploads answer 503. */
  pinner?: ImagePinner | null;
}

const X_ID = /^[1-9]\d{0,19}$/;
const MAX_UINT64 = 2n ** 64n - 1n;
const IMAGE_PATH = "/api/ipfs/image";
const address = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), "invalid address")
  .transform((v) => getAddress(v))
  .refine((v) => v !== zeroAddress, "zero address");
const xUserId = z
  .string()
  .regex(X_ID)
  .refine((v) => BigInt(v) <= MAX_UINT64, "not a uint64");

const registerBody = z.object({ token: address, xUserId });
const claimBody = z.object({ to: address });
const exitBody = z.object({ token: address, newRecipient: address });

/** 128 random bits: the contract keeps a global `nonceUsed` set, so collisions must be negligible. */
const newNonce = () => BigInt(`0x${randomBytes(16).toString("hex")}`);

export function createApp(deps: AppDeps) {
  const now = deps.now ?? Date.now;
  const limits = deps.limits ?? {
    perIp: createRateLimiter(30, 60_000, now),
    perX: createRateLimiter(10, 60_000, now),
  };
  const uploads = limits.uploads ?? createRateLimiter(10, 60 * 60_000, now);
  const domain = feeFlowDomain(deps.chainId, deps.contract);
  const expiry = () => BigInt(Math.floor(now() / 1000) + deps.ttlSeconds);

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: deps.corsOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "authorization"],
      maxAge: 600,
    }),
  );
  const smallBody = bodyLimit({ maxSize: 4 * 1024 });
  const imageBody = bodyLimit({ maxSize: MAX_IMAGE_BYTES });
  app.use("*", (c, next) => (c.req.path === IMAGE_PATH ? imageBody : smallBody)(c, next));

  /** Behind N proxies, the client IP is the Nth entry from the right of X-Forwarded-For. */
  function clientIp(c: Context): string {
    if (deps.trustedProxies > 0) {
      const hops = (c.req.header("x-forwarded-for") ?? "").split(",").map((s) => s.trim());
      const ip = hops[hops.length - deps.trustedProxies];
      if (ip) return ip;
    }
    return deps.remoteAddress(c) ?? "unknown";
  }

  const fail = (c: Context, status: 400 | 401 | 404 | 413 | 429 | 503, error: string) =>
    c.json({ error }, status);

  function limited(c: Context, ...keys: string[]): boolean {
    if (!limits.perIp.take(`ip:${clientIp(c)}`)) return true;
    return keys.some((k) => !limits.perX.take(k));
  }

  async function bearerX(c: Context) {
    const m = /^Bearer (\S+)$/.exec(c.req.header("authorization") ?? "");
    return m ? deps.identity.verify(m[1]!) : null;
  }

  async function parse<T>(c: Context, schema: z.ZodType<T>): Promise<T | null> {
    const body = await c.req.json().catch(() => null);
    const r = schema.safeParse(body);
    return r.success ? r.data : null;
  }

  app.get("/health", (c) => c.json({ ok: true, attester: deps.attester.address }));

  // ------------------------------------------------------------- X handle lookup (for /route)
  app.get("/x/users", async (c) => {
    if (limited(c)) return fail(c, 429, "rate limited");
    const username = c.req.query("username") ?? "";
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return fail(c, 400, "invalid username");
    if (!deps.x) return fail(c, 503, "X lookup not configured");
    try {
      const user = await deps.x.byUsername(username);
      return user ? c.json(user) : fail(c, 404, "not found");
    } catch (e) {
      if (e instanceof XUnavailableError) return fail(c, 503, "X unavailable");
      throw e;
    }
  });

  // ------------------------------------------------------------- register: the id exists
  // Attests only that the X user id exists (brief correction 6), not that the caller owns it.
  app.post("/api/attest/register", async (c) => {
    const body = await parse(c, registerBody);
    if (!body) return fail(c, 400, "invalid request");
    if (limited(c, `register:${body.xUserId}`)) return fail(c, 429, "rate limited");
    if (!deps.x) return fail(c, 503, "X lookup not configured");
    let user;
    try {
      user = await deps.x.byId(body.xUserId);
    } catch (e) {
      if (e instanceof XUnavailableError) return fail(c, 503, "X unavailable");
      throw e;
    }
    if (!user) return fail(c, 404, "X account not found");

    const message = {
      token: body.token,
      xUserId: BigInt(body.xUserId),
      nonce: newNonce(),
      expiry: expiry(),
    };
    const attestation = await deps.attester.signTypedData({
      domain,
      types: registerTypes,
      primaryType: "Register",
      message,
    });
    deps.audit({ kind: "register", ...stringify(message), ip: clientIp(c) });
    return c.json({ ...stringify(message), attestation });
  });

  // ------------------------------------------------------------- claim: the session owns the id
  app.post("/api/attest/claim", async (c) => {
    if (limited(c)) return fail(c, 429, "rate limited");
    const x = await bearerX(c);
    if (!x) return fail(c, 401, "invalid identity token");
    const body = await parse(c, claimBody);
    if (!body) return fail(c, 400, "invalid request");
    if (limited(c, `x:${x.xUserId}`)) return fail(c, 429, "rate limited");

    const message = {
      xUserId: BigInt(x.xUserId),
      to: body.to,
      nonce: newNonce(),
      expiry: expiry(),
    };
    const attestation = await deps.attester.signTypedData({
      domain,
      types: claimTypes,
      primaryType: "Claim",
      message,
    });
    deps.audit({ kind: "claim", ...stringify(message), ip: clientIp(c) });
    return c.json({ ...stringify(message), attestation });
  });

  // ------------------------------------------------------------- exit by handle owner
  // The contract reads the token's xUserId from storage and rejects a mismatch, so an Exit for a
  // token bound to another account is useless; no chain read is needed here.
  app.post("/api/attest/exit", async (c) => {
    if (limited(c)) return fail(c, 429, "rate limited");
    const x = await bearerX(c);
    if (!x) return fail(c, 401, "invalid identity token");
    const body = await parse(c, exitBody);
    if (!body) return fail(c, 400, "invalid request");
    if (limited(c, `x:${x.xUserId}`)) return fail(c, 429, "rate limited");

    const message = {
      xUserId: BigInt(x.xUserId),
      token: body.token,
      newRecipient: body.newRecipient,
      nonce: newNonce(),
      expiry: expiry(),
    };
    const attestation = await deps.attester.signTypedData({
      domain,
      types: exitTypes,
      primaryType: "Exit",
      message,
    });
    deps.audit({ kind: "exit", ...stringify(message), ip: clientIp(c) });
    return c.json({ ...stringify(message), attestation });
  });

  // ------------------------------------------------------------- token image (for /launch)
  // Raw image bytes in the body. Pinned publicly on IPFS; Pons stores the URI at launch.
  app.post(IMAGE_PATH, async (c) => {
    if (!uploads.take(`upload:${clientIp(c)}`)) return fail(c, 429, "rate limited");
    if (!deps.pinner) return fail(c, 503, "image upload not configured");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) return fail(c, 400, "empty image");
    const type = sniffImage(bytes);
    if (!type) return fail(c, 400, "use a PNG, JPEG, GIF or WebP image");
    try {
      const uri = await deps.pinner.pin(bytes, type);
      deps.audit({ kind: "image", uri, bytes: bytes.length, type, ip: clientIp(c) });
      return c.json({ uri });
    } catch (e) {
      if (e instanceof PinUnavailableError) {
        deps.audit({ kind: "image-error", message: e.message });
        return fail(c, 503, "image upload unavailable");
      }
      throw e;
    }
  });

  app.notFound((c) => fail(c, 404, "not found"));
  app.onError((err, c) => {
    // Framework errors with their own status (413 from bodyLimit) are not server faults.
    if (err instanceof HTTPException && err.status < 500)
      return c.json(
        { error: err.status === 413 ? "request too large" : "bad request" },
        err.status,
      );
    deps.audit({ kind: "error", message: err.message });
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}

/** JSON has no bigint: uint fields go out as decimal strings, which the web client accepts. */
function stringify<T extends Record<string, unknown>>(m: T) {
  return Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
  ) as { [K in keyof T]: T[K] extends bigint ? string : T[K] };
}
