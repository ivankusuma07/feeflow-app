import { expect, expectAccessible, firstTokenHref, test } from "./fixtures";

/** Every route in the brief's page list, with the h1 a reader should land on. */
const ROUTES: { path: string; h1: RegExp }[] = [
  { path: "/", h1: /./ },
  { path: "/explore", h1: /^Explore tokens$/ },
  { path: "/dashboard", h1: /^Dashboard$/ },
  { path: "/claim", h1: /^Claim$/ },
  { path: "/launch", h1: /^Launch a token on Pons$/ },
  { path: "/route", h1: /^Route a token to an X account$/ },
  { path: "/payments", h1: /^Payments$/ },
  { path: "/leaderboard", h1: /^Leaderboard$/ },
  { path: "/docs", h1: /^Docs$/ },
  { path: "/disclosures", h1: /^Disclosures$/ },
  { path: "/terms", h1: /./ },
  { path: "/privacy", h1: /./ },
];

for (const r of ROUTES) {
  test(`${r.path} renders, is accessible and logs no errors`, async ({ page, errors }) => {
    const res = await page.goto(r.path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(r.h1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page);
    // No horizontal page scroll at any viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("token page renders, is accessible and logs no errors", async ({ page, errors }) => {
  const href = await firstTokenHref(page);
  await page.goto(href);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Example Token A");
  await page.waitForLoadState("networkidle");
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test("unknown pages return 404", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
});

test("invalid token address returns 404", async ({ page }) => {
  const res = await page.goto("/tokens/not-an-address");
  expect(res?.status()).toBe(404);
});
