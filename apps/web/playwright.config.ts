import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3320);
const CI = Boolean(process.env.CI);

/**
 * End-to-end tests (brief §Testing). The app runs under `next dev` because production builds
 * reject the mock data source. Privy's app id is blanked so the dev-only mock login and wagmi's
 * mock wallet connector are used; process env overrides the local `.env*` files.
 * Locally the installed Chrome is used (no browser download); CI installs Playwright's Chromium.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...(CI ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /routes\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    timeout: 240_000,
    reuseExistingServer: !CI,
    env: {
      NEXT_PUBLIC_DATA_SOURCE: "mock",
      NEXT_PUBLIC_PRIVY_APP_ID: "",
      NEXT_PUBLIC_CHAIN_ID: "4663",
      NEXT_PUBLIC_EXPLORER_URL: "https://explorer.example",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
