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

    mocks.pathname = "/agents";
    rerender(
      <RouteTransition>
        <p>Агенты</p>
      </RouteTransition>,
    );

    expect(
      screen
        .getByText("Агенты")
        .closest("[data-route-transition]")
        ?.getAttribute("data-route-family"),
    ).toBe("agents");

    mocks.pathname = "/home";
    rerender(
      <RouteTransition>
        <p>Главная</p>
      </RouteTransition>,
    );

    expect(
      screen
        .getByText("Главная")
        .closest("[data-route-transition]")
        ?.getAttribute("data-route-family"),
    ).toBe("home");
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

  it("clips the decorative veil so route animation cannot widen a Mini App viewport", () => {
    render(
      <RouteTransition>
        <p>Узкий экран</p>
      </RouteTransition>,
    );

    expect(
      screen.getByText("Узкий экран").parentElement?.parentElement?.className,
    ).toContain("overflow-x-clip");
  });

  it("marks the seamless Chat to Agents morph without mixing the route families", () => {
    const { rerender } = render(<RouteTransition><p>Чат</p></RouteTransition>);

    mocks.pathname = "/agents";
    rerender(<RouteTransition><p>Агенты</p></RouteTransition>);

    expect(
      screen.getByText("Агенты").closest("[data-route-transition]")?.getAttribute("data-transition"),
    ).toBe("chat-to-agents");

    mocks.pathname = "/agents/threads-content-day";
    rerender(<RouteTransition><p>Запуск агента</p></RouteTransition>);

    expect(
      screen.getByText("Запуск агента").closest("[data-route-transition]")?.getAttribute("data-transition"),
    ).toBe("standard");
  });
});
