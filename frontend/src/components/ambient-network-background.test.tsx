import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AmbientNetworkBackground } from "@/components/ambient-network-background";

const mocks = vi.hoisted(() => ({ pathname: "/chat" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

import {
  useSetStudioMode,
  ZoneProvider,
  type StudioMode,
} from "@/components/zone";

function StudioModeButton({ mode }: { mode: StudioMode }) {
  const setStudioMode = useSetStudioMode();
  return (
    <button type="button" onClick={() => setStudioMode(mode)}>
      {mode}
    </button>
  );
}

describe("AmbientNetworkBackground", () => {
  afterEach(() => {
    cleanup();
    mocks.pathname = "/chat";
  });

  it("renders one decorative full-viewport network layer", () => {
    const { container } = render(
      <ZoneProvider>
        <AmbientNetworkBackground />
      </ZoneProvider>,
    );
    const background = container.querySelector(
      '[data-testid="ambient-network-background"]',
    );

    expect(background).not.toBeNull();
    expect(background?.getAttribute("aria-hidden")).toBe("true");
    expect(background?.className).toContain("fixed");
    expect(background?.className).toContain("pointer-events-none");
  });

  it("animates both connections and nodes with staggered hooks", () => {
    const { container } = render(
      <ZoneProvider>
        <AmbientNetworkBackground />
      </ZoneProvider>,
    );
    const edges = container.querySelectorAll(".network-edge");
    const nodes = container.querySelectorAll(".network-node");

    expect(edges.length).toBeGreaterThan(10);
    expect(nodes.length).toBeGreaterThan(10);
    expect(
      new Set(Array.from(nodes, (node) => node.getAttribute("style"))).size,
    ).toBeGreaterThan(1);
  });

  it("does not fire a signal pulse on first mount", () => {
    const { container } = render(
      <ZoneProvider>
        <AmbientNetworkBackground />
      </ZoneProvider>,
    );

    expect(
      container.querySelector('[data-testid="ambient-network-pulse"]'),
    ).toBeNull();
  });

  it("fires a signal pulse scoped to the new zone when the studio category changes", async () => {
    mocks.pathname = "/studio";
    const { container, findByTestId, getByRole } = render(
      <ZoneProvider>
        <StudioModeButton mode="voice" />
        <AmbientNetworkBackground />
      </ZoneProvider>,
    );

    expect(
      container.querySelector('[data-testid="ambient-network-pulse"]'),
    ).toBeNull();

    getByRole("button", { name: "voice" }).click();

    const pulse = await findByTestId("ambient-network-pulse");
    expect(pulse.getAttribute("data-zone")).toBe("voice");
  });
});
