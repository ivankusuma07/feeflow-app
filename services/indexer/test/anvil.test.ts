/**
 * Ponder against a local Anvil deployment (brief §Testing: "Ponder against an Anvil fork").
 * Starts Anvil and `ponder start` (embedded PGlite), drives route → collect → claim → expire →
 * exit on chain, then checks every REST endpoint and runs the reconciliation against
 * `totals(asset)`. Run with `pnpm --filter @feeflow/indexer test:anvil` (needs Foundry).
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { feeFlowAbi } from "@feeflow/abi";
import { NATIVE_ASSET_ADDRESS, THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import {
  feeFlowDomain,
  registerTypes,
  routeTypes,
  claimTypes,
  type AccountView,
  type ClaimRecord,
  type LeaderboardEntry,
  type TokenDetail,
  type TokenSummary,
  type Totals,
} from "@feeflow/sdk";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indexedBlock, reconcile } from "../src/reconcile";

const ANVIL_PORT = 8547;
const PONDER_PORT = 42079;
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const API = `http://127.0.0.1:${PONDER_PORT}`;
const ROOT = path.resolve(import.meta.dirname, "..");
const bin = (name: string) => process.env[`${name.toUpperCase()}_BIN`] ?? name;

const pons = THIRD_PARTY_ADDRESSES[31337]!;
const FEEFLOW: Address = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const CREATOR: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const WALLET: Address = "0x00000000000000000000000000000000000c1a1e";
const addrOf = (label: string) => `0x${keccak256(toBytes(label)).slice(-40)}` as Address;
const USDG_TOKEN = addrOf("feeflow.demo.usdg");
const ETH_TOKEN = addrOf("feeflow.demo.eth");
const X_ID = 1000000000n;
/** Anvil account 1, the attester in DeployLocal (public, well-known test key). */
const attester = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const chain = defineChain({ ...anvil, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ chain, transport: http(RPC), account: CREATOR });
const testClient = createTestClient({ chain, transport: http(RPC), mode: "anvil" });
const escrowAbi = parseAbi([
  "function credit(address recipient) payable",
  "function creditToken(address recipient, address token, uint256 amount)",
]);
const domain = feeFlowDomain(31337, FEEFLOW);

let anvilProc: ChildProcess | undefined;
let ponderProc: ChildProcess | undefined;
let ponderLog = "";
let nonce = 1n;

async function send(hash: Promise<Hex>) {
  const r = await client.waitForTransactionReceipt({ hash: await hash });
  if (r.status !== "success") throw new Error(`tx reverted: ${r.transactionHash}`);
  return r;
}
const now = async () => (await client.getBlock()).timestamp;

async function register(token: Address) {
  const deadline = (await now()) + 600n;
  const creatorSig = await wallet.signTypedData({
    domain,
    types: routeTypes,
    primaryType: "Route",
    message: { token, xUserId: X_ID, deadline },
  });
  const att = { token, xUserId: X_ID, nonce: nonce++, expiry: deadline };
  const attestation = await attester.signTypedData({
    domain,
    types: registerTypes,
    primaryType: "Register",
    message: att,
  });
  await send(
    wallet.writeContract({
      address: FEEFLOW,
      abi: feeFlowAbi,
      functionName: "registerToken",
      args: [
        {
          token,
          xUserId: X_ID,
          creator: CREATOR,
          creatorDeadline: deadline,
          nonce: att.nonce,
          expiry: att.expiry,
        },
        creatorSig,
        attestation,
      ],
    }),
  );
  const info = await client.readContract({
    address: FEEFLOW,
    abi: feeFlowAbi,
    functionName: "tokens",
    args: [token],
  });
  return info.sink;
}

async function creditUsdg(sink: Address, amount: bigint) {
  await send(
    wallet.writeContract({
      address: pons.usdg,
      abi: erc20Abi,
      functionName: "approve",
      args: [pons.ponsEscrow, amount],
    }),
  );
  await send(
    wallet.writeContract({
      address: pons.ponsEscrow,
      abi: escrowAbi,
      functionName: "creditToken",
      args: [sink, pons.usdg, amount],
    }),
  );
}
const collect = (token: Address) =>
  send(
    wallet.writeContract({
      address: FEEFLOW,
      abi: feeFlowAbi,
      functionName: "collect",
      args: [token],
    }),
  );

async function claim(tokens: Address[]) {
  const expiry = (await now()) + 600n;
  const msg = { xUserId: X_ID, to: WALLET, nonce: nonce++, expiry };
  const attestation = await attester.signTypedData({
    domain,
    types: claimTypes,
    primaryType: "Claim",
    message: msg,
  });
  return send(
    wallet.writeContract({
      address: FEEFLOW,
      abi: feeFlowAbi,
      functionName: "claim",
      args: [X_ID, tokens, WALLET, expiry, msg.nonce, attestation],
    }),
  );
}

async function get<T>(p: string): Promise<T> {
  const res = await fetch(`${API}${p}`);
  if (!res.ok) throw new Error(`${p} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Waits until the indexer has processed the chain head. */
async function synced(timeoutMs = 60_000) {
  const head = await client.getBlockNumber();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await indexedBlock(API)) >= head) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`indexer did not reach block ${head}\n${ponderLog.slice(-3000)}`);
}

beforeAll(async () => {
  anvilProc = spawn(bin("anvil"), ["--port", String(ANVIL_PORT), "--silent"], { stdio: "ignore" });
  for (let i = 0; ; i++) {
    try {
      await client.getChainId();
      break;
    } catch {
      if (i > 100) throw new Error("anvil did not start");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  execFileSync(
    bin("forge"),
    [
      "script",
      "script/DeployLocal.s.sol",
      "--rpc-url",
      RPC,
      "--broadcast",
      "--unlocked",
      "--sender",
      CREATOR,
    ],
    { cwd: path.resolve(ROOT, "../../contracts"), stdio: "pipe" },
  );

  rmSync(path.join(ROOT, ".ponder"), { recursive: true, force: true });
  ponderProc = spawn(
    process.execPath,
    [
      path.join(ROOT, "node_modules/ponder/dist/esm/bin/ponder.js"),
      "start",
      "--schema",
      "e2e",
      "--port",
      String(PONDER_PORT),
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "test",
        CHAIN_ID: "31337",
        RPC_URL: RPC,
        DATABASE_URL: "",
        CONTRACT_ADDRESS: FEEFLOW,
        CONTRACT_DEPLOY_BLOCK: "0",
        CONFIRMATIONS: "0",
        SNAPSHOT_INTERVAL_BLOCKS: "1",
        CORS_ORIGIN: "http://localhost:3000",
        X_API_BEARER: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  ponderProc.stdout!.on("data", (d) => (ponderLog += d));
  ponderProc.stderr!.on("data", (d) => (ponderLog += d));

  // ---- the on-chain story
  const usdgSink = await register(USDG_TOKEN);
  const ethSink = await register(ETH_TOKEN);
  await creditUsdg(usdgSink, 150_000_000n); // 150 USDG
  await collect(USDG_TOKEN); // net 148.50
  await send(
    wallet.writeContract({
      address: pons.ponsEscrow,
      abi: escrowAbi,
      functionName: "credit",
      args: [ethSink],
      value: 10n ** 18n,
    }),
  );
  await collect(ETH_TOKEN); // net 0.99 ETH
  await claim([USDG_TOKEN, ETH_TOKEN]);
  await creditUsdg(usdgSink, 20_000_000n);
  await collect(USDG_TOKEN); // net 19.80, left unclaimed
  await testClient.increaseTime({ seconds: 31 * 86_400 });
  await testClient.mine({ blocks: 1 });
  await send(
    wallet.writeContract({
      address: FEEFLOW,
      abi: feeFlowAbi,
      functionName: "releaseExpired",
      args: [USDG_TOKEN, 10n],
    }),
  );
  await creditUsdg(usdgSink, 5_000_000n); // waits in the escrow: "accrued"
  await send(
    wallet.writeContract({
      address: FEEFLOW,
      abi: feeFlowAbi,
      functionName: "exitByCreator",
      args: [ETH_TOKEN, CREATOR],
    }),
  );
  await testClient.mine({ blocks: 2 });
  await synced();
}, 180_000);

afterAll(() => {
  ponderProc?.kill();
  anvilProc?.kill();
});

describe("indexer on Anvil", () => {
  it("serves protocol totals that reconcile with totals(asset) on chain", async () => {
    const t = await get<Totals>("/api/totals");
    expect(t.tokensRouted).toBe(2);
    expect(t.assets.map((a) => a.asset.symbol)).toEqual(["ETH", "USDG"]);
    const usdg = t.assets[1]!;
    expect(usdg).toMatchObject({
      collectedGross: "170000000",
      feesTaken: "1700000",
      credited: "168300000",
      claimed: "148500000",
      expiredToCreators: "19800000",
      unclaimed: "0",
    });
    expect(t.assets[0]).toMatchObject({ claimed: "990000000000000000", accrued: "0" });

    const drift = await reconcile({
      client,
      contract: FEEFLOW,
      totals: t,
      blockNumber: await indexedBlock(API),
    });
    expect(drift).toEqual([]);
  });

  it("serves the token page: buckets, open batches and history", async () => {
    const d = await get<TokenDetail>(`/api/tokens/${USDG_TOKEN}`);
    expect(d.status).toBe("routed");
    expect(d.recipient).toMatchObject({
      userId: X_ID.toString(),
      hasLoggedIn: true,
      username: null,
    });
    expect(d.buckets.credited.raw).toBe("0");
    expect(d.buckets.unswept).toBeNull();
    expect(d.batches).toEqual([]);
    expect(d.history.map((h) => h.kind)).toEqual([
      "expired",
      "collect",
      "claim",
      "collect",
      "routed",
    ]);
    expect(d.expiredToCreator.raw).toBe("19800000");
    expect(d.feePolicy.protocolShareBps).not.toBeUndefined();
    expect(d.history[0]!.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(d.history[0]!.blockNumber).toBeGreaterThan(0);

    const exited = await get<TokenDetail>(`/api/tokens/${ETH_TOKEN}`);
    expect(exited.status).toBe("exited");
    expect(exited.history[0]).toMatchObject({
      kind: "exit",
      exitRole: "creator",
      counterparty: CREATOR.toLowerCase(),
    });
  });

  it("shows escrow balances as accrued once a snapshot runs", async () => {
    // 5 USDG was credited to the sink after the expiry; the next collect would pull it.
    const d = await get<TokenDetail>(`/api/tokens/${USDG_TOKEN}`);
    expect(d.buckets.escrow.raw).toBe("5000000");
    expect(d.accrued.raw).toBe("5000000");
    const t = await get<Totals>("/api/totals");
    expect(t.assets[1]!.accrued).toBe("5000000");
  });

  it("serves the claim feed, account view, top tokens and leaderboard", async () => {
    const claims = await get<ClaimRecord[]>("/api/claims/recent?limit=5");
    expect(claims).toHaveLength(1);
    expect(claims[0]!.tokens).toHaveLength(2);
    expect(claims[0]!.to).toBe(WALLET.toLowerCase());

    const a = await get<AccountView>(`/api/accounts/${X_ID}`);
    expect(a.tokens.map((t) => t.status).sort()).toEqual(["exited", "routed"]);
    expect(a.activity.map((x) => x.label)).toContain("Claimed · 2 tokens");
    expect(a.received.find((r) => r.asset.symbol === "USDG")).toMatchObject({
      net: "168300000",
      claimed: "148500000",
    });

    const top = await get<TokenSummary[]>("/api/tokens/top?limit=10");
    expect(top[0]!.address).toBe(USDG_TOKEN.toLowerCase());

    const lb = await get<LeaderboardEntry[]>(`/api/leaderboard?period=all&asset=${pons.usdg}`);
    expect(lb).toEqual([
      expect.objectContaining({ rank: 1, received: expect.objectContaining({ raw: "168300000" }) }),
    ]);
    // Periods count back from wall-clock time; these collects happened seconds ago.
    const week = await get<LeaderboardEntry[]>(`/api/leaderboard?period=7d&asset=${pons.usdg}`);
    expect(week[0]!.received.raw).toBe("168300000");
    const eth = await get<LeaderboardEntry[]>(
      `/api/leaderboard?period=all&asset=${NATIVE_ASSET_ADDRESS}`,
    );
    expect(eth[0]!.received.raw).toBe("990000000000000000");
  });

  it("answers 404 for unknown ids and 400 for malformed input", async () => {
    expect((await fetch(`${API}/api/accounts/42`)).status).toBe(404);
    expect((await fetch(`${API}/api/tokens/0x${"1".repeat(40)}`)).status).toBe(404);
    expect((await fetch(`${API}/api/accounts/abc`)).status).toBe(400);
    expect((await fetch(`${API}/api/leaderboard?period=1y&asset=${pons.usdg}`)).status).toBe(400);
    expect((await fetch(`${API}/api/claims/recent?limit=1000`)).status).toBe(400);
  });
});
