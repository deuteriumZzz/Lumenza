import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

describe("Chat and Agents command deck geometry", () => {
  it("uses the reference Chat anchors instead of a flexible clone layout", () => {
    expect(css).toContain(".chat-workspace {");
    expect(css).toMatch(/\.chat-workspace-header\s*\{[^}]*min-height:\s*5\.75rem/);
    expect(css).toMatch(/\.chat-thread-content\.is-empty|\.chat-workspace:has\(\.chat-composer\.is-empty\)/);
    expect(css).toMatch(/\.chat-composer\.is-empty\s*\{[^}]*min-height:\s*13\.25rem/);
    expect(css).toMatch(/\.chat-action-card\s*\{[^}]*min-height:\s*13\.5rem/);
  });

  it("keeps the complete agent network and compact reference composer", () => {
    expect(css).toMatch(/\.agent-workspace-header\s*\{[^}]*min-height:\s*7\.75rem/);
    expect(css).toMatch(/\.agent-composer\s*\{[^}]*min-height:\s*10rem/);
    expect(css).toContain(".agent-section-title");
  });
});
