import type { Page, Route } from "@playwright/test";
import { getAddress, type Address } from "viem";
import { signClaim, signRegister, X_USER } from "./chain";

export const API_URL = "http://api.e2e.test";
export const STUB_IMAGE_URI = "ipfs://bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    headers: { ...cors, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface ApiOptions {
  /** HTTP status for /api/attest/claim; anything but 200 skips signing. */
  claimStatus?: number;
}

/**
 * The Stage 4 attestation API and X proxy. Attestations are real EIP-712 signatures from the
 * local attester key, so the contract verifies them exactly as it will in production.
 */
function api(opts: ApiOptions) {
  return async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());

    if (url.pathname === "/x/users") {
      const username = url.searchParams.get("username")?.toLowerCase();
      return username === X_USER.username
        ? json(route, 200, {
            id: X_USER.id,
            username: X_USER.username,
            name: X_USER.name,
            avatarUrl: null,
          })
        : json(route, 404, { error: "not found" });
    }

    if (url.pathname === "/api/attest/register") {
      const body = req.postDataJSON() as { token: Address; xUserId: string };
      return json(route, 200, await signRegister(getAddress(body.token), body.xUserId));
    }

    if (url.pathname === "/api/attest/claim") {
      if ((opts.claimStatus ?? 200) !== 200) {
        return json(route, opts.claimStatus!, { error: "unavailable" });
      }
      if (req.headers()["authorization"] !== "Bearer mock-identity-token") {
        return json(route, 401, { error: "unauthorized" });
      }
      const body = req.postDataJSON() as { to: Address };
      return json(route, 200, await signClaim(X_USER.id, getAddress(body.to)));
    }

    if (url.pathname === "/api/ipfs/image") {
      // Pinata stands in: a fixed CIDv1, so the launched token's logo() is known.
      return json(route, 200, { uri: STUB_IMAGE_URI });
    }

    return json(route, 404, { error: "not stubbed" });
  };
}

/** Only the attestation API is stubbed; the indexer is the real service. */
export async function installStubs(page: Page, opts: ApiOptions = {}) {
  await page.route(`${API_URL}/**`, api(opts));
}
