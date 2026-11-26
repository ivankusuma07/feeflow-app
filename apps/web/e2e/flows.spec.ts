import { expect, test } from "./fixtures";

test.describe("with mock data and the mock login", () => {
  test("dashboard leads to the token page and to claim", async ({ page, errors }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Logged in with X as @example_one")).toBeVisible();
    await page.getByRole("link", { name: /Example Token A/ }).click();
    await expect(page).toHaveURL(/\/tokens\/0x[0-9a-fA-F]{40}$/);
    await expect(page.getByRole("region", { name: "Fee buckets" })).toBeVisible();

    await page.getByRole("link", { name: /^Claim as @example_one$/ }).click();
    await expect(page).toHaveURL(/\/claim$/);
    expect(errors).toEqual([]);
  });

  test("connecting the mock wallet shows the wallet chip and unlocks the steps", async ({
    page,
    errors,
  }) => {
    await page.goto("/claim");
    await expect(page.getByRole("listitem").filter({ hasText: "Connect a wallet" })).toBeVisible();
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await expect(page.getByRole("listitem").filter({ hasText: "Wallet connected" })).toBeVisible();
    // Before deployment the claim button is inert, never a live write.
    await expect(page.getByRole("button", { name: "Not deployed yet" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("claim totals follow the selection and filters, per asset", async ({ page }) => {
    await page.goto("/claim");
    const summary = page.getByRole("complementary");
    await expect(summary.getByText("Tokens selected")).toBeVisible();
    await expect(summary.locator("dd").first()).toHaveText("3");

    await page.getByRole("checkbox", { name: "Select Example Token B" }).uncheck();
    await expect(summary.locator("dd").first()).toHaveText("2");

    await page.getByRole("combobox", { name: "Pair asset" }).selectOption({ label: "ETH" });
    await expect(page.getByText("Example Token A")).toHaveCount(0);
    await expect(summary.locator("dd").first()).toHaveText("1");
  });

  test("leaderboard switches period and asset", async ({ page }) => {
    await page.goto("/leaderboard");
    const ranking = page.getByRole("list", { name: "Ranking" });
    await expect(ranking.getByRole("listitem").nth(1)).toContainText("USDG");
    await page.getByRole("button", { name: "ETH" }).click();
    await expect(ranking.getByRole("listitem").nth(1)).toContainText("ETH");
    await page.getByRole("button", { name: "All time" }).click();
    await expect(page.getByRole("button", { name: "All time" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("logging out shows the X login gate", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("@example_one", { exact: true }).first().click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Log in with X" })).toBeVisible();
  });

  test("payments full-table link jumps to all routed tokens", async ({ page }) => {
    await page.goto("/payments");
    await page.getByRole("link", { name: "Full table" }).click();
    await expect(page).toHaveURL(/#all-tokens$/);
    await expect(page.getByRole("heading", { name: "All routed tokens" })).toBeInViewport();
  });
});
