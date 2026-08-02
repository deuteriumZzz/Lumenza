import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/history",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => (
    <div data-testid="workspace-auth">{children}</div>
  ),
}));

vi.mock("@/components/thread-sidebar", () => ({
  ThreadSidebar: () => <aside aria-label="Рабочая навигация" />,
}));

import { WorkspaceShell } from "@/components/workspace-shell";

describe("WorkspaceShell", () => {
  beforeEach(() => {
    mocks.pathname = "/history";
  });

  afterEach(cleanup);

  it.each(["/chat", "/chat/42", "/studio", "/tools", "/agents", "/agents/threads-content-day", "/home", "/profile", "/history", "/pricing", "/usage", "/automations"])(
    "keeps the shared sidebar around %s",
    (pathname) => {
      mocks.pathname = pathname;

      render(
        <WorkspaceShell>
          <p>Контент</p>
        </WorkspaceShell>,
      );

      expect(screen.getByRole("complementary", { name: "Рабочая навигация" }))
        .toBeDefined();
      expect(screen.getByTestId("workspace-auth")).toBeDefined();
      expect(screen.getByText("Контент")).toBeDefined();
      expect(screen.getByTestId("workspace-content").tagName).toBe("DIV");
      expect(screen.getByTestId("workspace-content").className).toContain(
        "miniapp-workspace-content",
      );
      expect(screen.getByTestId("workspace-content").className).toContain(
        "overflow-y-auto",
      );
      expect(
        screen.getByTestId("workspace-content").parentElement?.className,
      ).toContain("max-h-dvh");
    },
  );

  it.each(["/chat", "/agents", "/knowledge", "/studio", "/tools", "/automations", "/history", "/profile"])(
    "uses one route-independent workspace shell on %s",
    (pathname) => {
      mocks.pathname = pathname;

      render(
        <WorkspaceShell>
          <section aria-label="Контент маршрута">Контент</section>
        </WorkspaceShell>,
      );

      const shell = screen.getByTestId("workspace-shell");
      expect(screen.getAllByTestId("workspace-shell")).toHaveLength(1);
      expect(shell.getAttribute("data-shell-mode")).toBe("unified");
      expect(screen.getAllByRole("complementary", { name: "Рабочая навигация" }))
        .toHaveLength(1);
      expect(screen.getAllByTestId("workspace-content")).toHaveLength(1);
      expect(screen.getByRole("region", { name: "Контент маршрута" })).toBeDefined();
      expect(shell.querySelector("[data-route-specific-chrome]")).toBeNull();
    },
  );

  it("leaves non-workspace pages in the global shell", () => {
    mocks.pathname = "/login";
    render(
      <WorkspaceShell>
        <p>История</p>
      </WorkspaceShell>,
    );

    expect(screen.queryByText("Рабочая навигация")).toBeNull();
    expect(screen.queryByTestId("workspace-auth")).toBeNull();
    expect(screen.getByText("История")).toBeDefined();
  });
});
