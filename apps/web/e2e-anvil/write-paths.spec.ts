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
import { shortAddress } from "@feeflow/sdk";
import { expectAccessible } from "../e2e/fixtures";
import { waitCredited, waitIndexed } from "./indexer";
import { installStubs } from "./stubs";

/**
 * Write paths against a local Anvil deployment (brief §Testing): real transactions from wagmi's
 * mock connector (Anvil account 0), real EIP-712 attestations from the local attester key, and
 * every page reading the real indexer.
 * The steps build on each other, so they run in order on one chain.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureDeployed();
});

async function connectWallet(page: Page) {
  const connect = page.getByRole("button", { name: "Connect wallet" }).first();
  // On a cold dev server the button can render before React hydrates and a first click is lost.
  await expect(async () => {
    await connect.click({ timeout: 2_000 });
    await expect(connect).toBeHidden({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test("route: sign, register and point Pons fees at the sink", async ({ page }) => {
  await waitIndexed();
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

  await waitIndexed();
  await installStubs(page);
  await page.goto(`/tokens/${ADDR.demoUsdgToken}`);
  // The demo token is a bare address in DeployLocal (no ERC-20 code): the indexer names it by address.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    shortAddress(ADDR.demoUsdgToken.toLowerCase()),
  );
  await connectWallet(page);

  await page.getByRole("button", { name: "Collect into FeeFlow" }).click();
  await expect(page.getByText("Collected into FeeFlow")).toBeVisible();

  // FeeFlow keeps 1%; 99% is credited to the X account.
  expect(await escrowBalance(sink)).toBe(0n);
  expect(await credited(ADDR.demoUsdgToken)).toBe(parseUnits("99", 6));
});

test("claim error: the approval service is down, nothing is sent", async ({ page }) => {
  await waitIndexed();
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

  await waitIndexed();
  await waitCredited(ADDR.demoUsdgToken, parseUnits("148.5", 6));
  await installStubs(page);
  await page.goto("/claim");
  await connectWallet(page);

  await page.getByRole("button", { name: "Claim 148.50 USDG" }).click();
  await expect(page).toHaveURL(/\/claim\/success\?tx=0x[0-9a-f]{64}$/);
  await expect(page.getByText(/148\.50 USDG/).first()).toBeVisible();

  expect(await credited(ADDR.demoUsdgToken)).toBe(0n);
  expect((await usdgBalance(CREATOR)) - before).toBe(parseUnits("148.5", 6));
});

test("live pages: every read page shows the indexed chain state", async ({ page }) => {
  // State after the steps above: 150 USDG collected (1.50 fee), 148.50 claimed, nothing waiting.
  await waitIndexed();
  await installStubs(page);
  const main = page.locator("#main");

  await page.goto("/payments");
  await expect(main.getByText("Total fees collected into FeeFlow")).toBeVisible();
  await expect(main.getByText("150.00").first()).toBeVisible();
  await expect(main.getByText("148.50").first()).toBeVisible();
  await expect(main.getByText("99% of collected USDG")).toBeVisible();
  await expect(main.getByText(`X user ${X_USER.id}`).first()).toBeVisible();
  await expectAccessible(page);

  await page.goto("/leaderboard");
  await expect(page.getByRole("list", { name: "Ranking" })).toContainText("148.50");
  await expectAccessible(page);

  await page.goto("/dashboard");
  await expect(
    main.getByText(shortAddress(ADDR.demoUsdgToken.toLowerCase())).first(),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto("/explore");
  const card = main.locator("article").filter({
    hasText: shortAddress(ADDR.demoUsdgToken.toLowerCase()),
  });
  await expect(card.first()).toContainText("148.50");
  await expectAccessible(page);

  await page.goto(`/tokens/${ADDR.demoUsdgToken}`);
  // Newest first: the claim, two collects, the routing.
  for (const kind of ["Claim", "Collect", "Routed"]) {
    await expect(main.getByText(kind, { exact: true }).first()).toBeVisible();
  }
  await expectAccessible(page);
});
