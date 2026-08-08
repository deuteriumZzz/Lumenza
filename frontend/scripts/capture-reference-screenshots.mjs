// Captures "current implementation" screenshots of the 6 pixel-perfect
// redesign target screens, for overlay comparison against
// docs/redesign-references/approved/*.png per
// docs/LUMENZA_PIXEL_PERFECT_REDESIGN_PLAN.md §3/§19.
//
// Usage: run from frontend/ with the dev server already reachable at
// BASE_URL (default http://127.0.0.1:3000) and LUMENZA_TEST_USERNAME /
// LUMENZA_TEST_PASSWORD set to a seeded account. See
// docs/redesign-references/README.md for the full container recipe.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:3000";
const USERNAME = process.env.LUMENZA_TEST_USERNAME;
const PASSWORD = process.env.LUMENZA_TEST_PASSWORD;

// Real pixel dimensions of the approved references (see
// docs/redesign-references/README.md) — not the plan doc's rounded
// 1600x1000 figure. Matching the reference's actual pixels takes
// precedence for overlay comparison.
const VIEWPORT = { width: 1586, height: 992 };

const ROUTES = [
  { name: "chat", path: "/chat" },
  { name: "agents", path: "/agents" },
  { name: "studio", path: "/studio" },
  { name: "account", path: "/profile" },
  { name: "knowledge", path: "/knowledge" },
  { name: "all-tools", path: "/tools" },
];

const OUTPUT_DIR = path.join(
  fileURLToPath(new URL("..", import.meta.url)),
  "..",
  "docs",
  "redesign-references",
  "baseline",
);

async function login(page) {
  if (!USERNAME || !PASSWORD) {
    throw new Error(
      "LUMENZA_TEST_USERNAME / LUMENZA_TEST_PASSWORD must be set to a seeded test account.",
    );
  }
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Next.js dev mode compiles /home on first request (observed 15-20s cold
  // vs <1s once cached) — the prior 15s timeout raced that compile.
  await page.waitForURL(`${BASE_URL}/home`, { timeout: 45000 });
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  await login(page);

  for (const route of ROUTES) {
    // Same cold-compile margin as login() — each route compiles on its
    // first request in dev mode.
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle", timeout: 60000 });
    // Let entry animations (Lumenza Core idle loop, route transition,
    // orbit scene, etc.) settle before capturing — matches doc §19 step 2
    // ("дождаться завершения загрузки и анимации входа").
    await page.waitForTimeout(1200);
    const outputPath = path.join(OUTPUT_DIR, `${route.name}.png`);
    await page.screenshot({ path: outputPath });
    console.log(`Captured ${route.path} -> ${outputPath}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
