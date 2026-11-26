import { decodeError } from "@feeflow/sdk";
import { describe, expect, it } from "vitest";
import { requestClaimAttestation, requestRegisterAttestation } from "./attest";

const TO = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const NOW = 1_800_000_000_000;
const SIG = `0x${"ab".repeat(65)}`;

function reply(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status });
}

const ok = (overrides: Record<string, unknown> = {}) =>
  reply(200, {
    xUserId: "1000000000",
    to: TO.toLowerCase(),
    nonce: "7",
    expiry: NOW / 1000 + 300,
    attestation: SIG,
    ...overrides,
  });

const call = (fetchImpl: typeof fetch, apiUrl: string | undefined = "https://api.example/") =>
  requestClaimAttestation({
    apiUrl,
    identityToken: "id-token",
    xUserId: "1000000000",
    to: TO,
    fetchImpl,
    now: () => NOW,
  });

const message = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => decodeError(e).message,
  );

describe("requestClaimAttestation", () => {
  it("posts the identity token and wallet, and returns a checked attestation", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return ok()();
    }) as unknown as typeof fetch;

    const att = await call(fetchImpl);
    expect(seen!.url).toBe("https://api.example/api/attest/claim");
    expect(seen!.init.method).toBe("POST");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer id-token");
    // The X id is never sent by the client: the service reads it from the identity token.
    expect(JSON.parse(seen!.init.body as string)).toEqual({ to: TO });
    expect(att).toEqual({
      xUserId: 1000000000n,
      to: TO,
      nonce: 7n,
      expiry: BigInt(NOW / 1000 + 300),
      attestation: SIG,
    });
  });

  it("refuses an attestation for another X account or wallet", async () => {
    expect(await message(call(ok({ xUserId: "42" }) as typeof fetch))).toBe(
      "The approval was for a different X account. Log in again.",
    );
    expect(
      await message(call(ok({ to: "0x0000000000000000000000000000000000000001" }) as typeof fetch)),
    ).toBe("The approval was for a different wallet. Try again.");
  });

  it("refuses expired or over-long expiries", async () => {
    expect(await message(call(ok({ expiry: NOW / 1000 - 1 }) as typeof fetch))).toBe(
      "Attestation expired. Your form is kept.",
    );
    expect(await message(call(ok({ expiry: NOW / 1000 + 3600 }) as typeof fetch))).toBe(
      "The FeeFlow approval service sent an invalid reply. Try again.",
    );
  });

  it("maps service failures to short messages", async () => {
    expect(await message(call(reply(401, {}) as typeof fetch))).toBe(
      "Your X login has expired. Log in with X again, then claim.",
    );
    expect(await message(call(reply(429, {}) as typeof fetch))).toBe(
      "Too many requests. Wait a minute, then try again.",
    );
    expect(await message(call(reply(500, {}) as typeof fetch))).toBe(
      "The FeeFlow approval service is unavailable. Try again.",
    );
    expect(await message(call(ok({ attestation: "nope" }) as typeof fetch))).toBe(
      "The FeeFlow approval service sent an invalid reply. Try again.",
    );
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await message(call(offline))).toBe(
      "The FeeFlow approval service could not be reached. Try again.",
    );
    expect(await message(call(ok() as typeof fetch, ""))).toBe(
      "The FeeFlow approval service is not set up yet.",
    );
  });
});

describe("requestRegisterAttestation", () => {
  const TOKEN = "0x00000000000000000000000000000000000000A1";
  const register = (body: Record<string, unknown>, status = 200) =>
    requestRegisterAttestation({
      apiUrl: "https://api.example",
      token: TOKEN,
      xUserId: "1234567890",
      fetchImpl: reply(status, body) as typeof fetch,
      now: () => NOW,
    });
  const good = {
    token: TOKEN.toLowerCase(),
    xUserId: "1234567890",
    nonce: "3",
    expiry: NOW / 1000 + 300,
    attestation: SIG,
  };

  it("returns a checked Register attestation", async () => {
    const att = await register(good);
    expect(att.xUserId).toBe(1234567890n);
    expect(att.nonce).toBe(3n);
  });

  it("refuses attestations for another token or id, and maps 404", async () => {
    expect(await message(register({ ...good, xUserId: "1" }))).toBe(
      "The approval did not match this token and X account. Try again.",
    );
    expect(
      await message(register({ ...good, token: "0x00000000000000000000000000000000000000b2" })),
    ).toBe("The approval did not match this token and X account. Try again.");
    expect(await message(register({}, 404))).toBe(
      "That X account could not be found. Check the handle.",
    );
  });
});
