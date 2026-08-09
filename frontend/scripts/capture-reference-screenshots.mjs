import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  REFERENCE_ROUTES,
  REFERENCE_VIEWPORT,
  isExpectedPreviewConsoleError,
  resolveVisualAuditPaths,
  validateReferenceRoutes,
} from "./visual-audit-config.mjs";

const FRONTEND_ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:3100";
const USERNAME = process.env.LUMENZA_TEST_USERNAME;
const PASSWORD = process.env.LUMENZA_TEST_PASSWORD;
const paths = resolveVisualAuditPaths(FRONTEND_ROOT);

function requireConfiguration() {
  const validation = validateReferenceRoutes();
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  if (!USERNAME || !PASSWORD) {
    throw new Error(
      "Set LUMENZA_TEST_USERNAME and LUMENZA_TEST_PASSWORD for a seeded test account.",
    );
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByLabel("Имя пользователя", { exact: true }).fill(USERNAME);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await Promise.all([
    page.waitForURL(`${BASE_URL}/home`, { timeout: 45_000 }),
    page.getByRole("button", { name: "Войти", exact: true }).click(),
  ]);
}

async function stabilize(page, route) {
  await page.locator(`[aria-label="${route.landmark}"]`).waitFor({
    state: "visible",
    timeout: 45_000,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0.001ms !important;
      }
    `,
  });
}

async function main() {
  requireConfiguration();
  await mkdir(paths.currentDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: REFERENCE_VIEWPORT,
    reducedMotion: "reduce",
    locale: "ru-RU",
    timezoneId: "Asia/Makassar",
  });
  const page = await context.newPage();
  const browserErrors = [];

  try {
    await login(page);
    page.on("console", (message) => {
      if (
        message.type() === "error"
        && !isExpectedPreviewConsoleError(message.text())
      ) {
        browserErrors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 500) {
        browserErrors.push(`http ${response.status()}: ${response.url()}`);
      }
    });
    const captures = [];

    for (const route of REFERENCE_ROUTES) {
      const errorOffset = browserErrors.length;
      await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await stabilize(page, route);

      const outputPath = path.join(paths.currentDir, `${route.name}.png`);
      await page.screenshot({ path: outputPath, animations: "disabled" });
      captures.push({
        ...route,
        outputPath,
        browserErrors: browserErrors.slice(errorOffset),
      });
      process.stdout.write(`Captured ${route.path} -> ${outputPath}\n`);
    }

    const captureReportPath = path.join(
      path.dirname(paths.reportPath),
      "capture-report.json",
    );
    await writeFile(
      captureReportPath,
      `${JSON.stringify({ baseURL: BASE_URL, viewport: REFERENCE_VIEWPORT, captures }, null, 2)}\n`,
      "utf8",
    );

    if (browserErrors.length > 0) {
      throw new Error(`Browser audit found errors:\n${browserErrors.join("\n")}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
