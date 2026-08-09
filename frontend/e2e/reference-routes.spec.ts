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

  test("keeps one reference-aligned shell across client-side navigation", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/chat");

    const sidebar = page.getByRole("complementary", {
      name: "Рабочая навигация",
    });
    const content = page.getByTestId("workspace-content");
    await expect(sidebar).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    const contentBox = await content.boundingBox();

    expect(sidebarBox).toMatchObject({ x: 0, y: 0, width: 262, height: 992 });
    expect(contentBox?.x).toBe(262);
    await expect(sidebar).toHaveCSS("background-color", "rgb(11, 17, 22)");
    await expect(sidebar).toHaveCSS("border-right-color", "rgb(36, 48, 57)");
    await expect(sidebar).toHaveCSS("box-shadow", "none");
    await expect(sidebar).toHaveCSS("backdrop-filter", "none");
    await expect(sidebar).toHaveAttribute("data-reduced-motion", "true");

    const activeChat = sidebar.getByRole("link", { name: "Чат" });
    expect((await activeChat.boundingBox())?.height).toBe(58);
    const sidebarHandle = await sidebar.elementHandle();
    if (!sidebarHandle) throw new Error("Workspace sidebar did not resolve");

    await Promise.all([
      page.waitForURL("**/agents"),
      sidebar.getByRole("link", { name: "Агенты" }).click(),
    ]);
    await expect(page.locator('[aria-label="Agents workspace"]')).toBeVisible();
    expect(
      await page.evaluate(
        (element) => element === document.querySelector("#thread-sidebar"),
        sidebarHandle,
      ),
    ).toBe(true);
    await expect(sidebar.getByRole("link", { name: "Агенты" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("keeps the mobile navigation reachable without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await login(page);
    await page.goto("/chat");

    const sidebar = page.getByRole("complementary", {
      name: "Рабочая навигация",
    });
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    const toggle = page.getByRole("button", { name: "Показать боковую панель" });
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox?.width).toBeGreaterThanOrEqual(44);
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);

    await toggle.click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");
    await expect(
      page.getByRole("button", { name: "Закрыть боковую панель" }),
    ).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /lumenza_demo/i })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await expect(toggle).toBeFocused();
  });
});
