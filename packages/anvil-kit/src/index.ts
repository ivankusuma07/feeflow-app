/**
 * Test-only: a local Anvil chain with contracts/script/DeployLocal.s.sol, helpers that play the
 * on-chain story (route, fees, collect, claim, expiry, exit), and child processes for Ponder and
 * the keeper. Every key here is one of Anvil's public, well-known test keys.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feeFlowAbi } from "@feeflow/abi";
import { THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import { claimTypes, feeFlowDomain, registerTypes, routeTypes } from "@feeflow/sdk";
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

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bin = (name: string) => process.env[`${name.toUpperCase()}_BIN`] ?? name;
const addrOf = (label: string) => `0x${keccak256(toBytes(label)).slice(-40)}` as Address;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pons = THIRD_PARTY_ADDRESSES[31337]!;
/** Deterministic DeployLocal addresses on a fresh Anvil (deployer = account 0). */
export const ADDR = {
  feeFlow: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  factory: pons.ponsFactory,
  escrow: pons.ponsEscrow,
  usdg: pons.usdg,
  usdgToken: addrOf("feeflow.demo.usdg"),
  ethToken: addrOf("feeflow.demo.eth"),
} as const satisfies Record<string, Address>;

/** Anvil account 0: deployer, creator of both demo tokens, FEE_RECIPIENT and ADMIN. */
export const CREATOR: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
/** Anvil account 1: the attester in DeployLocal. */
const attester = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
/** Anvil account 2: used as the keeper's hot wallet in tests. */
export const KEEPER_TEST_KEY: Hex =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
export const X_ID = 1000000000n;
export const CLAIM_WALLET: Address = "0x00000000000000000000000000000000000c1a1e";

const escrowAbi = parseAbi([
  "function credit(address recipient) payable",
  "function creditToken(address recipient, address token, uint256 amount)",
]);

export type Chain = ReturnType<typeof localChain>;

/** Clients and story helpers for an Anvil node on `port`. */
export function localChain(port: number) {
  const rpc = `http://127.0.0.1:${port}`;
  const chain = defineChain({ ...anvil, rpcUrls: { default: { http: [rpc] } } });
  const client = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ chain, transport: http(rpc), account: CREATOR });
  const test = createTestClient({ chain, transport: http(rpc), mode: "anvil" });
  const domain = feeFlowDomain(31337, ADDR.feeFlow);
  let nonce = 1n;
  let proc: ChildProcess | undefined;

  async function send(hash: Promise<Hex>) {
    const r = await client.waitForTransactionReceipt({ hash: await hash });
    if (r.status !== "success") throw new Error(`tx reverted: ${r.transactionHash}`);
    return r;
  }
  const now = async () => (await client.getBlock()).timestamp;
  const ff = (functionName: string, args: readonly unknown[], value?: bigint) =>
    send(
      wallet.writeContract({
        address: ADDR.feeFlow,
        abi: feeFlowAbi,
        functionName,
        args,
        value,
      } as never),
    );

  return {
    rpc,
    client,
    test,

    /** Starts Anvil and deploys DeployLocal. */
    async start() {
      proc = spawn(bin("anvil"), ["--port", String(port), "--silent"], { stdio: "ignore" });
      for (let i = 0; ; i++) {
        try {
          await client.getChainId();
          break;
        } catch {
          if (i > 100) throw new Error("anvil did not start");
          await sleep(100);
        }
      }
      execFileSync(
        bin("forge"),
        [
          "script",
          "script/DeployLocal.s.sol",
          "--rpc-url",
          rpc,
          "--broadcast",
          "--unlocked",
          "--slow",
          "--sender",
          CREATOR,
        ],
        { cwd: path.join(REPO, "contracts"), stdio: "pipe", timeout: 120_000 },
      );
    },
    stop() {
      proc?.kill();
    },

    /** Routes `token` to X_ID: creator Route signature + attester Register signature. */
    async register(token: Address) {
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
      await ff("registerToken", [
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
      ]);
      const info = await client.readContract({
        address: ADDR.feeFlow,
        abi: feeFlowAbi,
        functionName: "tokens",
        args: [token],
      });
      return info.sink;
    },

    /** Simulates trading fees: USDG lands in the Pons escrow for `sink`. */
    async creditUsdg(sink: Address, amount: bigint) {
      await send(
        wallet.writeContract({
          address: ADDR.usdg,
          abi: erc20Abi,
          functionName: "approve",
          args: [ADDR.escrow, amount],
        }),
      );
      await send(
        wallet.writeContract({
          address: ADDR.escrow,
          abi: escrowAbi,
          functionName: "creditToken",
          args: [sink, ADDR.usdg, amount],
        }),
      );
    },
    creditEth: (sink: Address, amount: bigint) =>
      send(
        wallet.writeContract({
          address: ADDR.escrow,
          abi: escrowAbi,
          functionName: "credit",
          args: [sink],
          value: amount,
        }),
      ),

    collect: (token: Address) => ff("collect", [token]),
    releaseExpired: (token: Address) => ff("releaseExpired", [token, 10n]),
    exitByCreator: (token: Address, to: Address) => ff("exitByCreator", [token, to]),

    async claim(tokens: Address[], to: Address = CLAIM_WALLET) {
      const expiry = (await now()) + 600n;
      const msg = { xUserId: X_ID, to, nonce: nonce++, expiry };
      const attestation = await attester.signTypedData({
        domain,
        types: claimTypes,
        primaryType: "Claim",
        message: msg,
      });
      return ff("claim", [X_ID, tokens, to, expiry, msg.nonce, attestation]);
    },

    read: <T>(functionName: string, args: readonly unknown[] = []) =>
      client.readContract({
        address: ADDR.feeFlow,
        abi: feeFlowAbi,
        functionName,
        args,
      } as never) as Promise<T>,

    async warp(seconds: number) {
      await test.increaseTime({ seconds });
      await test.mine({ blocks: 1 });
    },
  };
}

/** A child process whose output is kept for failure messages. */
export interface Proc {
  kill(): void;
  output(): string;
}

function child(cmd: string, args: string[], cwd: string, env: Record<string, string>): Proc {
  let out = "";
  const p = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout!.on("data", (d) => (out += d));
  p.stderr!.on("data", (d) => (out += d));
  return { kill: () => p.kill(), output: () => out };
}

/** `ponder start` from services/indexer on embedded PGlite (its `.ponder/` is wiped first). */
export async function startPonder(opts: {
  rpc: string;
  port: number;
  env?: Record<string, string>;
}) {
  const cwd = path.join(REPO, "services/indexer");
  const { rmSync } = await import("node:fs");
  rmSync(path.join(cwd, ".ponder"), { recursive: true, force: true });
  const proc = child(
    process.execPath,
    [
      path.join(cwd, "node_modules/ponder/dist/esm/bin/ponder.js"),
      "start",
      "--schema",
      "e2e",
      "--port",
      String(opts.port),
    ],
    cwd,
    {
      NODE_ENV: "test",
      CHAIN_ID: "31337",
      RPC_URL: opts.rpc,
      DATABASE_URL: "",
      CONTRACT_ADDRESS: ADDR.feeFlow,
      CONTRACT_DEPLOY_BLOCK: "0",
      CONFIRMATIONS: "0",
      SNAPSHOT_INTERVAL_BLOCKS: "1",
      CORS_ORIGIN: "http://localhost:3000",
      X_API_BEARER: "",
      ...opts.env,
    },
  );
  return { ...proc, url: `http://127.0.0.1:${opts.port}` };
}

/** The keeper (services/keeper/src/main.ts) as a real process. */
export function startKeeper(env: Record<string, string>) {
  const cwd = path.join(REPO, "services/keeper");
  return child(
    process.execPath,
    [path.join(cwd, "node_modules/tsx/dist/cli.mjs"), "src/main.ts"],
    cwd,
    {
      NODE_ENV: "test",
      CHAIN_ID: "31337",
      CONTRACT_ADDRESS: ADDR.feeFlow,
      KEEPER_KEY: KEEPER_TEST_KEY,
      ...env,
    },
  );
}

/** Waits until Ponder's /status reports the chain head. */
export async function waitIndexed(
  chain: Chain,
  indexerUrl: string,
  proc: Proc,
  timeoutMs = 60_000,
) {
  const head = await chain.client.getBlockNumber();
  await waitFor(
    async () => {
      const res = await fetch(`${indexerUrl}/status`);
      if (!res.ok) return false;
      const body = (await res.json()) as { main?: { block?: { number?: number } } };
      return (body.main?.block?.number ?? -1) >= Number(head);
    },
    { timeoutMs, what: `indexer at block ${head}`, proc },
  );
}

export async function waitFor(
  check: () => Promise<boolean>,
  opts: { timeoutMs?: number; what: string; proc?: Proc },
) {
  const start = Date.now();
  while (Date.now() - start < (opts.timeoutMs ?? 60_000)) {
    try {
      if (await check()) return;
    } catch {
      /* not ready */
    }
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${opts.what}\n${opts.proc?.output().slice(-3000) ?? ""}`);
}
