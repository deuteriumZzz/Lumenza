import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("never adds a generic veil or fullscreen transition overlay", () => {
    render(
      <RouteTransition>
        <p>Обычное движение</p>
      </RouteTransition>,
    );

    expect(screen.queryByTestId("route-transition-veil")).toBeNull();
    expect(document.querySelector("[data-route-transition-overlay]")).toBeNull();
  });

  it("disables route motion correctly when reduced motion is requested", () => {
    mocks.reduceMotion = true;

    render(
      <RouteTransition>
        <p>Без движения</p>
      </RouteTransition>,
    );

    expect(screen.queryByTestId("route-transition-veil")).toBeNull();
    expect(screen.queryByTestId("workspace-mode-morph")).toBeNull();
    expect(
      screen
        .getByText("Без движения")
        .closest("[data-route-transition]")
        ?.getAttribute("data-reduced-motion"),
    ).toBe("true");
  });

  it("keeps route content inside a stable non-overlay stage", () => {
    render(
      <RouteTransition>
        <p>Узкий экран</p>
      </RouteTransition>,
    );

    const frame = screen.getByText("Узкий экран").closest("[data-route-transition]");
    expect(frame).toBeDefined();
    expect(frame?.parentElement?.querySelector("[data-route-transition-overlay]")).toBeNull();
    expect(screen.queryByTestId("route-transition-veil")).toBeNull();
  });

  it("marks the seamless Chat to Agents morph without mixing the route families", async () => {
    const { rerender } = render(<RouteTransition><p>Чат</p></RouteTransition>);

    mocks.pathname = "/agents";
    rerender(<RouteTransition><p>Агенты</p></RouteTransition>);

    expect(
      screen.getByText("Агенты").closest("[data-route-transition]")?.getAttribute("data-transition"),
    ).toBe("chat-to-agents");
    expect(screen.getByTestId("workspace-mode-morph").getAttribute("data-from")).toBe("chat");
    expect(screen.getByTestId("workspace-mode-morph").getAttribute("data-to")).toBe("agents");
    expect(screen.getByTestId("workspace-mode-morph").querySelectorAll("[data-morph-node]")).toHaveLength(3);
    expect(screen.queryByTestId("route-transition-veil")).toBeNull();

    mocks.pathname = "/agents/threads-content-day";
    rerender(<RouteTransition><p>Запуск агента</p></RouteTransition>);

    expect(
      screen.getByText("Запуск агента").closest("[data-route-transition]")?.getAttribute("data-transition"),
    ).toBe("standard");
    await waitFor(() => expect(screen.queryByTestId("workspace-mode-morph")).toBeNull());
  });
});
