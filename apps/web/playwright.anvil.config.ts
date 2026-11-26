import { defineConfig, devices } from "@playwright/test";
import { ADDR, ANVIL_PORT, RPC_URL } from "./e2e-anvil/chain";
import { API_URL, INDEXER_URL } from "./e2e-anvil/stubs";

const PORT = Number(process.env.E2E_ANVIL_APP_PORT ?? 3321);
const CI = Boolean(process.env.CI);

/**
 * Write-path e2e against a local Anvil deployment (brief §Testing). A fresh Anvil starts for each
 * run; the spec deploys DeployLocal into it. The app uses the indexer data source and the mock
 * login (NEXT_PUBLIC_MOCK_AUTH, dev only); the indexer and the attestation API are Playwright
 * route stubs answered from live chain state and signed with the local attester key.
 */
export default defineConfig({
  testDir: "./e2e-anvil",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    ...(CI ? {} : { channel: "chrome" }),
  },
  webServer: [
    {
      command: `anvil --port ${ANVIL_PORT} --silent`,
      port: ANVIL_PORT,
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_CHAIN_ID: "31337",
        NEXT_PUBLIC_RPC_URL: RPC_URL,
        NEXT_PUBLIC_CONTRACT_ADDRESS: ADDR.feeFlow,
        NEXT_PUBLIC_SINK_IMPLEMENTATION_ADDRESS: ADDR.sinkImplementation,
        NEXT_PUBLIC_DATA_SOURCE: "indexer",
        NEXT_PUBLIC_INDEXER_URL: INDEXER_URL,
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_MOCK_AUTH: "1",
        NEXT_PUBLIC_PRIVY_APP_ID: "",
        NEXT_PUBLIC_EXPLORER_URL: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
