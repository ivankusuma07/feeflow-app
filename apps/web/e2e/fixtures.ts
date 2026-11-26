import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/** Collects console errors and uncaught exceptions; each test asserts there are none. */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await provide(errors);
  },
});

export { expect };

/** axe with WCAG 2.1 A/AA rules; serious and critical violations fail the test. */
export async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
  expect(blocking, blocking.join("\n")).toEqual([]);
}

/** First mock token's page, found through the dashboard like a user would. */
export async function firstTokenHref(page: Page): Promise<string> {
  await page.goto("/dashboard");
  const tile = page.getByRole("link", { name: /Example Token A/ });
  await expect(tile).toBeVisible();
  const href = await tile.getAttribute("href");
  if (!href) throw new Error("token tile has no href");
  return href;
}
