import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Studio dock panel layout", () => {
  it("anchors dock dialogs to the viewport-safe right edge", () => {
    const stylesheet = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(stylesheet).toMatch(
      /\.studio-prompt-dock\s*\{[^}]*left:\s*calc\(\(100vw\s*\+\s*var\(--workspace-sidebar-width\)\)\s*\/\s*2\);[^}]*width:\s*min\(70rem,\s*calc\(100vw\s*-\s*var\(--workspace-sidebar-width\)\s*-\s*2\.5rem\)\);[^}]*translate:\s*-50%\s+0;/,
    );
    expect(stylesheet).toMatch(
      /\.chat-shell:has\(\.chat-sidebar\.is-collapsed\) \.studio-prompt-dock\s*\{[^}]*left:\s*calc\(\(100vw\s*\+\s*4\.5rem\)\s*\/\s*2\);[^}]*width:\s*min\(70rem,\s*calc\(100vw\s*-\s*7rem\)\);/,
    );
    expect(stylesheet).toMatch(
      /\.studio-prompt-dock\s+\.studio-control-panel\s*\{[^}]*left:\s*auto;[^}]*right:\s*0;/,
    );
    expect(stylesheet).toMatch(/\.route-transition-frame:has\(\.studio-prompt-dock\)\s*\{[^}]*will-change:\s*auto\s*!important;/);
  });
});
