import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/chat",
  push: vi.fn(),
  threads: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    threads: mocks.threads,
    deleteThread: vi.fn(),
  },
  apiErrorMessage: () => "Ошибка",
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, username: "alice", email: "alice@example.com", telegram_linked: false, tier: "free" },
    balance: { balance: "500", updated_at: "" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/locale-context", () => ({
  useLocale: () => ({ locale: "ru", setLocale: vi.fn() }),
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

import { ThreadSidebar } from "@/components/thread-sidebar";

describe("ThreadSidebar", () => {
  beforeEach(() => {
    mocks.pathname = "/chat";
    localStorage.clear();
    window.scrollTo = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    mocks.push.mockReset();
    mocks.threads.mockReset().mockResolvedValue({ results: [], count: 0 });
  });

  afterEach(cleanup);

  it("collapses with its button and remembers the preference", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Свернуть боковую панель" }));

    expect(screen.getByRole("complementary").getAttribute("data-collapsed")).toBe("true");
    expect(localStorage.getItem("lumenza:sidebar-collapsed:desktop")).toBe("true");
  });

  it("uses the dedicated Studio mark in the primary navigation", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    const studioLink = screen.getByRole("link", { name: "Студия" });
    expect(
      studioLink.querySelector('[data-testid="studio-mark"]'),
    ).not.toBeNull();
  });

  it("renders an Agents entry pointing at the agents catalog", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    expect(screen.getByRole("link", { name: "Агенты" }).getAttribute("href")).toBe(
      "/agents",
    );
  });

  it("keeps the Agents entry reachable when the sidebar is collapsed", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Свернуть боковую панель" }));

    expect(screen.getByRole("link", { name: "Агенты" }).getAttribute("href")).toBe(
      "/agents",
    );
  });

  it("expands Studio as a folder with actionable categories", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    const toggle = screen.getByRole("button", {
      name: "Развернуть категории Студии",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: /Создание/i })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /Создание/i }).getAttribute("href"))
      .toBe("/studio?mode=images");
    expect(screen.getByRole("link", { name: /Работа/i }).getAttribute("href"))
      .toBe("/studio?mode=documents");
    expect(screen.getByRole("link", { name: /Исследование/i }).getAttribute("href"))
      .toBe("/studio?mode=analyze");
  });

  it("keeps the Studio folder open while the Studio route is active", async () => {
    mocks.pathname = "/studio";

    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    expect(
      screen.getByRole("button", { name: "Свернуть категории Студии" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("link", { name: "Студия", current: "page" }))
      .toBeDefined();
    expect(screen.getByRole("link", { name: /Создание/i })).toBeDefined();
  });

  it("closes the Studio folder after returning to chat", async () => {
    mocks.pathname = "/studio";
    const { rerender } = render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    mocks.pathname = "/chat";
    rerender(<ThreadSidebar />);

    expect(
      screen.getByRole("button", { name: "Развернуть категории Студии" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Создание/i })).toBeNull(),
    );
  });

  it("toggles with Command/Ctrl+B", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: "b", metaKey: true });

    expect(screen.getByRole("complementary").getAttribute("data-collapsed")).toBe("true");
  });

  it("starts compact on a mobile viewport without a saved preference", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    render(<ThreadSidebar />);

    await waitFor(() =>
      expect(screen.getByRole("complementary").getAttribute("data-collapsed")).toBe("true"),
    );
    expect(screen.getByRole("button", { name: "Показать боковую панель" })).toBeDefined();
  });

  it("does not inherit a legacy desktop expansion on a mobile viewport", async () => {
    localStorage.setItem("lumenza:sidebar-collapsed", "false");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    render(<ThreadSidebar />);

    await waitFor(() =>
      expect(screen.getByRole("complementary").getAttribute("data-collapsed")).toBe("true"),
    );
  });
});
