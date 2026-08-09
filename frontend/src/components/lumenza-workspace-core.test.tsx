import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => mocks.reduced };
});

import { LumenzaWorkspaceCore } from "@/components/lumenza-workspace-core";

describe("LumenzaWorkspaceCore", () => {
  afterEach(() => {
    cleanup();
    mocks.reduced = false;
  });

  it.each([
    "idle",
    "listening",
    "routing",
    "thinking",
    "typing",
    "success",
    "error",
  ] as const)("exposes the %s state without changing its identity", (state) => {
    render(<LumenzaWorkspaceCore mode="chat" state={state} />);

    const core = screen.getByTestId("lumenza-core");
    expect(core.getAttribute("data-core-mode")).toBe("chat");
    expect(core.getAttribute("data-core-state")).toBe(state);
    expect(core.getAttribute("data-core-pattern")).toBeTruthy();
    expect(core.querySelectorAll('[data-core-disc=""]')).toHaveLength(1);
  });

  it("keeps state semantics when reduced motion is enabled", () => {
    mocks.reduced = true;
    render(<LumenzaWorkspaceCore mode="agents" state="thinking" />);

    const core = screen.getByTestId("lumenza-core");
    expect(core.getAttribute("data-reduced-motion")).toBe("true");
    expect(core.getAttribute("data-core-state")).toBe("thinking");
  });
});
