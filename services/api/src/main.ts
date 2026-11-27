import { apiEnvSchema, parseServerEnv, privyAttesterEnv } from "@feeflow/config";
import { PrivyClient } from "@privy-io/node";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createApp } from "./app";
import { loadAttester } from "./attester";
import { privyVerifier } from "./identity";
import { createXClient } from "./x-client";

const env = parseServerEnv(apiEnvSchema, process.env, "api");
const privyAttester = privyAttesterEnv(env);
const attester = await loadAttester({
  nodeEnv: env.NODE_ENV,
  key: env.ATTESTER_KEY,
  privy: privyAttester && {
    client: new PrivyClient({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET }),
    ...privyAttester,
  },
});

/** One JSON line per signature and error, on stdout for the host's log collector. */
const audit = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));

const app = createApp({
  chainId: env.CHAIN_ID,
  contract: env.CONTRACT_ADDRESS,
  attester,
  identity: privyVerifier(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET),
  x: env.X_API_BEARER ? createXClient(env.X_API_BEARER) : null,
  corsOrigins: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
  ttlSeconds: env.ATTESTATION_TTL_SECONDS,
  trustedProxies: env.TRUSTED_PROXIES,
  remoteAddress: (c) => getConnInfo(c).remote.address,
  audit,
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  audit({
    kind: "start",
    port: info.port,
    chainId: env.CHAIN_ID,
    contract: env.CONTRACT_ADDRESS,
    attester: attester.address,
    signer: privyAttester ? "privy" : "local",
    xLookup: Boolean(env.X_API_BEARER),
  });
});
