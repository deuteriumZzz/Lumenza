// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
).toLowerCase();
const routeTransition = readFileSync(
  join(process.cwd(), "src/components/route-transition.tsx"),
  "utf8",
);
const motionSource = readFileSync(
  join(process.cwd(), "src/lib/motion.ts"),
  "utf8",
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (!match) throw new Error(`Missing CSS rule: ${selector}`);
  return match[1];
}

describe("Luminous Command Deck foundation", () => {
  it("implements the canonical palette and geometry tokens", () => {
    expect(stylesheet).toContain("--bg-root: #080d11;");
    expect(stylesheet).toContain("--bg-sidebar: #0b1116;");
    expect(stylesheet).toContain("--bg-surface: #10171c;");
    expect(stylesheet).toContain("--bg-surface-raised: #151e24;");
    expect(stylesheet).toContain("--bg-surface-hover: #1b252c;");
    expect(stylesheet).toContain("--gold-primary: #eab552;");
    expect(stylesheet).toContain("--cyan-primary: #58d5e3;");
    expect(stylesheet).toContain("--workspace-sidebar-width: 16.375rem;");
    expect(stylesheet).toContain("--radius-control: 0.625rem;");
    expect(stylesheet).toContain("--radius-panel: 0.875rem;");
    expect(stylesheet).toContain("--radius-feature: 1.125rem;");
  });

  it("keeps the persistent shell flat and free of decorative grid or glow", () => {
    expect(rule(".chat-shell")).not.toMatch(/gradient|backdrop-filter|box-shadow/);
    expect(rule(".chat-shell::before")).toContain("content: none");
    expect(rule(".chat-sidebar")).toContain("background: var(--bg-sidebar)");
    expect(rule(".chat-sidebar")).not.toMatch(/backdrop-blur|box-shadow/);
  });

  it("gives every primary navigation target the reference-sized hit area", () => {
    expect(rule(".sidebar-action")).toContain("min-height: 3.625rem");
    expect(rule(".sidebar-action")).toContain("border-radius: var(--radius-panel)");
    expect(rule(".sidebar-active-indicator")).not.toContain("box-shadow");
  });

  it("uses an inexpensive route crossfade and keeps bounce out of routine motion", () => {
    expect(routeTransition).not.toContain("isWorkspaceCrossfade");
    expect(routeTransition).not.toContain("filter:");
    expect(routeTransition).not.toMatch(/\by:\s*4[,}]/);
    expect(routeTransition).toContain('transform: "translate3d(0, 4px, 0)"');
    expect(motionSource).not.toContain("bounce:");
    expect(motionSource).not.toContain("bouncy:");
  });
});
