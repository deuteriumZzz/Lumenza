import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      include: [
        "src/app/page.tsx",
        "src/app/studio/page.tsx",
        "src/components/accessibility-shell.tsx",
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
        "src/components/thread-sidebar.tsx",
        "src/components/zone.tsx",
        "src/lib/chat-taxonomy.ts",
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
