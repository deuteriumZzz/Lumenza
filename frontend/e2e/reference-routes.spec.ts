import { expect, test, type Page } from "playwright/test";
import {
  REFERENCE_ROUTES,
  REFERENCE_VIEWPORT,
  isExpectedPreviewConsoleError,
  requireE2ECredentials,
} from "../scripts/visual-audit-config.mjs";

const credentials = requireE2ECredentials(
  process.env.LUMENZA_TEST_USERNAME,
  process.env.LUMENZA_TEST_PASSWORD,
);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Имя пользователя", { exact: true }).fill(credentials.username);
  await page.getByLabel("Пароль", { exact: true }).fill(credentials.password);
  await Promise.all([
    page.waitForURL("**/home"),
    page.getByRole("button", { name: "Войти", exact: true }).click(),
  ]);
}

test.describe("approved reference routes", () => {
  test("render deterministically without dead or unnamed controls", async ({ page }) => {
    const browserErrors: string[] = [];
    await login(page);

    page.on("console", (message) => {
      if (
        message.type() === "error"
        && !isExpectedPreviewConsoleError(message.text())
      ) {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 500) {
        browserErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    expect(page.viewportSize()).toEqual(REFERENCE_VIEWPORT);

    for (const route of REFERENCE_ROUTES) {
      await page.goto(route.path);
      await expect(page.locator(`[aria-label="${route.landmark}"]`)).toBeVisible();
      await page.evaluate(async () => document.fonts.ready);

      const unnamedButtons = await page.locator("button:visible").evaluateAll((buttons) =>
        buttons
          .filter((button) => {
            const label = button.getAttribute("aria-label")
              ?? button.getAttribute("title")
              ?? button.textContent;
            return !label?.trim();
          })
          .map((button) => button.outerHTML.slice(0, 180)),
      );
      expect(unnamedButtons, `${route.path} has unnamed buttons`).toEqual([]);

      const deadLinks = await page.locator("a:visible").evaluateAll((links) =>
        links
          .filter((link) => {
            const href = link.getAttribute("href")?.trim();
            return !href || href.toLowerCase().startsWith("javascript:");
          })
          .map((link) => link.outerHTML.slice(0, 180)),
      );
      expect(deadLinks, `${route.path} has dead links`).toEqual([]);

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(horizontalOverflow, `${route.path} overflows horizontally`).toBeLessThanOrEqual(1);
    }

    expect(browserErrors).toEqual([]);
  });
});
