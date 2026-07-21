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
        "src/components/accessibility-shell.tsx",
        "src/components/copy-response-button.tsx",
        "src/components/file-upload-button.tsx",
        "src/components/history-filters.tsx",
        "src/components/image-lightbox.tsx",
        "src/components/locked-option-picker.tsx",
        "src/components/markdown-response.tsx",
        "src/components/nav.tsx",
        "src/components/require-auth.tsx",
        "src/components/response-skeleton.tsx",
        "src/components/zone.tsx",
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
