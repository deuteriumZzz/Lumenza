import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AmbientNetworkBackground } from "@/components/ambient-network-background";

describe("AmbientNetworkBackground", () => {
  afterEach(cleanup);

  it("renders one decorative full-viewport network layer", () => {
    const { container } = render(<AmbientNetworkBackground />);
    const background = container.querySelector(
      '[data-testid="ambient-network-background"]',
    );

    expect(background).not.toBeNull();
    expect(background?.getAttribute("aria-hidden")).toBe("true");
    expect(background?.className).toContain("fixed");
    expect(background?.className).toContain("pointer-events-none");
  });

  it("animates both connections and nodes with staggered hooks", () => {
    const { container } = render(<AmbientNetworkBackground />);
    const edges = container.querySelectorAll(".network-edge");
    const nodes = container.querySelectorAll(".network-node");

    expect(edges.length).toBeGreaterThan(10);
    expect(nodes.length).toBeGreaterThan(10);
    expect(
      new Set(Array.from(nodes, (node) => node.getAttribute("style"))).size,
    ).toBeGreaterThan(1);
  });
});
