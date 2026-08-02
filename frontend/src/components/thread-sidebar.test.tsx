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
    await screen.findByRole("navigation", { name: "Разделы" });

    fireEvent.click(screen.getByRole("button", { name: "Свернуть боковую панель" }));

    expect(screen.getByRole("complementary").getAttribute("data-collapsed")).toBe("true");
    expect(localStorage.getItem("lumenza:sidebar-collapsed:desktop")).toBe("true");
  });

  it("uses the dedicated Studio mark in the primary navigation", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    const studioLink = screen.getByRole("link", { name: "Студия" });
    expect(
      studioLink.querySelector('[data-testid="studio-mark"]'),
    ).not.toBeNull();
  });

  it("renders an Agents entry pointing at the agents catalog", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    expect(screen.getByRole("link", { name: "Агенты" }).getAttribute("href")).toBe(
      "/agents",
    );
  });

  it("renders a Knowledge entry pointing at /knowledge", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    expect(screen.getByRole("link", { name: "Знания" }).getAttribute("href")).toBe(
      "/knowledge",
    );
  });

  it("renders an Automations entry pointing at /automations", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    expect(
      screen.getByRole("link", { name: "Автоматизации" }).getAttribute("href"),
    ).toBe("/automations");
  });

  it("renders Chat in the same primary navigation as the other products", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    expect(screen.getByRole("link", { name: "Чат" }).getAttribute("href")).toBe(
      "/chat",
    );
  });

  it("marks the active product via aria-current", async () => {
    mocks.pathname = "/agents";

    render(<ThreadSidebar />);

    expect(screen.getByRole("link", { name: "Агенты" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Чат" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Знания" }).getAttribute("aria-current")).toBeNull();
  });

  it("does not mix ordinary chat history or route actions into the Agents workspace", async () => {
    mocks.pathname = "/agents";
    mocks.threads.mockResolvedValue({
      count: 1,
      results: [{ id: 17, title: "Секретный обычный чат" }],
    });

    render(<ThreadSidebar />);

    expect(mocks.threads).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Чаты" })).toBeNull();
    expect(screen.queryByText("Секретный обычный чат")).toBeNull();
    expect(screen.queryByRole("link", { name: "Новый запуск агента" })).toBeNull();
  });

  it("keeps a Chat entry reachable when the sidebar is collapsed", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    fireEvent.click(screen.getByRole("button", { name: "Свернуть боковую панель" }));

    expect(screen.getByRole("link", { name: "Чат" }).getAttribute("href")).toBe(
      "/chat",
    );
  });

  it("keeps the Agents entry reachable when the sidebar is collapsed", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    fireEvent.click(screen.getByRole("button", { name: "Свернуть боковую панель" }));

    expect(screen.getByRole("link", { name: "Агенты" }).getAttribute("href")).toBe(
      "/agents",
    );
  });

  it("keeps every product in one flat navigation without section dividers", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

    const navigation = screen.getByRole("navigation", { name: "Разделы" });
    const expected = [
      ["Чат", "/chat"],
      ["Агенты", "/agents"],
      ["Знания", "/knowledge"],
      ["Студия", "/studio"],
      ["Автоматизации", "/automations"],
      ["История", "/history"],
      ["All Tools", "/tools"],
      ["Apps", "/studio?view=apps"],
      ["Community", "/studio?view=community"],
    ] as const;

    expected.forEach(([label, href]) => {
      expect(within(navigation).getByRole("link", { name: label }).getAttribute("href"))
        .toBe(href);
    });
    expect(screen.queryByText("Apps", { selector: "p" })).toBeNull();
    expect(screen.queryByRole("button", { name: /категории Студии/i })).toBeNull();
  });

  it.each(["/chat", "/agents", "/knowledge", "/studio", "/automations", "/history"])(
    "keeps the complete product superset unchanged on %s without route-specific New or Recent chrome",
    async (pathname) => {
      mocks.pathname = pathname;

      render(<ThreadSidebar />);

      const navigation = await screen.findByRole("navigation", { name: "Разделы" });
      const expected = [
        ["Чат", "/chat"],
        ["Агенты", "/agents"],
        ["Знания", "/knowledge"],
        ["Студия", "/studio"],
        ["All Tools", "/tools"],
        ["Apps", "/studio?view=apps"],
        ["Community", "/studio?view=community"],
        ["Автоматизации", "/automations"],
        ["История", "/history"],
      ] as const;

      expected.forEach(([label, href]) => {
        expect(within(navigation).getByRole("link", { name: label }).getAttribute("href"))
          .toBe(href);
      });
      expect(screen.queryByRole("link", { name: /новый чат/i })).toBeNull();
      expect(screen.queryByRole("link", { name: /новый запуск агента/i })).toBeNull();
      expect(screen.queryByRole("navigation", { name: "Чаты" })).toBeNull();
      expect(screen.queryByText("Недавние")).toBeNull();
    },
  );

  it("opens the full Studio flyout from the flat Studio row", async () => {
    render(<ThreadSidebar />);

    const studioTrigger = await screen.findByRole("link", { name: "Студия" });
    expect(studioTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(studioTrigger.getAttribute("aria-controls")).toBe("sidebar-flyout-studio");
    fireEvent.mouseEnter(await screen.findByTestId("sidebar-item-studio"));
    const studioDialog = screen.getByRole("dialog", { name: "Studio tools" });
    expect(studioDialog.id).toBe("sidebar-flyout-studio");
    expect(studioTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Create image" }).getAttribute("href")).toBe("/studio?mode=image");
    expect(screen.getByRole("link", { name: "Create video" }).getAttribute("href")).toBe("/studio?mode=video");
    expect(screen.getByRole("link", { name: "Text to speech" }).getAttribute("href")).toBe("/studio?mode=audio");

    fireEvent.focus(screen.getByRole("link", { name: "All Tools" }));
    expect(screen.getByRole("dialog", { name: "All Tools overview" })).toBeDefined();
  });

  it("returns focus to a flyout trigger after Escape", async () => {
    render(<ThreadSidebar />);
    const studioLink = await screen.findByRole("link", { name: "Студия" });

    fireEvent.focus(studioLink);
    const flyout = screen.getByRole("dialog", { name: "Studio tools" });
    const firstTool = within(flyout).getByRole("link", { name: "Create image" });
    firstTool.focus();
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Studio tools" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(studioLink));
  });

  it("gives every flat navigation item the same motion behavior", async () => {
    render(<ThreadSidebar />);

    const navigation = await screen.findByRole("navigation", { name: "Разделы" });
    within(navigation).getAllByRole("link").forEach((link) => {
      expect(link.getAttribute("data-sidebar-motion")).toBe("spring");
    });
  });

  it("toggles with Command/Ctrl+B", async () => {
    render(<ThreadSidebar />);
    await screen.findByRole("navigation", { name: "Разделы" });

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
