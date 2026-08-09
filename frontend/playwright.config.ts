import { defineConfig } from "playwright/test";
import {
  REFERENCE_VIEWPORT,
  parseE2EPort,
} from "./scripts/visual-audit-config.mjs";

const port = parseE2EPort(process.env.E2E_PORT);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 45_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    viewport: REFERENCE_VIEWPORT,
    locale: "ru-RU",
    timezoneId: "Asia/Makassar",
    contextOptions: { reducedMotion: "reduce" },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 60_000,
  },
  webServer:
    process.env.E2E_SKIP_WEB_SERVER === "true"
      ? undefined
      : {
          command: "npm run dev",
          env: { PORT: port },
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
