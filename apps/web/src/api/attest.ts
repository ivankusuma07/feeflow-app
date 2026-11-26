import { UserFacingError } from "@feeflow/sdk";
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

/**
 * Client for the attestation service (`services/api`, brief §Attestation service):
 * `POST /api/attest/claim` verifies the Privy identity token server-side, reads the linked
 * X `subject` itself (never a client-sent id) and returns an EIP-712 `Claim{xUserId, to, nonce,
 * expiry}` signed by the attester, with expiry ≤ 10 minutes.
 */
export interface ClaimAttestation {
  xUserId: bigint;
  to: Address;
  nonce: bigint;
  /** Unix seconds. */
  expiry: bigint;
  attestation: Hex;
}

const uint = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]);
const responseSchema = z.object({
  xUserId: uint,
  to: z.string().refine((v) => isAddress(v), "invalid address"),
  nonce: uint,
  expiry: uint,
  attestation: z.string().refine((v) => isHex(v) && v.length > 2, "invalid signature"),
});

/** Brief: attestations expire within 10 minutes; anything longer is rejected client-side too. */
const MAX_TTL_SECONDS = 10n * 60n;

export interface RequestClaimAttestationArgs {
  apiUrl: string | undefined;
  identityToken: string;
  /** The logged-in X account id; the response must match it. */
  xUserId: string;
  to: Address;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function requestClaimAttestation({
  apiUrl,
  identityToken,
  xUserId,
  to,
  fetchImpl = fetch,
  now = Date.now,
}: RequestClaimAttestationArgs): Promise<ClaimAttestation> {
  if (!apiUrl) {
    throw new UserFacingError("The FeeFlow approval service is not set up yet.", false);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/api/attest/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${identityToken}` },
      body: JSON.stringify({ to }),
    });
  } catch {
    throw new UserFacingError("The FeeFlow approval service could not be reached. Try again.");
  }

  if (res.status === 401 || res.status === 403) {
    throw new UserFacingError("Your X login has expired. Log in with X again, then claim.");
  }
  if (res.status === 429) {
    throw new UserFacingError("Too many requests. Wait a minute, then try again.");
  }
  if (!res.ok) {
    throw new UserFacingError("The FeeFlow approval service is unavailable. Try again.");
  }

  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new UserFacingError("The FeeFlow approval service sent an invalid reply. Try again.");
  }
  const body = parsed.data;
  const result: ClaimAttestation = {
    xUserId: BigInt(body.xUserId),
    to: getAddress(body.to),
    nonce: BigInt(body.nonce),
    expiry: BigInt(body.expiry),
    attestation: body.attestation as Hex,
  };

  // Never send a transaction for a different account, wallet or an out-of-policy expiry.
  if (result.xUserId.toString() !== xUserId) {
    throw new UserFacingError("The approval was for a different X account. Log in again.", false);
  }
  if (result.to !== getAddress(to)) {
    throw new UserFacingError("The approval was for a different wallet. Try again.");
  }
  checkExpiry(result.expiry, now);
  return result;
}

// ---------------------------------------------------------------- register

/**
 * `POST /api/attest/register` (brief §Attestation service): the service checks the X user id
 * exists via the X API and signs `Register{token, xUserId, nonce, expiry}`. It attests only that
 * the id exists, not ownership; the creator's own Route signature is what binds the token.
 */
export interface RegisterAttestation {
  token: Address;
  xUserId: bigint;
  nonce: bigint;
  expiry: bigint;
  attestation: Hex;
}

const registerSchema = z.object({
  token: z.string().refine((v) => isAddress(v), "invalid address"),
  xUserId: uint,
  nonce: uint,
  expiry: uint,
  attestation: z.string().refine((v) => isHex(v) && v.length > 2, "invalid signature"),
});

export interface RequestRegisterAttestationArgs {
  apiUrl: string | undefined;
  token: Address;
  xUserId: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function requestRegisterAttestation({
  apiUrl,
  token,
  xUserId,
  fetchImpl = fetch,
  now = Date.now,
}: RequestRegisterAttestationArgs): Promise<RegisterAttestation> {
  if (!apiUrl) {
    throw new UserFacingError("The FeeFlow approval service is not set up yet.", false);
  }
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/api/attest/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, xUserId }),
    });
  } catch {
    throw new UserFacingError("The FeeFlow approval service could not be reached. Try again.");
  }
  if (res.status === 404) {
    throw new UserFacingError("That X account could not be found. Check the handle.", false);
  }
  if (res.status === 429) {
    throw new UserFacingError("Too many requests. Wait a minute, then try again.");
  }
  if (!res.ok) {
    throw new UserFacingError("The FeeFlow approval service is unavailable. Try again.");
  }
  const parsed = registerSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new UserFacingError("The FeeFlow approval service sent an invalid reply. Try again.");
  }
  const result: RegisterAttestation = {
    token: getAddress(parsed.data.token),
    xUserId: BigInt(parsed.data.xUserId),
    nonce: BigInt(parsed.data.nonce),
    expiry: BigInt(parsed.data.expiry),
    attestation: parsed.data.attestation as Hex,
  };
  if (result.token !== getAddress(token) || result.xUserId.toString() !== xUserId) {
    throw new UserFacingError("The approval did not match this token and X account. Try again.");
  }
  checkExpiry(result.expiry, now);
  return result;
}

function checkExpiry(expiry: bigint, now: () => number) {
  const nowSec = BigInt(Math.floor(now() / 1000));
  if (expiry <= nowSec) throw new UserFacingError("Attestation expired. Your form is kept.");
  if (expiry - nowSec > MAX_TTL_SECONDS + 60n) {
    throw new UserFacingError("The FeeFlow approval service sent an invalid reply. Try again.");
  }
}
