import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    // jsdom + V8 instrumentation is memory-heavy. Bounding concurrency
    // keeps coverage runs deterministic instead of letting 30+ DOM suites
    // starve one another until Vitest's per-test timeout fires.
    maxWorkers: 4,
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: [
        "src/app/page.tsx",
        "src/app/about/page.tsx",
        "src/app/studio/page.tsx",
        "src/app/usage/page.tsx",
        "src/components/accessibility-shell.tsx",
        "src/components/account-menu.tsx",
        "src/components/ambient-network-background.tsx",
        "src/components/app-backdrop.tsx",
        "src/components/appearance-control.tsx",
        "src/components/chat-routing.tsx",
        "src/components/chat-thread-view.tsx",
        "src/components/copy-response-button.tsx",
        "src/components/file-upload-button.tsx",
        "src/components/history-filters.tsx",
        "src/components/image-lightbox.tsx",
        "src/components/locked-option-picker.tsx",
        "src/components/markdown-response.tsx",
        "src/components/model-picker.tsx",
        "src/components/nav.tsx",
        "src/components/require-auth.tsx",
        "src/components/response-skeleton.tsx",
        "src/components/route-transition.tsx",
        "src/components/studio-mark.tsx",
        "src/components/studio-workspace-controls.tsx",
        "src/components/thread-sidebar.tsx",
        "src/components/telegram-webapp-provider.tsx",
        "src/components/zone.tsx",
        "src/lib/chat-taxonomy.ts",
        "src/lib/locale-context.tsx",
        "src/proxy.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
