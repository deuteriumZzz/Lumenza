import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  auth: { loading: true, user: null as { id: number } | null },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mocks.auth,
}));

import { RequireAuth } from "@/components/require-auth";

describe("RequireAuth", () => {
  beforeEach(() => {
    mocks.auth.loading = true;
    mocks.auth.user = null;
    mocks.replace.mockClear();
  });

  afterEach(cleanup);

  it("announces the authentication loading state", () => {
    render(<RequireAuth>Private content</RequireAuth>);

    expect(screen.getByRole("status").textContent).toBe("Загрузка…");
  });

  it("renders private content after authentication", () => {
    mocks.auth.loading = false;
    mocks.auth.user = { id: 1 };

    render(<RequireAuth>Private content</RequireAuth>);

    expect(screen.getByText("Private content")).toBeDefined();
  });
});
