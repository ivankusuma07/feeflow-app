/**
 * Sets up the attester as a Privy server wallet (run once on the host, with api.env loaded).
 *
 *   tsx scripts/privy-attester.ts create <out-dir>
 *     Creates two P-256 keys and writes them to <out-dir> (mode 600):
 *       owner.key   owns the wallet and the policy (can change or export them). Move it off the
 *                   server after `lock`; the API never needs it.
 *       signer.key  ATTESTER_PRIVY_AUTH_KEY: a signer that may only sign FeeFlow typed data on
 *                   Robinhood Chain (policy below). This is the one the API holds.
 *     Then creates the policy, the signer's key quorum and the wallet, and prints the wallet id
 *     and its address (ATTESTER_ADDRESS for the deploy).
 *
 *   tsx scripts/privy-attester.ts lock <out-dir> <wallet-id> <contract>
 *     After the deploy: narrows the policy to the deployed FeeFlow contract (owner key).
 *
 *   tsx scripts/privy-attester.ts check <out-dir> <wallet-id>
 *     Signs as the API would (expects success) and tries a plain message and another chain
 *     (expects Privy to refuse both).
 *
 * Nothing secret is printed.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { feeFlowDomain, claimTypes } from "@feeflow/sdk";
import { generateP256KeyPair, PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import { getAddress, recoverTypedDataAddress, zeroAddress, type Address } from "viem";

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 4663);
const POLICY_NAME = "FeeFlow attester: FeeFlow typed data only";

const appId = process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
if (!appId || !appSecret) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required.");
const privy = new PrivyClient({ appId, appSecret });

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

function writeSecret(path: string, value: string) {
  if (existsSync(path)) throw new Error(`${path} exists; refusing to overwrite a key.`);
  writeFileSync(path, value + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}
const readKey = (dir: string, name: string) => readFileSync(join(dir, name), "utf8").trim();

function rules(contract: Address | undefined) {
  const conditions = [
    {
      field_source: "ethereum_typed_data_domain" as const,
      field: "chainId" as const,
      operator: "eq" as const,
      value: String(CHAIN_ID),
    },
    ...(contract
      ? [
          {
            field_source: "ethereum_typed_data_domain" as const,
            field: "verifyingContract" as const,
            operator: "eq" as const,
            value: contract,
          },
        ]
      : []),
  ];
  // Privy denies any request no rule allows: no transactions, no plain messages, no raw hashes.
  return [
    {
      name: "FeeFlow typed data",
      method: "eth_signTypedData_v4" as const,
      action: "ALLOW" as const,
      conditions,
    },
  ];
}

async function create(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const owner = await generateP256KeyPair();
  const signer = await generateP256KeyPair();
  writeSecret(join(dir, "owner.key"), owner.privateKey);
  writeSecret(join(dir, "signer.key"), signer.privateKey);

  const policy = await privy.policies().create({
    version: "1.0",
    name: POLICY_NAME,
    chain_type: "ethereum",
    owner: { public_key: owner.publicKey },
    rules: rules(undefined),
  });
  const quorum = await privy.keyQuorums().create({
    display_name: "FeeFlow attestation service",
    public_keys: [signer.publicKey],
    authorization_threshold: 1,
  });
  const wallet = await privy.wallets().create({
    chain_type: "ethereum",
    display_name: "FeeFlow attester",
    owner: { public_key: owner.publicKey },
    additional_signers: [{ signer_id: quorum.id, override_policy_ids: [policy.id] }],
  });
  writeFileSync(
    join(dir, "wallet.json"),
    JSON.stringify({ walletId: wallet.id, address: wallet.address, policyId: policy.id }, null, 2),
  );
  log({
    kind: "created",
    walletId: wallet.id,
    address: getAddress(wallet.address),
    policyId: policy.id,
  });
}

async function lock(dir: string, walletId: string, contract: Address) {
  const { policyId } = JSON.parse(readFileSync(join(dir, "wallet.json"), "utf8"));
  const wallet = await privy.wallets().get(walletId);
  if (!wallet.additional_signers.some((s) => s.override_policy_ids?.includes(policyId))) {
    throw new Error(`Policy ${policyId} is not the signer policy of wallet ${walletId}.`);
  }
  await privy.policies().update(policyId, {
    rules: rules(getAddress(contract)),
    authorization_context: { authorization_private_keys: [readKey(dir, "owner.key")] },
  });
  log({ kind: "locked", policyId, contract: getAddress(contract) });
}

async function check(dir: string, walletId: string) {
  const wallet = await privy.wallets().get(walletId);
  const address = getAddress(wallet.address);
  const account = createViemAccount(privy, {
    walletId,
    address,
    authorizationContext: { authorization_private_keys: [readKey(dir, "signer.key")] },
  });
  const { policyId } = JSON.parse(readFileSync(join(dir, "wallet.json"), "utf8"));
  const policy = await privy.policies().get(policyId);
  const contractRule = policy.rules[0]?.conditions.find(
    (c) => "field" in c && (c.field === "verifyingContract" || c.field === "verifying_contract"),
  );
  const contract = contractRule ? getAddress(String(contractRule.value)) : zeroAddress;

  const def = {
    domain: feeFlowDomain(CHAIN_ID, contract),
    types: claimTypes,
    primaryType: "Claim" as const,
    message: { xUserId: 1n, to: zeroAddress, nonce: 1n, expiry: 1n },
  };
  const signature = await account.signTypedData(def);
  const signer = await recoverTypedDataAddress({ ...def, signature });
  log({ kind: "check", case: "feeflow typed data", ok: signer === address });

  const refused = async (name: string, attempt: () => Promise<unknown>) => {
    try {
      await attempt();
      log({ kind: "check", case: name, ok: false, error: "Privy signed it" });
    } catch (e) {
      log({ kind: "check", case: name, ok: true, refused: (e as Error).message.slice(0, 120) });
    }
  };
  await refused("plain message", () => account.signMessage({ message: "hello" }));
  await refused("other chain", () =>
    account.signTypedData({ ...def, domain: feeFlowDomain(1, contract) }),
  );
  if (contractRule) {
    await refused("other contract", () =>
      account.signTypedData({ ...def, domain: feeFlowDomain(CHAIN_ID, zeroAddress) }),
    );
  }
}

const [cmd, dir, a, b] = process.argv.slice(2);
if (cmd === "create" && dir) await create(dir);
else if (cmd === "lock" && dir && a && b) await lock(dir, a, b as Address);
else if (cmd === "check" && dir && a) await check(dir, a);
else {
  console.error(
    "usage: privy-attester.ts create <dir> | lock <dir> <wallet-id> <contract> | check <dir> <wallet-id>",
  );
  process.exit(2);
}
