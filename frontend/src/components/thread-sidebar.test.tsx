import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("renders a Knowledge entry pointing at /knowledge", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    expect(screen.getByRole("link", { name: "Знания" }).getAttribute("href")).toBe(
      "/knowledge",
    );
  });

  it("renders an Automations entry pointing at /automations", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    expect(
      screen.getByRole("link", { name: "Автоматизации" }).getAttribute("href"),
    ).toBe("/automations");
  });

  it("renders a Chat entry in the mode switcher pointing at /chat", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    expect(screen.getByRole("link", { name: "Чат" }).getAttribute("href")).toBe(
      "/chat",
    );
  });

  it("marks the active mode in the Chat/Agents/Knowledge switcher via aria-current", async () => {
    mocks.pathname = "/agents";

    render(<ThreadSidebar />);

    expect(screen.getByRole("link", { name: "Агенты" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Чат" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Знания" }).getAttribute("aria-current")).toBeNull();
  });

  it("does not mix ordinary chat history into the Agents workspace", async () => {
    mocks.pathname = "/agents";
    mocks.threads.mockResolvedValue({
      count: 1,
      results: [{ id: 17, title: "Секретный обычный чат" }],
    });

    render(<ThreadSidebar />);

    expect(mocks.threads).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Чаты" })).toBeNull();
    expect(screen.queryByText("Секретный обычный чат")).toBeNull();
    expect(screen.getByRole("link", { name: "Новый запуск агента" }).getAttribute("href"))
      .toBe("/agents");
  });

  it("keeps a Chat entry reachable when the sidebar is collapsed", async () => {
    render(<ThreadSidebar />);
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Свернуть боковую панель" }));

    expect(screen.getByRole("link", { name: "Чат" }).getAttribute("href")).toBe(
      "/chat",
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
    expect(screen.getByRole("link", { name: /Image/i }).getAttribute("href"))
      .toBe("/studio?mode=image");
    expect(screen.getByRole("link", { name: /Video/i }).getAttribute("href"))
      .toBe("/studio?mode=video");
    expect(screen.getByRole("link", { name: /Audio/i }).getAttribute("href"))
      .toBe("/studio?mode=audio");
    expect(screen.getByRole("link", { name: /Edit/i }).getAttribute("href"))
      .toBe("/studio?mode=edit");
    expect(screen.getByRole("link", { name: /Upscale/i }).getAttribute("href"))
      .toBe("/studio?mode=upscale");
    expect(screen.getByRole("link", { name: "All Tools" }).getAttribute("href"))
      .toBe("/studio?view=tools");
    expect(screen.getByRole("link", { name: "Apps" }).getAttribute("href"))
      .toBe("/studio?view=apps");
    expect(screen.getByRole("link", { name: "Community" }).getAttribute("href"))
      .toBe("/studio?view=community");
  });

  it("opens contextual Studio flyouts on hover and keyboard focus", async () => {
    render(<ThreadSidebar />);
    fireEvent.click(await screen.findByRole("button", { name: "Развернуть категории Студии" }));

    fireEvent.mouseEnter(screen.getByRole("link", { name: /Image/i }));
    expect(screen.getByRole("dialog", { name: "Image tools" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Create image" }).getAttribute("href")).toBe("/studio?mode=image");

    fireEvent.focus(screen.getByRole("link", { name: "All Tools" }));
    expect(screen.getByRole("dialog", { name: "All Tools overview" })).toBeDefined();
  });

  it("returns focus to a Studio flyout trigger after Escape", async () => {
    render(<ThreadSidebar />);
    fireEvent.click(await screen.findByRole("button", { name: "Развернуть категории Студии" }));
    const imageLink = screen.getByRole("link", { name: /Image/i });

    fireEvent.focus(imageLink);
    const flyout = screen.getByRole("dialog", { name: "Image tools" });
    const firstTool = within(flyout).getByRole("link", { name: "Create image" });
    firstTool.focus();
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Image tools" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(imageLink));
  });

  it("keeps the Studio folder open while the Studio route is active", async () => {
    mocks.pathname = "/studio";

    render(<ThreadSidebar />);

    expect(
      screen.getByRole("button", { name: "Свернуть категории Студии" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("link", { name: "Студия", current: "page" }))
      .toBeDefined();
    expect(screen.getByRole("link", { name: /Image/i })).toBeDefined();
  });

  it("closes the Studio folder after returning to chat", async () => {
    mocks.pathname = "/studio";
    const { rerender } = render(<ThreadSidebar />);

    mocks.pathname = "/chat";
    rerender(<ThreadSidebar />);

    expect(
      screen.getByRole("button", { name: "Развернуть категории Студии" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Image/i })).toBeNull(),
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
