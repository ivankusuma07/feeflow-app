import { claimTypes, exitTypes, feeFlowDomain, registerTypes } from "@feeflow/sdk";
import { getAddress, verifyTypedData, type Address, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppDeps } from "./app";
import { localAttester } from "./attester";
import type { IdentityVerifier } from "./identity";
import { createRateLimiter } from "./rate-limit";
import type { XClient, XUser } from "./x-client";
import { XUnavailableError } from "./x-client";

// Anvil account 1: a public test key.
const attester = localAttester(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const CONTRACT = getAddress("0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9");
const TOKEN = getAddress("0x00000000000000000000000000000000000000aa");
const WALLET = getAddress("0x00000000000000000000000000000000000000bb");
const NOW = 1_800_000_000_000;
const domain = feeFlowDomain(31337, CONTRACT);
const USER: XUser = { id: "1000000000", username: "example_one", name: "Example", avatarUrl: null };

const identity: IdentityVerifier = {
  verify: async (t) => (t === "good-token" ? { xUserId: USER.id, username: USER.username } : null),
};
const x: XClient = {
  byUsername: async (u) => (u.toLowerCase() === USER.username ? USER : null),
  byId: async (id) => (id === USER.id ? USER : null),
};

function setup(over: Partial<AppDeps> = {}) {
  const audit = vi.fn<(e: Record<string, unknown>) => void>();
  const app = createApp({
    chainId: 31337,
    contract: CONTRACT,
    attester,
    identity,
    x,
    corsOrigins: ["https://app.example"],
    ttlSeconds: 300,
    trustedProxies: 0,
    remoteAddress: () => "198.51.100.1",
    audit,
    now: () => NOW,
    ...over,
  });
  const post = (path: string, body: unknown, token?: string) =>
    app.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  return { app, post, audit };
}

const expiry = String(NOW / 1000 + 300);

describe("POST /api/attest/claim", () => {
  it("signs Claim for the X id in the identity token, never one from the body", async () => {
    const { post, audit } = setup();
    const res = await post("/api/attest/claim", { to: WALLET, xUserId: "999" }, "good-token");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toMatchObject({ xUserId: USER.id, to: WALLET, expiry });
    expect(BigInt(body.nonce!)).toBeGreaterThan(0n);
    const ok = await verifyTypedData({
      address: attester.address,
      domain,
      types: claimTypes,
      primaryType: "Claim",
      message: {
        xUserId: BigInt(USER.id),
        to: WALLET,
        nonce: BigInt(body.nonce!),
        expiry: BigInt(body.expiry!),
      },
      signature: body.attestation as Hex,
    });
    expect(ok).toBe(true);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "claim", xUserId: USER.id }),
    );
  });

  it("uses a fresh nonce per attestation", async () => {
    const { post } = setup();
    const a = (await (await post("/api/attest/claim", { to: WALLET }, "good-token")).json()) as {
      nonce: string;
    };
    const b = (await (await post("/api/attest/claim", { to: WALLET }, "good-token")).json()) as {
      nonce: string;
    };
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("rejects missing or invalid identity tokens with 401", async () => {
    const { post, audit } = setup();
    expect((await post("/api/attest/claim", { to: WALLET })).status).toBe(401);
    expect((await post("/api/attest/claim", { to: WALLET }, "bad")).status).toBe(401);
    expect(audit).not.toHaveBeenCalled();
  });

  it("rejects bad wallets with 400", async () => {
    const { post } = setup();
    expect((await post("/api/attest/claim", { to: "0x123" }, "good-token")).status).toBe(400);
    expect(
      (
        await post(
          "/api/attest/claim",
          { to: "0x0000000000000000000000000000000000000000" },
          "good-token",
        )
      ).status,
    ).toBe(400);
  });

  it("rate limits per X id", async () => {
    const { post } = setup({
      limits: { perIp: createRateLimiter(100, 60_000), perX: createRateLimiter(2, 60_000) },
    });
    expect((await post("/api/attest/claim", { to: WALLET }, "good-token")).status).toBe(200);
    expect((await post("/api/attest/claim", { to: WALLET }, "good-token")).status).toBe(200);
    expect((await post("/api/attest/claim", { to: WALLET }, "good-token")).status).toBe(429);
  });
});

describe("POST /api/attest/exit", () => {
  it("signs Exit bound to the session's X id, token and new recipient", async () => {
    const { post } = setup();
    const res = await post(
      "/api/attest/exit",
      { token: TOKEN, newRecipient: WALLET },
      "good-token",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toMatchObject({ xUserId: USER.id, token: TOKEN, newRecipient: WALLET, expiry });
    const ok = await verifyTypedData({
      address: attester.address,
      domain,
      types: exitTypes,
      primaryType: "Exit",
      message: {
        xUserId: BigInt(USER.id),
        token: TOKEN,
        newRecipient: WALLET,
        nonce: BigInt(body.nonce!),
        expiry: BigInt(body.expiry!),
      },
      signature: body.attestation as Hex,
    });
    expect(ok).toBe(true);
  });

  it("requires a valid identity token", async () => {
    const { post } = setup();
    expect((await post("/api/attest/exit", { token: TOKEN, newRecipient: WALLET })).status).toBe(
      401,
    );
  });
});

describe("POST /api/attest/register", () => {
  it("signs Register once the X id exists", async () => {
    const { post } = setup();
    const res = await post("/api/attest/register", {
      token: TOKEN.toLowerCase(),
      xUserId: USER.id,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toMatchObject({ token: TOKEN, xUserId: USER.id, expiry });
    const ok = await verifyTypedData({
      address: attester.address,
      domain,
      types: registerTypes,
      primaryType: "Register",
      message: {
        token: TOKEN as Address,
        xUserId: BigInt(USER.id),
        nonce: BigInt(body.nonce!),
        expiry: BigInt(body.expiry!),
      },
      signature: body.attestation as Hex,
    });
    expect(ok).toBe(true);
  });

  it("404s for unknown ids, 400 for malformed ones, 503 without X", async () => {
    const { post } = setup();
    expect((await post("/api/attest/register", { token: TOKEN, xUserId: "42" })).status).toBe(404);
    expect((await post("/api/attest/register", { token: TOKEN, xUserId: "0x1" })).status).toBe(400);
    expect(
      (await post("/api/attest/register", { token: TOKEN, xUserId: "99999999999999999999" }))
        .status,
    ).toBe(400); // > uint64
    const noX = setup({ x: null });
    expect(
      (await noX.post("/api/attest/register", { token: TOKEN, xUserId: USER.id })).status,
    ).toBe(503);
  });

  it("503s when X is unavailable instead of signing", async () => {
    const { post, audit } = setup({
      x: { byUsername: vi.fn(), byId: () => Promise.reject(new XUnavailableError("down")) },
    });
    expect((await post("/api/attest/register", { token: TOKEN, xUserId: USER.id })).status).toBe(
      503,
    );
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("GET /x/users", () => {
  it("returns the account, 404 for unknown, 400 for invalid handles", async () => {
    const { app } = setup();
    const ok = await app.request("/x/users?username=Example_One");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(USER);
    expect((await app.request("/x/users?username=nobody")).status).toBe(404);
    expect((await app.request("/x/users?username=bad-handle!")).status).toBe(400);
  });
});

describe("CORS and limits", () => {
  it("allows only the configured origin", async () => {
    const { app } = setup();
    const allowed = await app.request("/health", { headers: { origin: "https://app.example" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example");
    const other = await app.request("/health", { headers: { origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rate limits per client IP, read from X-Forwarded-For behind one proxy", async () => {
    const { app } = setup({
      trustedProxies: 1,
      limits: { perIp: createRateLimiter(1, 60_000), perX: createRateLimiter(100, 60_000) },
    });
    const get = (xff: string) =>
      app.request("/x/users?username=example_one", { headers: { "x-forwarded-for": xff } });
    expect((await get("spoofed, 203.0.113.5")).status).toBe(200);
    expect((await get("other-spoof, 203.0.113.5")).status).toBe(429);
    expect((await get("203.0.113.6")).status).toBe(200);
  });
});
