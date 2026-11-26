import { knownPairAssets } from "@feeflow/config";
import type { AccountToken, AccountView, Amount, TokenDetail, XAccount } from "@feeflow/sdk";
import type { Page, Route } from "@playwright/test";
import { getAddress, zeroAddress, type Address } from "viem";
import { ADDR, credited, escrowBalance, signClaim, signRegister, tokenInfo, X_USER } from "./chain";

export const INDEXER_URL = "http://indexer.e2e.test";
export const API_URL = "http://api.e2e.test";

const USDG = knownPairAssets(31337).find((a) => a.symbol === "USDG")!;
const amount = (raw: bigint): Amount => ({ asset: USDG, raw: raw.toString() });
const META = { name: "Demo USDG Token", symbol: "DEMO", pairAsset: USDG, imageUrl: null };
const ACCOUNT: XAccount = {
  userId: X_USER.id,
  username: X_USER.username,
  name: X_USER.name,
  avatarUrl: null,
  hasLoggedIn: true,
};

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

async function routedToken(token: Address) {
  const info = await tokenInfo(token);
  return info.sink === zeroAddress ? null : info;
}

/**
 * The indexer, answered from live Anvil state: only what the claim and token pages read.
 * Stage 4's Ponder service serves the same paths and shapes.
 */
async function indexer(route: Route) {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const { pathname } = new URL(req.url());

  if (pathname === "/api/keeper/status") {
    return json(route, 200, { lastRunAt: Math.floor(Date.now() / 1000), stale: false });
  }

  if (pathname === `/api/accounts/${X_USER.id}`) {
    const tokens: AccountToken[] = [];
    const info = await routedToken(ADDR.demoUsdgToken);
    if (info && info.xUserId.toString() === X_USER.id) {
      tokens.push({
        address: getAddress(ADDR.demoUsdgToken),
        ...META,
        graduated: false,
        claimable: amount(await credited(ADDR.demoUsdgToken)),
        pending: amount(await escrowBalance(info.sink)),
        oldestDeadline: null,
        oldestAmount: null,
        status: info.exited ? "exited" : "routed",
      });
    }
    const view: AccountView = { account: ACCOUNT, tokens, received: [], activity: [] };
    return json(route, 200, view);
  }

  const tokenMatch = /^\/api\/tokens\/(0x[0-9a-f]{40})$/.exec(pathname);
  if (tokenMatch && tokenMatch[1] === ADDR.demoUsdgToken.toLowerCase()) {
    const info = await routedToken(ADDR.demoUsdgToken);
    if (!info) return json(route, 404, { error: "not routed" });
    const escrow = await escrowBalance(info.sink);
    const cred = await credited(ADDR.demoUsdgToken);
    const detail: TokenDetail = {
      address: getAddress(ADDR.demoUsdgToken),
      ...META,
      graduated: false,
      recipient: ACCOUNT,
      status: info.exited ? "exited" : "routed",
      sink: info.sink,
      creator: info.creator,
      routedAt: Number(info.routedAt),
      totalPaid: amount(0n),
      accrued: amount(escrow),
      credited: amount(cred),
      lastActivityAt: null,
      buckets: {
        unswept: amount(0n),
        escrow: amount(escrow),
        credited: amount(cred),
        expirable: amount(0n),
      },
      batches: [],
      history: [],
      pendingTakeover: null,
      feePolicy: { creatorShareBps: null, protocolShareBps: null },
      claimsLast30d: 0,
      expiredToCreator: amount(0n),
    };
    return json(route, 200, detail);
  }

  return json(route, 404, { error: "not stubbed" });
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

    return json(route, 404, { error: "not stubbed" });
  };
}

export async function installStubs(page: Page, opts: ApiOptions = {}) {
  await page.route(`${INDEXER_URL}/**`, indexer);
  await page.route(`${API_URL}/**`, api(opts));
}
