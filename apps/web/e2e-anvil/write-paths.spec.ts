import { expect, test, type Page } from "@playwright/test";
import { parseUnits } from "viem";
import {
  ADDR,
  collect,
  credited,
  CREATOR,
  creditEscrow,
  ensureDeployed,
  escrowBalance,
  ponsRecipient,
  tokenInfo,
  usdgBalance,
  X_USER,
} from "./chain";
import { installStubs } from "./stubs";

/**
 * Write paths against a local Anvil deployment (brief §Testing): real transactions from wagmi's
 * mock connector (Anvil account 0), real EIP-712 attestations from the local attester key.
 * The steps build on each other, so they run in order on one chain.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureDeployed();
});

async function connectWallet(page: Page) {
  const connect = page.getByRole("button", { name: "Connect wallet" }).first();
  await connect.click();
  await expect(connect).toBeHidden();
}

test("route: sign, register and point Pons fees at the sink", async ({ page }) => {
  await installStubs(page);
  await page.goto("/route");
  await connectWallet(page);

  await page.getByLabel("Token address").fill(ADDR.demoUsdgToken);
  await expect(page.getByText("Launched by the Pons v2 factory")).toBeVisible();
  await expect(page.getByText("Pair asset USDG · payouts in USDG")).toBeVisible();

  await page.getByLabel("X handle").fill(`@${X_USER.username}`);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText(`@${X_USER.username} · user id ${X_USER.id}`)).toBeVisible();

  await page.getByRole("button", { name: "Sign message" }).click();
  await expect(page.getByText("Signed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Register token" }).click();
  await expect(page.getByText("Token registered")).toBeVisible();

  await page.getByRole("button", { name: "Set FeeFlow as recipient" }).click();
  await expect(page.getByText("Fees now route through FeeFlow")).toBeVisible();
  await expect(page.getByText("Routed.", { exact: true })).toBeVisible();

  const info = await tokenInfo(ADDR.demoUsdgToken);
  expect(info.xUserId.toString()).toBe(X_USER.id);
  expect(info.creator).toBe(CREATOR);
  expect(await ponsRecipient(ADDR.demoUsdgToken)).toBe(info.sink);
});

test("collect: escrowed fees move into FeeFlow from the token page", async ({ page }) => {
  const { sink } = await tokenInfo(ADDR.demoUsdgToken);
  await creditEscrow(sink, parseUnits("100", 6));

  await installStubs(page);
  await page.goto(`/tokens/${ADDR.demoUsdgToken}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo USDG Token");
  await connectWallet(page);

  await page.getByRole("button", { name: "Collect into FeeFlow" }).click();
  await expect(page.getByText("Collected into FeeFlow")).toBeVisible();

  // FeeFlow keeps 1%; 99% is credited to the X account.
  expect(await escrowBalance(sink)).toBe(0n);
  expect(await credited(ADDR.demoUsdgToken)).toBe(parseUnits("99", 6));
});

test("claim error: the approval service is down, nothing is sent", async ({ page }) => {
  await installStubs(page, { claimStatus: 503 });
  await page.goto("/claim");
  await connectWallet(page);

  await page.getByRole("button", { name: "Claim 99.00 USDG" }).click();
  // Shown inline next to the button (and as a toast); the button offers a retry.
  await expect(
    page.locator("#main").getByText("The FeeFlow approval service is unavailable. Try again."),
  ).toBeVisible();
  expect(await credited(ADDR.demoUsdgToken)).toBe(parseUnits("99", 6));
});

test("claim: attestation, one transaction, receipt summary", async ({ page }) => {
  // A second collection, so the claim pays two batches at once.
  const { sink } = await tokenInfo(ADDR.demoUsdgToken);
  await creditEscrow(sink, parseUnits("50", 6));
  await collect(ADDR.demoUsdgToken);
  const before = await usdgBalance(CREATOR);

  await installStubs(page);
  await page.goto("/claim");
  await connectWallet(page);

  await page.getByRole("button", { name: "Claim 148.50 USDG" }).click();
  await expect(page).toHaveURL(/\/claim\/success\?tx=0x[0-9a-f]{64}$/);
  await expect(page.getByText(/148\.50 USDG/).first()).toBeVisible();

  expect(await credited(ADDR.demoUsdgToken)).toBe(0n);
  expect((await usdgBalance(CREATOR)) - before).toBe(parseUnits("148.5", 6));
});
