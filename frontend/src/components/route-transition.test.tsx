import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/chat",
  reduceMotion: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => mocks.reduceMotion,
  };
});

import { RouteTransition } from "@/components/route-transition";

describe("RouteTransition", () => {
  afterEach(() => {
    cleanup();
    mocks.pathname = "/chat";
    mocks.reduceMotion = false;
  });

  it("marks chat and studio as distinct animated route families", () => {
    const { rerender } = render(
      <RouteTransition>
        <p>Чат</p>
      </RouteTransition>,
    );

    expect(
      screen.getByText("Чат").closest("[data-route-transition]")?.getAttribute(
        "data-route-family",
      ),
    ).toBe("chat");

    mocks.pathname = "/studio";
    rerender(
      <RouteTransition>
        <p>Студия</p>
      </RouteTransition>,
    );

    expect(
      screen
        .getByText("Студия")
        .closest("[data-route-transition]")
        ?.getAttribute("data-route-family"),
    ).toBe("studio");
  });

  it("adds a visual transition veil but removes it for reduced motion", () => {
    render(
      <RouteTransition>
        <p>Обычное движение</p>
      </RouteTransition>,
    );

    expect(screen.getByTestId("route-transition-veil")).toBeDefined();

    cleanup();
    mocks.reduceMotion = true;
    render(
      <RouteTransition>
        <p>Без движения</p>
      </RouteTransition>,
    );

    expect(screen.queryByTestId("route-transition-veil")).toBeNull();
    expect(
      screen
        .getByText("Без движения")
        .closest("[data-route-transition]")
        ?.getAttribute("data-reduced-motion"),
    ).toBe("true");
  });
});
