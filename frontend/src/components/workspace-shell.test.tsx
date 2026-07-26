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

  it.each(["/chat", "/chat/42", "/studio"])(
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

  it("leaves non-workspace pages in the global shell", () => {
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
