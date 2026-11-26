import { execFileSync } from "node:child_process";
import path from "node:path";
import { feeFlowAbi, ponsFactoryAbi } from "@feeflow/abi";
import { THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import { claimTypes, feeFlowDomain, registerTypes } from "@feeflow/sdk";
import {
  createPublicClient,
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
import { anvil } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export const ANVIL_PORT = Number(process.env.E2E_ANVIL_PORT ?? 8546);
export const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

/**
 * Addresses from contracts/script/DeployLocal.s.sol on a fresh Anvil (account 0, nonces 0-5).
 * `ensureDeployed` checks them, so a change to the script fails loudly instead of drifting.
 */
const pons = THIRD_PARTY_ADDRESSES[31337]!;
export const ADDR = {
  feeFlow: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  sinkImplementation: "0xd8058efe0198ae9dD7D563e1b4938Dcbc86A1F81",
  factory: pons.ponsFactory,
  escrow: pons.ponsEscrow,
  usdg: pons.usdg,
  demoUsdgToken: addrOf("feeflow.demo.usdg"),
  demoEthToken: addrOf("feeflow.demo.eth"),
} as const satisfies Record<string, Address>;

/** Anvil account 0: deployer, creator of the demo tokens and the app's mock wallet. */
export const CREATOR: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
/**
 * Anvil account 1 is the attester in DeployLocal. Its key is Anvil's public, well-known test key:
 * it only ever signs on this throwaway local chain.
 */
const attester = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

/** The mock X login (apps/web/src/auth/mock-auth.tsx). */
export const X_USER = { id: "1000000000", username: "example_one", name: "Example One" } as const;

function addrOf(label: string): Address {
  return `0x${keccak256(toBytes(label)).slice(-40)}` as Address;
}

const chain = defineChain({ ...anvil, rpcUrls: { default: { http: [RPC_URL] } } });
export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
/** Anvil accounts are unlocked: eth_sendTransaction from account 0 needs no key. */
const wallet = createWalletClient({ chain, transport: http(RPC_URL), account: CREATOR });

const escrowAbi = parseAbi([
  "function creditToken(address recipient, address token, uint256 amount)",
  "function balanceOfToken(address recipient, address token) view returns (uint256)",
]);

async function send(hash: Promise<Hex>) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: await hash });
  if (receipt.status !== "success")
    throw new Error(`setup tx reverted: ${receipt.transactionHash}`);
}

/** Deploys the local contracts once per Anvil instance. */
export async function ensureDeployed() {
  const code = await publicClient.getCode({ address: ADDR.feeFlow });
  if (!code || code === "0x") {
    execFileSync(
      process.env.FORGE_BIN ?? "forge",
      [
        "script",
        "script/DeployLocal.s.sol",
        "--rpc-url",
        RPC_URL,
        "--broadcast",
        "--unlocked",
        "--sender",
        CREATOR,
      ],
      // Playwright runs from apps/web.
      { cwd: path.resolve(process.cwd(), "../../contracts"), stdio: "pipe" },
    );
  }
  const sinkImpl = await publicClient.readContract({
    address: ADDR.feeFlow,
    abi: feeFlowAbi,
    functionName: "SINK_IMPLEMENTATION",
  });
  if (sinkImpl.toLowerCase() !== ADDR.sinkImplementation.toLowerCase()) {
    throw new Error("DeployLocal addresses changed: update e2e-anvil/chain.ts and addresses.ts");
  }
}

export const tokenInfo = (token: Address) =>
  publicClient.readContract({
    address: ADDR.feeFlow,
    abi: feeFlowAbi,
    functionName: "tokens",
    args: [token],
  });

export const credited = (token: Address) =>
  publicClient.readContract({
    address: ADDR.feeFlow,
    abi: feeFlowAbi,
    functionName: "credited",
    args: [token],
  });

export const escrowBalance = (sink: Address) =>
  publicClient.readContract({
    address: ADDR.escrow,
    abi: escrowAbi,
    functionName: "balanceOfToken",
    args: [sink, ADDR.usdg],
  });

export const usdgBalance = (who: Address) =>
  publicClient.readContract({
    address: ADDR.usdg,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });

export const ponsRecipient = async (token: Address) =>
  (
    await publicClient.readContract({
      address: ADDR.factory,
      abi: ponsFactoryAbi,
      functionName: "getLaunchedToken",
      args: [token],
    })
  ).creatorFeeRecipient;

/** Simulates trading fees: `amount` USDG lands in the Pons escrow for the token's sink. */
export async function creditEscrow(sink: Address, amount: bigint) {
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
}

/** Permissionless collect, as the keeper would do it. */
export async function collect(token: Address) {
  await send(
    wallet.writeContract({
      address: ADDR.feeFlow,
      abi: feeFlowAbi,
      functionName: "collect",
      args: [token],
    }),
  );
}

// ------------------------------------------------------------- attestations (the Stage 4 API)

let nonceSeq = BigInt(Date.now()) * 1000n;
const nextNonce = () => ++nonceSeq;
const expiryIn = (seconds: number) => BigInt(Math.floor(Date.now() / 1000) + seconds);
const domain = feeFlowDomain(31337, ADDR.feeFlow);

export async function signRegister(token: Address, xUserId: string) {
  const message = { token, xUserId: BigInt(xUserId), nonce: nextNonce(), expiry: expiryIn(300) };
  const attestation = await attester.signTypedData({
    domain,
    types: registerTypes,
    primaryType: "Register",
    message,
  });
  return {
    token,
    xUserId,
    nonce: message.nonce.toString(),
    expiry: message.expiry.toString(),
    attestation,
  };
}

export async function signClaim(xUserId: string, to: Address) {
  const message = { xUserId: BigInt(xUserId), to, nonce: nextNonce(), expiry: expiryIn(300) };
  const attestation = await attester.signTypedData({
    domain,
    types: claimTypes,
    primaryType: "Claim",
    message,
  });
  return {
    xUserId,
    to,
    nonce: message.nonce.toString(),
    expiry: message.expiry.toString(),
    attestation,
  };
}
